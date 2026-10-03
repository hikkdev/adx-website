"use client";

import * as React from "react";
import { Camera, CheckCircle2, Flag, Loader2, Upload, Video } from "lucide-react";
import { WebcamCapture } from "@/components/verification/webcam-capture";
import { cn } from "@/lib/utils";
import { acceptFor, fileProblem } from "@/services/verification";

/** One tile's upload, as the page keeps it: the file's name, the URL and id the upload answered, whether it is still going up. */
export interface TileEntry {
    name: string;
    url?: string;
    id?: string;
    busy: boolean;
    error?: string;
}

/**
 * One document on a verification page — the app's `DocumentDropzone` on the
 * web. A photo or scan is picked (or dropped) and handed up to be uploaded
 * at once; a tile marked `camera` also takes a selfie from the webcam, and
 * one marked `video` records the liveness clip with it — each with the file
 * upload beside it as the fallback. A flagged tile wears what the reviewer
 * said about the last one; an inert tile (a passport's back) takes nothing.
 */
export function DocumentTile({
    label,
    hint,
    entry,
    onFile,
    flag = null,
    inert = false,
    pdf = false,
    camera = false,
    video = false,
    selected = false,
    className,
}: {
    label: string;
    hint: string;
    entry: TileEntry | null | undefined;
    onFile: (file: File) => void;
    /** The reviewer's note on a flagged tile ("" when flagged with no note), or null. */
    flag?: string | null;
    inert?: boolean;
    pdf?: boolean;
    camera?: boolean;
    video?: boolean;
    /** One of several alternatives, and the one chosen. */
    selected?: boolean;
    className?: string;
}) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [problem, setProblem] = React.useState<string | null>(null);
    const [webcam, setWebcam] = React.useState(false);
    const done = Boolean(entry?.url);
    const busy = entry?.busy ?? false;
    const kind = { video, pdf };

    const take = (file: File | undefined) => {
        if (!file) return;
        const wrong = fileProblem(file, kind);
        setProblem(wrong);
        if (!wrong) onFile(file);
        if (inputRef.current) inputRef.current.value = "";
    };

    const error = problem ?? entry?.error ?? null;
    const typeLine = video ? "MP4 or MOV, up to 15 seconds" : pdf ? "JPG, PNG or PDF, up to 10MB" : "JPG or PNG, up to 10MB";

    return (
        <div className={cn("flex flex-col rounded-lg border bg-white p-4", selected || done ? "border-ink" : "border-line", inert && "opacity-70", className)}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{label}</p>
                    {/* Two lines kept for the hint, so the boxes of a row line up whatever their hints run to. */}
                    <p className="mt-0.5 min-h-8 text-xs leading-4 text-dim">{hint}</p>
                </div>
                {done && <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Uploaded" />}
            </div>

            {flag !== null && (
                <p className="mt-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                    <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{flag ? `ADX asked for this again: ${flag}` : "ADX asked for this again."}</span>
                </p>
            )}

            {inert ? (
                <p className="mt-3 rounded-md bg-ground px-3 py-3 text-xs text-dim">Nothing to upload here.</p>
            ) : (
                <>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            take(event.dataTransfer.files[0]);
                        }}
                        className={cn("mt-3 flex w-full flex-1 flex-col items-center justify-center rounded-md border border-dashed px-4 py-5 text-center transition-colors disabled:opacity-60", done ? "border-success/40 bg-success-soft/40" : "border-[#c9c9c6] bg-[#f6f6f4] hover:border-dim")}
                    >
                        {busy ? <Loader2 className="size-5 animate-spin text-ink" aria-hidden /> : <Upload className="size-5 text-ink" aria-hidden />}
                        <span className="mt-2 max-w-full truncate text-sm text-ink">{busy ? "Uploading…" : done ? (entry?.name ?? "Uploaded") : video ? "Upload a clip" : "Browse files"}</span>
                        <span className="mt-0.5 text-xs text-dim">{done ? "Stored privately · choose another to replace it" : typeLine}</span>
                    </button>
                    {(camera || video) && (
                        <button type="button" onClick={() => setWebcam(true)} disabled={busy} className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-ink disabled:opacity-50">
                            {video ? <Video className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
                            {video ? (done ? "Record again with your webcam" : "Record with your webcam") : done ? "Retake with your webcam" : "Take it with your webcam"}
                        </button>
                    )}
                    <input ref={inputRef} type="file" accept={acceptFor(kind)} className="sr-only" aria-label={`${label}: choose a file`} onChange={(event) => take(event.target.files?.[0])} />
                    {(camera || video) && (
                        <WebcamCapture
                            mode={video ? "video" : "photo"}
                            open={webcam}
                            onOpenChange={setWebcam}
                            onCaptured={(file) => {
                                setProblem(null);
                                onFile(file);
                            }}
                        />
                    )}
                </>
            )}

            {error && (
                <p role="alert" className="mt-2 text-xs text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}
