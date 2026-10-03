"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchPrivateFile, isPrivateFileUrl, openPrivateFile, privateFileMessage } from "@/lib/private-file";

/**
 * ST-2 (28 Sep 2026): the two pieces every screen draws a stored file with
 * — a picture and a link — over `@/lib/private-file`. A venue paper, an
 * audience report or a KYC scan lives at `/api/v1/files/:id` and opens only
 * with the bearer; a public photo is drawn and linked as it always was.
 */

type Loaded = { src: string; href: string | null; error: string | null };

/**
 * A picture off the backend. A private file is fetched with the session's
 * bearer and drawn from an object URL; a refusal is said in the frame
 * ("You can't open this file.") rather than drawn as a broken image.
 */
export function PrivateImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
    const isPrivate = isPrivateFileUrl(src);
    const [loaded, setLoaded] = React.useState<Loaded | null>(null);

    React.useEffect(() => {
        if (!src || !isPrivate) return;
        let cancelled = false;
        let made: string | null = null;
        fetchPrivateFile(src)
            .then((blob) => {
                if (cancelled) return;
                made = URL.createObjectURL(blob);
                setLoaded({ src, href: made, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setLoaded({ src, href: null, error: privateFileMessage(caught) });
            });
        return () => {
            cancelled = true;
            if (made) URL.revokeObjectURL(made);
        };
    }, [src, isPrivate]);

    if (!src) return <div className={cn("bg-ground", className)} role="img" aria-label={alt} />;
    if (!isPrivate) return <img src={src} alt={alt} className={className} />;

    const mine = loaded?.src === src ? loaded : null;
    if (mine?.href) return <img src={mine.href} alt={alt} className={className} />;
    if (mine?.error) {
        return (
            <div className={cn("flex items-center justify-center bg-ground p-2 text-center text-xs text-dim", className)} role="img" aria-label={alt} title={mine.error}>
                {mine.error}
            </div>
        );
    }
    return <div className={cn("animate-pulse bg-ground", className)} role="img" aria-label={alt} aria-busy="true" />;
}

/**
 * A stored file as a link. A public URL is an ordinary new-tab link; a
 * private one is a button that fetches the file with the bearer and shows
 * it in a new tab (or saves it). A refusal goes to `onError` when the
 * screen has a place for it, and to a toast when it does not.
 */
export function PrivateFileLink({
    url,
    name,
    className,
    children,
    onError,
}: {
    url: string;
    /** The name a saved copy gets, and the link's text when there are no children. */
    name: string;
    className?: string;
    children?: React.ReactNode;
    onError?: (message: string) => void;
}) {
    const [busy, setBusy] = React.useState(false);
    const label = children ?? name;

    if (!isPrivateFileUrl(url)) {
        return (
            <a href={url} target="_blank" rel="noreferrer" className={className}>
                {label}
            </a>
        );
    }

    const open = async () => {
        setBusy(true);
        try {
            await openPrivateFile(url, name);
        } catch (caught) {
            const message = privateFileMessage(caught);
            if (onError) onError(message);
            else toast.error(message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <button type="button" onClick={() => void open()} disabled={busy} aria-busy={busy} className={cn("text-left disabled:opacity-60", className)}>
            {label}
        </button>
    );
}
