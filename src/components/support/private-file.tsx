"use client";

import * as React from "react";
import { FileText, Paperclip } from "lucide-react";
import { apiBlob, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { saveFile } from "@/services/account";
import { fileIdFromUrl } from "@/services/support";

/**
 * A private file — dispute evidence, a support attachment — is served only
 * through `GET /files/:id` with the session's bearer, so the browser cannot
 * draw it from its URL. These fetch it with the token and draw it from an
 * object URL (a picture), or save it (anything else). A public URL from
 * before the private purposes is drawn or opened as it is.
 */
export function PrivateFileImage({ url, fileId, alt, className }: { url?: string | null; fileId?: string | null; alt: string; className?: string }) {
    const id = fileId ?? fileIdFromUrl(url);
    const [objectUrl, setObjectUrl] = React.useState<{ id: string; url: string } | null>(null);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        if (!id) return;
        let cancelled = false;
        let made: string | null = null;
        apiBlob(`/files/${encodeURIComponent(id)}`)
            .then((blob) => {
                if (cancelled) return;
                made = URL.createObjectURL(blob);
                setObjectUrl({ id, url: made });
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
            if (made) URL.revokeObjectURL(made);
        };
    }, [id]);

    const resolved = id ? (objectUrl?.id === id ? objectUrl.url : null) : (url ?? null);
    if (!resolved) return <div className={cn("flex items-center justify-center bg-ground text-xs text-dim", className)} role="img" aria-label={alt}>{failed ? "Could not load" : ""}</div>;
    return <img src={resolved} alt={alt} className={className} />;
}

/** A file row that downloads with the bearer when it is private, and opens in a new tab when it is public. */
export function PrivateFileLink({ url, fileId, name, className, onError }: { url?: string | null; fileId?: string | null; name: string; className?: string; onError?: (message: string) => void }) {
    const id = fileId ?? fileIdFromUrl(url);
    const [busy, setBusy] = React.useState(false);
    const pdf = /\.pdf$/i.test(name);
    const inner = (
        <>
            {pdf ? <FileText className="size-4 shrink-0" aria-hidden /> : <Paperclip className="size-4 shrink-0" aria-hidden />}
            <span className="truncate">{busy ? "Opening…" : name}</span>
        </>
    );
    const classes = cn("inline-flex max-w-full items-center gap-2 text-sm font-medium underline-offset-4 hover:underline", className);
    if (!id) {
        return url ? (
            <a href={url} target="_blank" rel="noreferrer" className={classes}>
                {inner}
            </a>
        ) : (
            <span className={classes}>{inner}</span>
        );
    }
    return (
        <button
            type="button"
            className={classes}
            disabled={busy}
            onClick={async () => {
                setBusy(true);
                try {
                    saveFile(await apiBlob(`/files/${encodeURIComponent(id)}`), name);
                } catch (caught) {
                    onError?.(messageOf(caught, "Could not open that file."));
                } finally {
                    setBusy(false);
                }
            }}
        >
            {inner}
        </button>
    );
}
