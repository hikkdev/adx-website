"use client";

import * as React from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { listingEditorService, type UploadPurpose } from "@/services/listing-editor";
import type { StoredFile } from "./form-model";
import { Pill } from "./fields";

/**
 * Files on the two boards go through one door: `POST /upload` with a
 * purpose, then the URL the backend answers is what the listing, the
 * document or the KYC row stores. Photographs are LISTING_PHOTO (public);
 * papers are VERIFICATION, as the app files them.
 */
export function useUploader(purpose: UploadPurpose) {
    const [busy, setBusy] = React.useState(false);
    const upload = React.useCallback(
        async (file: File): Promise<StoredFile | null> => {
            setBusy(true);
            try {
                const stored = await listingEditorService.upload(file, purpose);
                return { url: stored.url, name: file.name };
            } catch (caught) {
                toast.error(messageOf(caught, "The upload did not go through."));
                return null;
            } finally {
                setBusy(false);
            }
        },
        [purpose]
    );
    return { busy, upload };
}

/** The bytes a document may be, per the frames' captions. */
export const MAX_DOC_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function tooBig(file: File, max: number): boolean {
    if (file.size <= max) return false;
    toast.error(`${file.name} is over ${Math.round(max / 1024 / 1024)} MB.`);
    return true;
}

/**
 * The dashed drop area (5204:79601, 5204:82615): the upload mark in a red
 * ring, the sentence, the small caption and the red "Browse files". Drop or
 * pick; either way the file goes up at once and the row below shows it.
 */
export function DropZone({
    title,
    caption,
    accept,
    purpose,
    onStored,
    buttonLabel = "Browse files",
    max = MAX_DOC_BYTES,
    ringed = true,
    className,
    compact = false,
}: {
    title: string;
    caption?: string;
    accept: string;
    purpose: UploadPurpose;
    onStored: (file: StoredFile) => void;
    buttonLabel?: string | null;
    max?: number;
    ringed?: boolean;
    className?: string;
    compact?: boolean;
}) {
    const { busy, upload } = useUploader(purpose);
    const [over, setOver] = React.useState(false);
    const input = React.useRef<HTMLInputElement>(null);

    const take = async (file: File | undefined) => {
        if (!file || tooBig(file, max)) return;
        const stored = await upload(file);
        if (stored) onStored(stored);
    };

    return (
        <div
            onDragOver={(event) => {
                event.preventDefault();
                setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
                event.preventDefault();
                setOver(false);
                void take(event.dataTransfer.files[0]);
            }}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") input.current?.click();
            }}
            aria-busy={busy}
            className={cn("flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-white text-center transition-colors", over ? "border-brand bg-brand-soft/40" : "border-line", compact ? "gap-2 py-8" : "gap-3 py-9", className)}
        >
            <input ref={input} type="file" accept={accept} className="sr-only" onChange={(event) => void take(event.target.files?.[0])} />
            {ringed ? (
                <span className="flex size-10 items-center justify-center rounded-full border border-brand text-brand">
                    <Upload className="size-4" aria-hidden />
                </span>
            ) : (
                <Upload className="size-5 text-ink" aria-hidden />
            )}
            <p className="text-sm font-semibold text-ink">{busy ? "Uploading…" : title}</p>
            {caption && <p className="text-xs text-dim">{caption}</p>}
            {buttonLabel && (
                <span className="mt-1 inline-flex h-8 items-center rounded-md bg-brand px-4 text-xs font-semibold text-white">{buttonLabel}</span>
            )}
        </div>
    );
}

