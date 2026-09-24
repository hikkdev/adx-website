"use client";

import * as React from "react";
import { FileText, PlayCircle, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileKindLabel, fileSizeLabel } from "@/services/booking";

/**
 * The artwork file box (5204:63047): the icon, the file's name and its kind
 * and size; empty, the box asks for a file. The hidden input is what the
 * "Replace file" and "Choose file" buttons open.
 */
export function UploadTile({ file, empty, onPick, busy, accept, className, statusLine }: { file: { fileName: string | null; mimeType?: string | null; fileSize?: number | null; fileUrl?: string | null } | null; empty: string; onPick: (file: File) => void; busy?: boolean; accept: string; className?: string; statusLine?: React.ReactNode }) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const video = file ? /video|mp4|mov/i.test(`${file.mimeType ?? ""} ${file.fileName ?? ""}`) : false;
    const Icon = file ? (video ? PlayCircle : FileText) : Upload;

    return (
        <div className={className}>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="sr-only"
                onChange={(event) => {
                    const picked = event.target.files?.[0];
                    if (picked) onPick(picked);
                    event.target.value = "";
                }}
            />
            <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className={cn("flex w-full items-center gap-4 rounded-md border px-4 py-4 text-left", file ? "border-line bg-white" : "border-dashed border-line bg-white hover:border-ink", busy && "opacity-60")}
            >
                <Icon className="size-6 shrink-0 text-dim" aria-hidden />
                {file ? (
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{file.fileName ?? "Artwork file"}</span>
                        <span className="mt-0.5 block text-xs text-dim">
                            {fileKindLabel(file.mimeType, file.fileName)}
                            {fileSizeLabel(file.fileSize) ? ` · ${fileSizeLabel(file.fileSize)}` : ""}
                            {statusLine ? <> · {statusLine}</> : null}
                        </span>
                    </span>
                ) : (
                    <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">{busy ? "Uploading…" : empty}</span>
                        <span className="mt-0.5 block text-xs text-dim">{accept.includes("video") ? "MP4 or MOV up to 50 MB" : "PDF, JPEG or PNG up to 10 MB"}</span>
                    </span>
                )}
            </button>
        </div>
    );
}

/** Reads an image's pixel size or a video's duration in the browser, so the creative row carries them. */
export function measureFile(file: File): Promise<{ widthPx?: number; heightPx?: number; durationMs?: number }> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const done = (value: { widthPx?: number; heightPx?: number; durationMs?: number }) => {
            URL.revokeObjectURL(url);
            resolve(value);
        };
        if (file.type.startsWith("image/")) {
            const img = new Image();
            img.onload = () => done({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
            img.onerror = () => done({});
            img.src = url;
            return;
        }
        if (file.type.startsWith("video/")) {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.onloadedmetadata = () => done({ widthPx: video.videoWidth || undefined, heightPx: video.videoHeight || undefined, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
            video.onerror = () => done({});
            video.src = url;
            return;
        }
        done({});
    });
}
