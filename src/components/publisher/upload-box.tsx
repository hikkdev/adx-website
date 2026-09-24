"use client";

import * as React from "react";
import { FileText, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { messageOf } from "@/lib/api-client";
import { publisherWorkspace, type UploadedFile } from "@/services/publisher-workspace";

type Purpose = "KYC" | "VERIFICATION" | "SUPPORT_ATTACHMENT" | "OTHER";

/**
 * The dashed "Browse files" area the frames draw (5204:91183's attachment
 * box, the proof photos, the KYC documents). Picks a file, posts it to
 * `POST /upload` under its purpose, and hands back `{ id, url }`. A picture
 * shows as a thumbnail once it is stored; a PDF as its name.
 */
export function UploadBox({
    purpose,
    value,
    onChange,
    label = "Browse files",
    hint = "Max 10MB per file",
    accept = "image/*,application/pdf",
    className,
    compact,
}: {
    purpose: Purpose;
    value: UploadedFile | null;
    onChange: (file: UploadedFile | null) => void;
    label?: string;
    hint?: string;
    accept?: string;
    className?: string;
    /** A tile rather than a wide box — the three proof photos. */
    compact?: boolean;
}) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [name, setName] = React.useState<string | null>(null);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        setBusy(true);
        try {
            const stored = await publisherWorkspace.upload(file, purpose);
            setName(file.name);
            onChange(stored);
        } catch (caught) {
            setError(messageOf(caught, "Could not upload the file."));
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    /* A private file (KYC, a support attachment) is served only through `/files/:id` with the bearer, so the browser cannot draw it as a picture. */
    const isPrivate = purpose === "KYC" || purpose === "SUPPORT_ATTACHMENT";
    const isImage = !isPrivate && !!value && (/\.(png|jpe?g|webp|gif|heic)(\?|$)/i.test(value.url) || (name ? /\.(png|jpe?g|webp|gif|heic)$/i.test(name) : false));

    return (
        <div className={className}>
            {value ? (
                <div className={cn("relative overflow-hidden rounded-lg border border-line bg-white", compact ? "aspect-[16/10]" : "flex items-center gap-3 px-4 py-3")}>
                    {isImage ? (
                         
                        <img src={value.url} alt={name ?? "Uploaded photo"} className={cn(compact ? "size-full object-cover" : "size-12 rounded-md object-cover")} />
                    ) : (
                        <span className={cn("flex items-center justify-center rounded-md bg-ground text-dim", compact ? "size-full" : "size-12")}>
                            <FileText className="size-5" aria-hidden />
                        </span>
                    )}
                    {!compact && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">{name ?? "Uploaded file"}</p>
                            <p className="text-xs text-dim">Stored securely</p>
                        </div>
                    )}
                    <button type="button" onClick={() => onChange(null)} aria-label="Remove file" className={cn("flex size-7 items-center justify-center rounded-full bg-white text-dim shadow-card hover:text-ink", compact && "absolute right-2 top-2")}>
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault();
                        void pick(event.dataTransfer.files[0]);
                    }}
                    className={cn("flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#c9c9c6] bg-[#f6f6f4] text-center transition-colors hover:border-dim disabled:opacity-60", compact ? "aspect-[16/10] px-3" : "px-6 py-7")}
                >
                    <Upload className="size-5 text-ink" aria-hidden />
                    <span className="mt-2 text-sm text-ink">{busy ? "Uploading…" : label}</span>
                    <span className="mt-0.5 text-xs text-dim">{hint}</span>
                </button>
            )}
            <input ref={inputRef} type="file" accept={accept} className="sr-only" aria-label={label} onChange={(event) => void pick(event.target.files?.[0])} />
            {error && (
                <p role="alert" className="mt-2 text-xs text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}
