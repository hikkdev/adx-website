import * as React from "react";

/**
 * A QR encoder for the draft previews on the tracking step (5204:72275).
 *
 * The real codes are issued by the backend when the campaign is paid for
 * and rendered by the QR engine; until then the frame draws a preview of
 * the tagged destination so the artwork can be laid out. Byte mode, error
 * correction M, versions 1–25 — enough for any campaign URL. The algorithm
 * is ISO/IEC 18004's, in the shape of Project Nayuki's reference encoder.
 */

type Ecl = "L" | "M";

const ECL_FORMAT: Record<Ecl, number> = { L: 1, M: 0 };

const ECC_PER_BLOCK: Record<Ecl, number[]> = {
    L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26],
    M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28],
};

const BLOCKS: Record<Ecl, number[]> = {
    L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12],
    M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21],
};

const MAX_VERSION = 25;

function rawDataModules(version: number): number {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
        const align = Math.floor(version / 7) + 2;
        result -= (25 * align - 10) * align - 55;
        if (version >= 7) result -= 36;
    }
    return result;
}

function dataCodewords(version: number, ecl: Ecl): number {
    return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[ecl][version]! * BLOCKS[ecl][version]!;
}

function gfMultiply(x: number, y: number): number {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
}

function rsDivisor(degree: number): number[] {
    const result = new Array<number>(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < result.length; j++) {
            result[j] = gfMultiply(result[j]!, root);
            if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
        }
        root = gfMultiply(root, 0x02);
    }
    return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
    const result = new Array<number>(divisor.length).fill(0);
    for (const b of data) {
        const factor = b ^ result.shift()!;
        result.push(0);
        divisor.forEach((coef, i) => {
            result[i]! ^= gfMultiply(coef, factor);
        });
    }
    return result;
}

function getBit(x: number, i: number): boolean {
    return ((x >>> i) & 1) !== 0;
}

function alignmentPositions(version: number): number[] {
    if (version === 1) return [];
    const align = Math.floor(version / 7) + 2;
    const size = version * 4 + 17;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (align * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < align; pos -= step) result.splice(1, 0, pos);
    return result;
}

export interface QrMatrix {
    size: number;
    /** modules[y][x] */
    modules: boolean[][];
    version: number;
}