/** A stored file as a row: the paper mark, its name, a status pill and Remove (5204:82615). */
export function FileRow({ file, status, onRemove, className }: { file: StoredFile; status?: { label: string; tone: "success" | "warning" | "neutral" }; onRemove?: () => void; className?: string }) {
    return (
        <div className={cn("flex items-center gap-3 rounded-lg border border-line bg-ground px-3 py-2.5", className)}>
            <span className="flex size-8 items-center justify-center rounded-md border border-line bg-white text-ink">
                <FileText className="size-4" aria-hidden />
            </span>
            <a href={file.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:underline">
                {file.name}
            </a>
            {status && <Pill tone={status.tone}>{status.label}</Pill>}
            {onRemove && (
                <button type="button" onClick={onRemove} className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-white px-2 text-xs text-ink hover:border-ink">
                    <Trash2 className="size-3" aria-hidden /> Remove
                </button>
            )}
        </div>
    );
}

/** The plain white bordered button — Browse files, Not applicable, Replace file, I am the owner. */
export function GhostButton({ children, onClick, active, className, disabled }: { children: React.ReactNode; onClick?: () => void; active?: boolean; className?: string; disabled?: boolean }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className={cn("inline-flex h-[42px] min-w-[160px] items-center justify-center rounded-md border bg-white px-5 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:opacity-50", active ? "border-brand-bright text-brand-bright" : "border-line", className)}>
            {children}
        </button>
    );
}

/**
 * A photograph slot (5204:84858): a dashed box with the ringed upload mark
 * and "Choose replacement photo · JPG or PNG", the photo itself once there
 * is one, and the "On file / Not added" word under it.
 */
export function PhotoSlot({ label, file, onChange, hint = "JPG or PNG · Clear, full-size photo", title }: { label: string; file: StoredFile | null; onChange: (next: StoredFile | null) => void; hint?: string; title?: string }) {
    return (
        <div>
            <p className="text-sm font-semibold text-ink">{label}</p>
            <div className="mt-2">
                {file ? (
                    <div className="relative overflow-hidden rounded-lg border border-line bg-ground">
                        <img src={file.url} alt={label} className="h-[200px] w-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-white/90 px-3 py-2">
                            <span className="truncate text-xs text-ink">{file.name}</span>
                            <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-brand">
                                Remove
                            </button>
                        </div>
                    </div>
                ) : (
                    <DropZone title={title ?? "Choose replacement photo"} caption={hint} accept="image/*" purpose="LISTING_PHOTO" buttonLabel={null} max={MAX_PHOTO_BYTES} onStored={onChange} className="h-[200px] py-0" />
                )}
            </div>
            <p className="mt-2 text-sm text-dim">{file ? "On file" : "Not added"}</p>
        </div>
    );
}

/**
 * A venue paper (5204:80756 / 5204:85055): the caps title, a dashed box
 * with the upload mark and "Not added / On file" over the one-line
 * description, and "Replace file" once something is on file.
 */
