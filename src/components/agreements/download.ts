import { agreements } from "@/services/agreements";

/**
 * Saves a private file — a signed copy, the document sent for signature —
 * which the backend serves only through `GET /files/:id` with the session's
 * bearer, so a plain link cannot fetch it. The blob is handed to the browser
 * as a download and its object URL let go straight after.
 */
export async function saveFile(fileId: string, name: string): Promise<void> {
    const blob = await agreements.file(fileId);
    const url = URL.createObjectURL(blob);
    try {
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
}