/** Encodes UTF-8 text; null when it will not fit in version 25 at level M. */
export function encodeQr(text: string, ecl: Ecl = "M", forceMask?: number): QrMatrix | null {
    const bytes = Array.from(new TextEncoder().encode(text));
    let version = 1;
    for (; ; version++) {
        if (version > MAX_VERSION) return null;
        const capacity = dataCodewords(version, ecl) * 8;
        const needed = 4 + (version <= 9 ? 8 : 16) + bytes.length * 8;
        if (needed <= capacity) break;
    }

    /* Bit stream: mode, count, bytes, terminator, pad to a byte, pad bytes. */
    const bits: number[] = [];
    const push = (value: number, length: number) => {
        for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    push(0x4, 4);
    push(bytes.length, version <= 9 ? 8 : 16);
    for (const b of bytes) push(b, 8);
    const capacityBits = dataCodewords(version, ecl) * 8;
    push(0, Math.min(4, capacityBits - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

    const data: number[] = [];
    bits.forEach((bit, i) => {
        data[i >>> 3] = (data[i >>> 3] ?? 0) | (bit << (7 - (i & 7)));
    });

    /* Error correction, interleaved. */
    const numBlocks = BLOCKS[ecl][version]!;
    const eccLen = ECC_PER_BLOCK[ecl][version]!;
    const rawCodewords = Math.floor(rawDataModules(version) / 8);
    const numShort = numBlocks - (rawCodewords % numBlocks);
    const shortLen = Math.floor(rawCodewords / numBlocks);
    const blocks: number[][] = [];
    const divisor = rsDivisor(eccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
        const datLen = shortLen - eccLen + (i < numShort ? 0 : 1);
        const dat = data.slice(k, k + datLen);
        k += datLen;
        const ecc = rsRemainder(dat, divisor);
        if (i < numShort) dat.push(0);
        blocks.push(dat.concat(ecc));
    }
    const codewords: number[] = [];
    for (let i = 0; i < blocks[0]!.length; i++) {
        blocks.forEach((block, j) => {
            if (i !== shortLen - eccLen || j >= numShort) codewords.push(block[i]!);
        });
    }

    /* The grid. */
    const size = version * 4 + 17;
    const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const set = (x: number, y: number, dark: boolean) => {
        modules[y]![x] = dark;
        isFunction[y]![x] = true;
    };

    for (let i = 0; i < size; i++) {
        set(6, i, i % 2 === 0);
        set(i, 6, i % 2 === 0);
    }
    const finder = (x: number, y: number) => {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const dist = Math.max(Math.abs(dx), Math.abs(dy));
                const xx = x + dx;
                const yy = y + dy;
                if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, dist !== 2 && dist !== 4);
            }
        }
    };
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    const aligns = alignmentPositions(version);
    for (let i = 0; i < aligns.length; i++) {
        for (let j = 0; j < aligns.length; j++) {
            if ((i === 0 && j === 0) || (i === 0 && j === aligns.length - 1) || (i === aligns.length - 1 && j === 0)) continue;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(aligns[i]! + dx, aligns[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
    }

    const drawFormat = (mask: number) => {
        const fmt = (ECL_FORMAT[ecl] << 3) | mask;
        let rem = fmt;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const fbits = ((fmt << 10) | rem) ^ 0x5412;
        for (let i = 0; i <= 5; i++) set(8, i, getBit(fbits, i));
        set(8, 7, getBit(fbits, 6));
        set(8, 8, getBit(fbits, 7));
        set(7, 8, getBit(fbits, 8));
        for (let i = 9; i < 15; i++) set(14 - i, 8, getBit(fbits, i));
        for (let i = 0; i < 8; i++) set(size - 1 - i, 8, getBit(fbits, i));
        for (let i = 8; i < 15; i++) set(8, size - 15 + i, getBit(fbits, i));
        set(8, size - 8, true);
    };
    drawFormat(0);

    if (version >= 7) {
        let rem = version;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        const vbits = (version << 12) | rem;
        for (let i = 0; i < 18; i++) {
            const bit = getBit(vbits, i);
            const a = size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            set(a, b, bit);
            set(b, a, bit);
        }
    }

    /* Codewords in the zigzag. */
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
            for (let j = 0; j < 2; j++) {
                const x = right - j;
                const upward = ((right + 1) & 2) === 0;
                const y = upward ? size - 1 - vert : vert;
                if (!isFunction[y]![x] && i < codewords.length * 8) {
                    modules[y]![x] = getBit(codewords[i >>> 3]!, 7 - (i & 7));
                    i++;
                }
            }
        }
    }

    /* The mask with the lowest penalty. */
    const applyMask = (mask: number) => {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (isFunction[y]![x]) continue;
                let invert = false;
                switch (mask) {
                    case 0: invert = (x + y) % 2 === 0; break;
                    case 1: invert = y % 2 === 0; break;
                    case 2: invert = x % 3 === 0; break;
                    case 3: invert = (x + y) % 3 === 0; break;
                    case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
                    case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
                    case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
                    default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
                }
                if (invert) modules[y]![x] = !modules[y]![x];
            }
        }
    };
    const penalty = (): number => {
        let score = 0;
        for (let y = 0; y < size; y++) {
            let run = 1;
            for (let x = 1; x < size; x++) {
                if (modules[y]![x] === modules[y]![x - 1]) {
                    run++;
                    if (run === 5) score += 3;
                    else if (run > 5) score += 1;
                } else run = 1;
            }
        }
        for (let x = 0; x < size; x++) {
            let run = 1;
            for (let y = 1; y < size; y++) {
                if (modules[y]![x] === modules[y - 1]![x]) {
                    run++;
                    if (run === 5) score += 3;
                    else if (run > 5) score += 1;
                } else run = 1;
            }
        }
        for (let y = 0; y < size - 1; y++) {
            for (let x = 0; x < size - 1; x++) {
                const c = modules[y]![x];
                if (c === modules[y]![x + 1] && c === modules[y + 1]![x] && c === modules[y + 1]![x + 1]) score += 3;
            }
        }
        let dark = 0;
        for (const row of modules) for (const m of row) if (m) dark++;
        const total = size * size;
        const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
        score += k * 10;
        return score;
    };
    let best = forceMask ?? 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let mask = 0; mask < 8 && forceMask === undefined; mask++) {
        applyMask(mask);
        drawFormat(mask);
        const score = penalty();
        if (score < bestScore) {
            bestScore = score;
            best = mask;
        }
        applyMask(mask);
    }
    applyMask(best);
    drawFormat(best);

    return { size, modules, version };
}

/** The SVG path of a matrix — one rect per dark module, with a quiet zone of `margin` modules. */
export function qrPath(matrix: QrMatrix, margin = 2): { path: string; viewBox: number } {
    const parts: string[] = [];
    for (let y = 0; y < matrix.size; y++) {
        for (let x = 0; x < matrix.size; x++) {
            if (matrix.modules[y]![x]) parts.push(`M${x + margin} ${y + margin}h1v1h-1z`);
        }
    }
    return { path: parts.join(""), viewBox: matrix.size + margin * 2 };
}

/** A whole SVG document for a value, for downloading. */
export function qrSvgDocument(value: string, size = 512): string | null {
    const matrix = encodeQr(value);
    if (!matrix) return null;
    const { path, viewBox } = qrPath(matrix);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${viewBox} ${viewBox}" shape-rendering="crispEdges"><rect width="${viewBox}" height="${viewBox}" fill="#fff"/><path d="${path}" fill="#141518"/></svg>`;
}

/** The QR of a value, drawn inline (5204:72275's 136px previews). */
export function QrCode({ value, size = 136, title }: { value: string; size?: number; title?: string }) {
    const matrix = React.useMemo(() => encodeQr(value), [value]);
    if (!matrix) {
        return (
            <div className="flex items-center justify-center rounded bg-ground text-center text-xs text-dim" style={{ width: size, height: size }}>
                Too long for a QR code
            </div>
        );
    }
    const { path, viewBox } = qrPath(matrix);
    return (
        <svg width={size} height={size} viewBox={`0 0 ${viewBox} ${viewBox}`} shapeRendering="crispEdges" role="img" aria-label={title ?? `QR code for ${value}`}>
            <rect width={viewBox} height={viewBox} fill="#fff" />
            <path d={path} fill="#141518" />
        </svg>
    );
}

