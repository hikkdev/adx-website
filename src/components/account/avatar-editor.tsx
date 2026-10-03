"use client";

import * as React from "react";
import { Camera, Minus, Plus } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { btnOutline, btnPrimary, btnSmall } from "@/components/advertiser/bits";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { accountService, clampOffset, coverScale, cropFromView, downscaledSize, initialsOf, type CropRect } from "@/services/account";

/**
 * QR-7 on the web: the profile picture. A disc — the photograph, else the
 * initials — with "Add a photo" / "Change photo" and "Remove". A picked
 * picture opens in a square crop window first (drag it, zoom it); what
 * leaves the page is the picture downscaled to 1600 px and the square as
 * fractions, and the server cuts the 512 px JPEG — one per person — the way
 * it does for the app. The URL it answers goes to `PATCH /users/me`.
 */
export function AvatarEditor({ name, avatarUrl, onChanged }: { name: string | null; avatarUrl: string | null; onChanged: () => void }) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [picked, setPicked] = React.useState<{ url: string; name: string } | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const choose = (file: File | undefined) => {
        if (!file) return;
        setError(null);
        if (!file.type.startsWith("image/")) {
            setError("Choose a picture — a JPEG or a PNG.");
            return;
        }
        setPicked({ url: URL.createObjectURL(file), name: file.name });
        if (inputRef.current) inputRef.current.value = "";
    };

    const close = () => {
        if (picked) URL.revokeObjectURL(picked.url);
        setPicked(null);
    };

    const use = async (blob: Blob, crop: CropRect) => {
        setBusy(true);
        setError(null);
        try {
            const stored = await accountService.uploadAvatar(blob, "avatar.jpg", crop);
            await accountService.updateProfile({ avatarUrl: stored.url });
            close();
            onChanged();
        } catch (caught) {
            setError(messageOf(caught, "Could not save the photo."));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);
        setError(null);
        try {
            await accountService.updateProfile({ avatarUrl: null });
            onChanged();
        } catch (caught) {
            setError(messageOf(caught, "Could not remove the photo."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex items-center gap-4">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} aria-label={avatarUrl ? "Change your photo" : "Add a photo"} className="relative size-20 shrink-0 rounded-full bg-ground">
                {avatarUrl ? <img src={avatarUrl} alt="" className="size-20 rounded-full object-cover" /> : <span className="flex size-20 items-center justify-center text-xl font-semibold text-dim">{initialsOf(name, "")}</span>}
                <span className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full border-2 border-white bg-brand text-white">
                    <Camera className="size-3.5" aria-hidden />
                </span>
            </button>
            <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => inputRef.current?.click()} className={btnSmall} disabled={busy}>
                        {busy && !picked ? "Saving…" : avatarUrl ? "Change photo" : "Add a photo"}
                    </button>
                    {avatarUrl && (
                        <button type="button" onClick={() => void remove()} className={cn(btnSmall, "text-danger")} disabled={busy}>
                            Remove
                        </button>
                    )}
                </div>
                <p className="mt-1.5 text-xs text-dim">Cropped to a square. Shown beside your name to the people you work with on ADX.</p>
                {error && !picked && (
                    <p role="alert" className="mt-1 text-xs text-danger">
                        {error}
                    </p>
                )}
            </div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a photo" onChange={(event) => choose(event.target.files?.[0])} />
            {picked && <CropDialog src={picked.url} busy={busy} error={error} onCancel={close} onUse={(blob, crop) => void use(blob, crop)} />}
        </div>
    );
}

const WINDOW = 280;
const MAX_ZOOM = 4;

/** The square window over the picture: drag to move it, the slider or the buttons to zoom. The window is the crop. */
function CropDialog({ src, busy, error, onCancel, onUse }: { src: string; busy: boolean; error: string | null; onCancel: () => void; onUse: (blob: Blob, crop: CropRect) => void }) {
    const [image, setImage] = React.useState<HTMLImageElement | null>(null);
    const [failed, setFailed] = React.useState(false);
    const [zoom, setZoom] = React.useState(1);
    const [offset, setOffset] = React.useState({ x: 0, y: 0 });
    const drag = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

    React.useEffect(() => {
        const img = new Image();
        img.onload = () => {
            const scale = coverScale(WINDOW, img.naturalWidth, img.naturalHeight);
            setOffset({ x: (WINDOW - img.naturalWidth * scale) / 2, y: (WINDOW - img.naturalHeight * scale) / 2 });
            setImage(img);
        };
        img.onerror = () => setFailed(true);
        img.src = src;
    }, [src]);

    const base = image ? coverScale(WINDOW, image.naturalWidth, image.naturalHeight) : 1;
    const scale = base * zoom;

    const clampTo = React.useCallback(
        (next: { x: number; y: number }, atScale: number) => (image ? { x: clampOffset(next.x, WINDOW, image.naturalWidth, atScale), y: clampOffset(next.y, WINDOW, image.naturalHeight, atScale) } : next),
        [image]
    );

    /** Zooms about the window's centre, so the part in the middle stays in the middle. */
    const zoomTo = (next: number) => {
        if (!image) return;
        const bounded = Math.min(MAX_ZOOM, Math.max(1, next));
        const nextScale = base * bounded;
        const centre = WINDOW / 2;
        const imageX = (centre - offset.x) / scale;
        const imageY = (centre - offset.y) / scale;
        setZoom(bounded);
        setOffset(clampTo({ x: centre - imageX * nextScale, y: centre - imageY * nextScale }, nextScale));
    };

    const onPointerDown = (event: React.PointerEvent) => {
        (event.target as Element).setPointerCapture?.(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    };
    const onPointerMove = (event: React.PointerEvent) => {
        if (!drag.current) return;
        setOffset(clampTo({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y }, scale));
    };
    const onPointerUp = () => {
        drag.current = null;
    };

    const confirm = async () => {
        if (!image) return;
        const crop = cropFromView({ window: WINDOW, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight, scale, offsetX: offset.x, offsetY: offset.y });
        const size = downscaledSize(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, size.width, size.height);
        context.drawImage(image, 0, 0, size.width, size.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
        if (blob) onUse(blob, crop);
    };

    return (
        <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
            <DialogContent className="max-w-[400px] rounded-lg border-line p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">Crop your photo</DialogTitle>
                    <DialogDescription className="text-sm text-dim">Drag the picture and zoom until your face sits in the circle.</DialogDescription>
                </DialogHeader>
                <div className="flex justify-center">
                    <div
                        className="relative touch-none select-none overflow-hidden rounded-md bg-ground"
                        style={{ width: WINDOW, height: WINDOW, cursor: image ? "grab" : "default" }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                    >
                        {image && <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: offset.x, top: offset.y, width: image.naturalWidth * scale, height: image.naturalHeight * scale }} />}
                        {image && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />}
                        {!image && <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-dim">{failed ? "This picture could not be opened here. Use a JPEG or a PNG." : "Opening the picture…"}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => zoomTo(zoom - 0.25)} className="flex size-8 items-center justify-center rounded-md border border-line text-ink hover:border-ink disabled:opacity-50" disabled={!image || zoom <= 1} aria-label="Zoom out">
                        <Minus className="size-4" aria-hidden />
                    </button>
                    <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(event) => zoomTo(Number(event.target.value))} disabled={!image} aria-label="Zoom" className="flex-1 accent-[#bd2020]" />
                    <button type="button" onClick={() => zoomTo(zoom + 0.25)} className="flex size-8 items-center justify-center rounded-md border border-line text-ink hover:border-ink disabled:opacity-50" disabled={!image || zoom >= MAX_ZOOM} aria-label="Zoom in">
                        <Plus className="size-4" aria-hidden />
                    </button>
                </div>
                {error && (
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onCancel} className={btnOutline} disabled={busy}>
                        Cancel
                    </button>
                    <button type="button" onClick={() => void confirm()} className={btnPrimary} disabled={busy || !image}>
                        {busy ? "Saving…" : "Use this photo"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
