"use client";

import * as React from "react";
import { FileText, Upload, X } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ATTACHMENT_MAX_MB, attachmentProblem, supportService } from "@/services/support";

export interface PickedAttachment {
    name: string;
    id: string | null;
    url: string | null;
    busy: boolean;
}

/**
 * The dashed "Browse files" box for a support attachment: the file goes up
 * the moment it is picked (private SUPPORT_ATTACHMENT — only the ticket's
 * two sides open it), so the ticket is created with its URL and never with
 * a file still in flight.
 */
export function AttachmentPicker({
    value,
    onChange,
    onError,
    label = "Browse files",
    accept = "image/*,application/pdf",
    className,
}: {
    value: PickedAttachment | null;
    onChange: (next: PickedAttachment | null) => void;
    onError: (message: string | null) => void;
    label?: string;
    accept?: string;
    className?: string;
}) {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        const tooBig = attachmentProblem(file);
        if (tooBig) return onError(tooBig);
        onError(null);
        onChange({ name: file.name, id: null, url: null, busy: true });
        try {
            const stored = await supportService.upload(file);
            onChange({ name: file.name, id: stored.id, url: stored.url, busy: false });
        } catch (caught) {
            onChange(null);
            onError(messageOf(caught, "The upload did not go through."));
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <div className={className}>
            {value ? (
                <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3">
                    <span className="flex size-10 items-center justify-center rounded-md bg-ground text-dim">
                        <FileText className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{value.name}</p>
                        <p className="text-xs text-dim">{value.busy ? "Uploading…" : "Stored privately — only you and ADX Support can open it"}</p>
                    </div>
                    <button type="button" onClick={() => onChange(null)} aria-label="Remove file" className="flex size-7 items-center justify-center rounded-full text-dim hover:text-ink">
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault();
                        void pick(event.dataTransfer.files[0]);
                    }}
                    className={cn("flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#c9c9c6] bg-[#f6f6f4] px-6 py-6 text-center transition-colors hover:border-dim")}
                >
                    <Upload className="size-5 text-ink" aria-hidden />
                    <span className="mt-2 text-sm text-ink">{label}</span>
                    <span className="mt-0.5 text-xs text-dim">Image or PDF · max {ATTACHMENT_MAX_MB} MB</span>
                </button>
            )}
            <input ref={inputRef} type="file" accept={accept} className="sr-only" aria-label={label} onChange={(event) => void pick(event.target.files?.[0])} />
        </div>
    );
}
