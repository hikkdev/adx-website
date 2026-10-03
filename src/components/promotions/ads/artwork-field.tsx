"use client";

import * as React from "react";
import { ImageUp } from "lucide-react";
import { btnOutline } from "@/components/advertiser/bits";
import { artworkProblems, bytesLabel, formatsLabel, imageSize, specSize, type MediaSpec } from "@/services/promotions";

export interface PickedArtwork {
    file: File;
    /** An object URL for the preview; revoked when the pick changes. */
    url: string;
    width: number;
    height: number;
    problems: string[];
}

/**
 * LM-1: the ad's artwork — the slot's spec stated up front (size, formats,
 * the most it may weigh), the file checked in the browser the way the server
 * will check it (format, weight, exact shape within 1%, at least the minimum
 * size) before anything is uploaded. The upload happens when the ad is
 * saved; this only picks and judges.
 */
export function ArtworkField({ spec, picked, onPick, hasExisting }: { spec: MediaSpec | null; picked: PickedArtwork | null; onPick: (next: PickedArtwork | null) => void; hasExisting: boolean }) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [reading, setReading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const pickedRef = React.useRef(picked);
    React.useEffect(() => {
        pickedRef.current = picked;
    });
    React.useEffect(() => () => {
        if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.url);
    }, []);

    const choose = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        setReading(true);
        try {
            const size = await imageSize(file).catch(() => ({ width: 0, height: 0 }));
            const problems = spec ? artworkProblems({ type: file.type, size: file.size, width: size.width, height: size.height }, spec) : [];
            if (size.width === 0 && problems.length === 0) problems.push("That file is not an image the browser can read.");
            if (picked) URL.revokeObjectURL(picked.url);
            onPick({ file, url: URL.createObjectURL(file), width: size.width, height: size.height, problems });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not read that file.");
        } finally {
            setReading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <div data-testid="artwork-field">
            <div className="rounded-md bg-ground px-4 py-3 text-sm text-ink" data-testid="artwork-spec">
                {spec ? (
                    <>
                        <span className="font-semibold">{specSize(spec)}</span> · {formatsLabel(spec.formats)} · up to {bytesLabel(spec.maxBytes)}
                        {(spec.minWidth !== spec.width || spec.minHeight !== spec.height) && <span className="text-dim"> · the same shape at least {spec.minWidth} × {spec.minHeight} px</span>}
                    </>
                ) : (
                    <span className="text-dim">Choose a slot to see the artwork size it takes.</span>
                )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <input ref={inputRef} type="file" accept={spec?.formats.join(",") || "image/*"} className="sr-only" aria-label="Artwork file" onChange={(event) => void choose(event.target.files?.[0])} disabled={!spec} />
                <button type="button" onClick={() => inputRef.current?.click()} disabled={!spec || reading} className={btnOutline}>
                    <ImageUp className="mr-2 size-4" aria-hidden />
                    {reading ? "Reading…" : picked || hasExisting ? "Replace artwork" : "Choose artwork"}
                </button>
                {picked && (
                    <span className="min-w-0 truncate text-sm text-dim">
                        {picked.file.name} · {picked.width > 0 ? `${picked.width} × ${picked.height} px · ` : ""}
                        {bytesLabel(picked.file.size)}
                    </span>
                )}
                {!picked && hasExisting && <span className="text-sm text-dim">The artwork already on this ad is kept unless you replace it.</span>}
            </div>
            {error && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {error}
                </p>
            )}
            {picked && picked.problems.length > 0 && (
                <ul role="alert" className="mt-3 space-y-1 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger" data-testid="artwork-problems">
                    {picked.problems.map((problem) => (
                        <li key={problem}>{problem}</li>
                    ))}
                </ul>
            )}
            {picked && picked.problems.length === 0 && <p className="mt-2 text-sm text-success">It fits the slot. ADX checks it again when it is uploaded.</p>}
        </div>
    );
}