export function DocumentSlot({ title, description, file, onChange, accept = "application/pdf,image/*" }: { title: string; description: string; file: StoredFile | null; onChange: (next: StoredFile | null) => void; accept?: string }) {
    const { busy, upload } = useUploader("VERIFICATION");
    const input = React.useRef<HTMLInputElement>(null);
    const take = async (picked: File | undefined) => {
        if (!picked || tooBig(picked, MAX_DOC_BYTES)) return;
        const stored = await upload(picked);
        if (stored) onChange(stored);
    };
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-dim">{title}</p>
            <input ref={input} type="file" accept={accept} className="sr-only" onChange={(event) => void take(event.target.files?.[0])} />
            <div
                role="button"
                tabIndex={0}
                onClick={() => input.current?.click()}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") input.current?.click();
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault();
                    void take(event.dataTransfer.files[0]);
                }}
                className="mt-2.5 flex min-h-[86px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#c9c9d6] bg-white px-4 py-5 text-center hover:border-ink"
            >
                <Upload className="size-5 text-ink" aria-hidden />
                <p className="text-sm font-semibold text-ink">{busy ? "Uploading…" : file ? "On file" : "Not added"}</p>
                <p className="text-xs text-dim">{file ? file.name : description}</p>
            </div>
            {file && (
                <div className="mt-3 flex items-center gap-3">
                    <GhostButton onClick={() => input.current?.click()}>Replace file</GhostButton>
                    <button type="button" onClick={() => onChange(null)} className="text-sm text-dim hover:text-ink">
                        Remove
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * A required paper (5204:80949, 5204:81140): the bordered requirement with
 * the Required pill, then Browse files beside the waiver the frame draws
 * ("Not applicable", "I am the owner"), or — the media arrangement — "Not
 * added" at the left and Browse files at the right.
 */
export function RequirementRow({
    title,
    description,
    required,
    file,
    waived,
    waiver,
    onChange,
    onWaive,
    layout = "left",
    accept = "application/pdf,image/*",
}: {
    title: string;
    description: string;
    required: boolean;
    file: StoredFile | null;
    waived: string | null;
    waiver?: string;
    onChange: (next: StoredFile | null) => void;
    onWaive?: (next: string | null) => void;
    layout?: "left" | "media";
    accept?: string;
}) {
    const { busy, upload } = useUploader("VERIFICATION");
    const input = React.useRef<HTMLInputElement>(null);
    const take = async (picked: File | undefined) => {
        if (!picked || tooBig(picked, MAX_DOC_BYTES)) return;
        const stored = await upload(picked);
        if (stored) onChange(stored);
    };
    const state = file ? file.name : waived ? waived : "Not added";
    return (
        <div>
            <input ref={input} type="file" accept={accept} className="sr-only" onChange={(event) => void take(event.target.files?.[0])} />
            <div className="flex items-start justify-between gap-4 rounded-md border border-line bg-white px-2.5 py-2.5">
                <div className="flex min-w-0 items-start gap-3">
                    {layout === "media" && <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px]", file ? "border-brand bg-brand" : "border-line bg-white")} aria-hidden />}
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink">{title}</p>
                        <p className="text-[11px] leading-4 text-dim">{description}</p>
                    </div>
                </div>
                <Pill>{required ? "Required" : "Optional"}</Pill>
            </div>
            <div className={cn("mt-2.5 flex items-center gap-3", layout === "media" && "justify-between")}>
                {layout === "media" && <p className={cn("text-sm", file ? "text-ink" : "text-dim")}>{busy ? "Uploading…" : state}</p>}
                <div className="flex items-center gap-3">
                    <GhostButton onClick={() => input.current?.click()} disabled={busy}>
                        {file ? "Replace file" : "Browse files"}
                    </GhostButton>
                    {waiver && onWaive && (
                        <GhostButton active={waived === waiver} onClick={() => onWaive(waived === waiver ? null : waiver)} className="min-w-[160px]">
                            {waiver}
                        </GhostButton>
                    )}
                    {layout === "left" && (file || waived) && (
                        <span className="flex items-center gap-2 text-sm text-dim">
                            {file ? (
                                <>
                                    <a href={file.url} target="_blank" rel="noreferrer" className="truncate text-ink hover:underline">
                                        {file.name}
                                    </a>
                                    <button type="button" onClick={() => onChange(null)} className="hover:text-ink">
                                        Remove
                                    </button>
                                </>
                            ) : (
                                <span>{waived}</span>
                            )}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

/** The "Upload ›" link row the audience evidence step draws (5204:78629). */
export function EvidenceRow({ title, meta, file, onChange }: { title: string; meta: string; file: StoredFile | null; onChange: (next: StoredFile | null) => void }) {
    const { busy, upload } = useUploader("VERIFICATION");
    const input = React.useRef<HTMLInputElement>(null);
    const take = async (picked: File | undefined) => {
        if (!picked || tooBig(picked, MAX_DOC_BYTES)) return;
        const stored = await upload(picked);
        if (stored) onChange(stored);
    };
    return (
        <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-white px-4 py-2.5">
            <input ref={input} type="file" accept="application/pdf,image/*,.xls,.xlsx,.csv" className="sr-only" onChange={(event) => void take(event.target.files?.[0])} />
            <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">{title}</p>
                <p className="text-[11px] leading-4 text-dim">{file ? file.name : meta}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {file && (
                    <button type="button" onClick={() => onChange(null)} className="text-xs text-dim hover:text-ink">
                        Remove
                    </button>
                )}
                <button type="button" onClick={() => input.current?.click()} disabled={busy} className="text-xs font-semibold text-brand-bright">
                    {busy ? "Uploading…" : file ? "Replace ›" : "Upload ›"}
                </button>
            </div>
        </div>
    );
}
