import { apiBlob, ApiError } from "./api-client";

/**
 * ST-2 (28 Sep 2026): the one door for opening a file the backend keeps
 * private. Venue papers and audience reports (purpose VERIFICATION) join
 * the KYC files on private storage: their URL is `${BASE_URL}/api/v1/files/:id`,
 * answered only with the session's bearer — to the owner, the desk, the
 * party's agent under a live grant, and the field agent sent to the listing.
 * A bare `<a href>` or `<img src>` on such a URL is a 401, so anything that
 * shows one goes through here: the file is fetched with the token (the
 * route may answer a 302 to where the bytes are, so the redirect is
 * followed) and handed back as an object URL.
 *
 * A URL that is not one of ADX's `/files/:id` — a public listing photo, a
 * paper filed before ST-2 and not yet moved — is passed through untouched
 * and opened the way it always was.
 */

/** `/api/v1/files/:id` on any host, or the bare `/files/:id` path the API sometimes answers. */
const PRIVATE_FILE = /(?:^|\/api\/v1)\/files\/([A-Za-z0-9_-]+)\/?(?:[?#]|$)/;

/** The file id inside a private-file URL, or null for anything else (a public URL, a blob:, a data:). */
export function privateFileIdOf(url: string | null | undefined): string | null {
    if (!url) return null;
    const match = PRIVATE_FILE.exec(url);
    return match ? match[1]! : null;
}

/** Whether the URL is one the backend answers only with the bearer. */
export const isPrivateFileUrl = (url: string | null | undefined): boolean => privateFileIdOf(url) !== null;

/** The sentences a screen shows when a private file will not open. */
export const PRIVATE_FILE_MESSAGES = {
    forbidden: "You can't open this file.",
    gone: "That file is no longer on ADX.",
    signedOut: "Sign in again to open this file.",
    failed: "Could not open this file. Try again.",
} as const;

/** A private file the backend refused, with the sentence to show for it. */
export class PrivateFileError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "PrivateFileError";
        this.status = status;
    }
}

/** What to say for any failure opening a file: a 403 is "You can't open this file." */
export function privateFileMessage(caught: unknown): string {
    if (caught instanceof PrivateFileError) return caught.message;
    if (caught instanceof ApiError) {
        if (caught.status === 403) return PRIVATE_FILE_MESSAGES.forbidden;
        if (caught.status === 404 || caught.status === 410) return PRIVATE_FILE_MESSAGES.gone;
        if (caught.status === 401) return PRIVATE_FILE_MESSAGES.signedOut;
        /* The network or a cold-starting server: the client's own sentence says which. */
        if (caught.status === 0) return caught.message;
    }
    return PRIVATE_FILE_MESSAGES.failed;
}

/** The bytes of a private file, fetched with the session's bearer. Throws a `PrivateFileError`. */
export async function fetchPrivateFile(url: string): Promise<Blob> {
    const id = privateFileIdOf(url);
    if (!id) throw new PrivateFileError(400, PRIVATE_FILE_MESSAGES.failed);
    try {
        return await apiBlob(`/files/${encodeURIComponent(id)}`, { redirect: "follow" });
    } catch (caught) {
        throw new PrivateFileError(caught instanceof ApiError ? caught.status : 0, privateFileMessage(caught));
    }
}

/**
 * Something an `<img src>` or an `<a href>` can hold: an object URL over a
 * private file's bytes (release it when done), or a public URL as it is.
 */
export async function resolveFileHref(url: string): Promise<{ href: string; release: () => void }> {
    if (!isPrivateFileUrl(url)) return { href: url, release: () => undefined };
    const href = URL.createObjectURL(await fetchPrivateFile(url));
    return { href, release: () => URL.revokeObjectURL(href) };
}

/**
 * What the browser may show in a tab of its own. An object URL runs in the
 * website's origin, so only kinds that cannot carry script are opened in
 * place — never an SVG or an HTML page; anything else is saved instead.
 */
const VIEWABLE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]);

const EXTENSION: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "text/csv": "csv",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** The name a saved copy gets: the one given, with an extension from the bytes when it has none. */
export function downloadNameFor(name: string, mimeType: string): string {
    const base = name.trim() || "document";
    if (/\.[A-Za-z0-9]{2,5}$/.test(base)) return base;
    const extension = EXTENSION[mimeType.split(";")[0]!.trim().toLowerCase()];
    return extension ? `${base}.${extension}` : base;
}

function saveBlob(blob: Blob, name: string): void {
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = downloadNameFor(name, blob.type);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/**
 * Opens a file the way a person expects: a public URL in a new tab as
 * before; a private one fetched with the bearer, then shown in a new tab
 * (a PDF, a photograph) or saved (anything else, or when the browser
 * blocked the tab). Throws a `PrivateFileError` when the backend refused.
 */
export async function openPrivateFile(url: string, name: string): Promise<void> {
    if (!isPrivateFileUrl(url)) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }
    const blob = await fetchPrivateFile(url);
    const type = blob.type.split(";")[0]!.trim().toLowerCase();
    if (VIEWABLE.has(type)) {
        const href = URL.createObjectURL(new Blob([blob], { type }));
        const opened = window.open(href, "_blank");
        if (opened) {
            opened.opener = null;
            setTimeout(() => URL.revokeObjectURL(href), 60_000);
            return;
        }
        URL.revokeObjectURL(href);
    }
    saveBlob(blob, name);
}
