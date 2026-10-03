/**
 * When a photograph was taken, off its own EXIF (listing-data-gaps lot,
 * 3 Oct 2026) — read in the browser before the upload, because the server
 * strips a public image's metadata as it stores it (ST-1).
 *
 * A JPEG's APP1 "Exif" block is a small TIFF: IFD0, then the Exif IFD it
 * points at. The moment is `DateTimeOriginal` (0x9003), else
 * `DateTimeDigitized` (0x9004), else IFD0's `DateTime` (0x0132); the
 * offset is `OffsetTimeOriginal` (0x9011) / `OffsetTime` (0x9010) when the
 * camera wrote one, else India's +05:30 — ADX lists spots in India only.
 * Anything else (a PNG, a screenshot, a file with no EXIF, a broken block)
 * is "not known" — null, never a guess like the file's modified time.
 */

const SOI = 0xffd8;
const APP1 = 0xffe1;
const SOS = 0xffda;
const EXIF_HEADER = 0x45786966; // "Exif"
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_OFFSET_TIME = 0x9010;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const ASCII = 2;
const INDIA = "+05:30";

/** The moment a photograph was taken, as an ISO instant, or null when the file does not say. */
export async function takenAtOf(file: Blob): Promise<string | null> {
    if (file.type && file.type !== "image/jpeg" && file.type !== "image/jpg") return null;
    try {
        const head = await file.slice(0, 256 * 1024).arrayBuffer();
        return exifTakenAt(new DataView(head));
    } catch {
        return null;
    }
}

/** The same, off the bytes — exported for the tests. */
export function exifTakenAt(view: DataView): string | null {
    try {
        if (view.byteLength < 4 || view.getUint16(0) !== SOI) return null;
        let offset = 2;
        while (offset + 4 <= view.byteLength) {
            const marker = view.getUint16(offset);
            if ((marker & 0xff00) !== 0xff00 || marker === SOS) return null;
            const size = view.getUint16(offset + 2);
            if (marker === APP1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === EXIF_HEADER && view.getUint16(offset + 8) === 0) {
                return fromTiff(view, offset + 10, Math.min(view.byteLength, offset + 2 + size));
            }
            offset += 2 + size;
        }
        return null;
    } catch {
        return null;
    }
}

type Entry = { type: number; count: number; at: number };

function fromTiff(view: DataView, start: number, end: number): string | null {
    const order = view.getUint16(start);
    const little = order === 0x4949;
    if (!little && order !== 0x4d4d) return null;
    const u16 = (at: number) => view.getUint16(at, little);
    const u32 = (at: number) => view.getUint32(at, little);
    if (u16(start + 2) !== 42) return null;

    const ifd = (offset: number): Map<number, Entry> => {
        const entries = new Map<number, Entry>();
        const at = start + offset;
        if (offset <= 0 || at + 2 > end) return entries;
        const count = u16(at);
        for (let i = 0; i < count; i += 1) {
            const entry = at + 2 + i * 12;
            if (entry + 12 > end) break;
            entries.set(u16(entry), { type: u16(entry + 2), count: u32(entry + 4), at: entry + 8 });
        }
        return entries;
    };
    const ascii = (entry: Entry | undefined): string | null => {
        if (!entry || entry.type !== ASCII || entry.count === 0) return null;
        const from = entry.count > 4 ? start + u32(entry.at) : entry.at;
        if (from + entry.count > end) return null;
        let out = "";
        for (let i = 0; i < entry.count; i += 1) {
            const code = view.getUint8(from + i);
            if (code === 0) break;
            out += String.fromCharCode(code);
        }
        return out.trim() || null;
    };

    const ifd0 = ifd(u32(start + 4));
    const pointer = ifd0.get(TAG_EXIF_IFD);
    const exif = pointer ? ifd(u32(pointer.at)) : new Map<number, Entry>();
    const moment = ascii(exif.get(TAG_DATETIME_ORIGINAL)) ?? ascii(exif.get(TAG_DATETIME_DIGITIZED)) ?? ascii(ifd0.get(TAG_DATETIME));
    const zone = ascii(exif.get(TAG_OFFSET_TIME_ORIGINAL)) ?? ascii(exif.get(TAG_OFFSET_TIME));
    return instantOf(moment, zone);
}

/** "2026:09:30 14:05:09" (+ "+05:30") → an ISO instant; a blank or zeroed camera clock is no answer. */
export function instantOf(moment: string | null, zone: string | null): string | null {
    const match = moment ? /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(moment) : null;
    if (!match || match[1] === "0000") return null;
    const offset = zone && /^[+-]\d{2}:\d{2}$/.test(zone) ? zone : INDIA;
    const when = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${offset}`);
    return Number.isNaN(when.getTime()) ? null : when.toISOString();
}
