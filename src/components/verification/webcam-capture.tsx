"use client";

import * as React from "react";
import { Camera, Circle, Square } from "lucide-react";
import { brandButton, outlineButton } from "@/components/publisher/parts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { baseMime, LIVENESS_MAX_SECONDS, recorderMime } from "@/services/verification";

type Mode = "photo" | "video";

/** What went wrong asking for the camera, in words the person can act on. */
function cameraProblem(caught: unknown): string {
    const name = caught instanceof DOMException ? caught.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "The browser was not allowed to use your camera. Allow camera access for this site (the camera icon in the address bar), or upload a file instead.";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this computer. Upload a file instead.";
    if (name === "NotReadableError") return "The camera is in use by another app. Close it and try again, or upload a file instead.";
    return "Could not start the camera. Upload a file instead.";
}

/**
 * The web's front camera: a selfie taken now, or the liveness clip (Lot D,
 * Q131) recorded now — what the app does with the phone's front camera,
 * done with the computer's webcam (`getUserMedia`, `MediaRecorder`).
 *
 * The clip is recorded as MP4, the format ADX's upload takes. A browser
 * that can only record WebM is told so plainly and pointed at the file
 * upload beside the button — never handed a clip the desk cannot open.
 * The camera is let go the moment the dialog closes.
 */
export function WebcamCapture({ mode, open, onOpenChange, onCaptured, description }: { mode: Mode; open: boolean; onOpenChange: (open: boolean) => void; onCaptured: (file: File) => void; /** The line under the title, when the caller has its own words (the identity check's selfie). */ description?: string }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[560px] rounded-lg border-line p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">{mode === "photo" ? "Take a selfie" : "Record a short video"}</DialogTitle>
                    <DialogDescription className="text-sm text-dim">{description ?? (mode === "photo" ? "Face the camera in good light, both eyes visible." : `Look at the camera and say your name and today’s date. It stops by itself at ${LIVENESS_MAX_SECONDS} seconds.`)}</DialogDescription>
                </DialogHeader>
                {open && (
                    <CameraBody
                        mode={mode}
                        onDone={(file) => {
                            onCaptured(file);
                            onOpenChange(false);
                        }}
                        onCancel={() => onOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function CameraBody({ mode, onDone, onCancel }: { mode: Mode; onDone: (file: File) => void; onCancel: () => void }) {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const streamRef = React.useRef<MediaStream | null>(null);
    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const [problem, setProblem] = React.useState<string | null>(null);
    const [ready, setReady] = React.useState(false);
    const [taken, setTaken] = React.useState<{ file: File; url: string } | null>(null);
    const [recording, setRecording] = React.useState(false);
    const [seconds, setSeconds] = React.useState(0);

    const mime = React.useMemo(() => (mode === "video" && typeof MediaRecorder !== "undefined" ? recorderMime((type) => MediaRecorder.isTypeSupported(type)) : null), [mode]);
    const cannotRecord = mode === "video" && !mime;

    React.useEffect(() => {
        if (cannotRecord) return undefined;
        let cancelled = false;
        if (!navigator.mediaDevices?.getUserMedia) {
            queueMicrotask(() => setProblem("This browser cannot use a camera here. Upload a file instead."));
            return undefined;
        }
        navigator.mediaDevices
            .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: mode === "video" })
            .then((stream) => {
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    void videoRef.current.play().catch(() => undefined);
                }
                setReady(true);
            })
            .catch((caught: unknown) => {
                if (!cancelled) setProblem(cameraProblem(caught));
            });
        return () => {
            cancelled = true;
            if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        };
    }, [mode, cannotRecord]);

    React.useEffect(() => () => {
        if (taken) URL.revokeObjectURL(taken.url);
    }, [taken]);

    // The clip stops by itself at the ceiling.
    React.useEffect(() => {
        if (!recording) return undefined;
        const started = Date.now();
        const timer = window.setInterval(() => {
            const elapsed = Math.floor((Date.now() - started) / 1000);
            setSeconds(Math.min(elapsed, LIVENESS_MAX_SECONDS));
            const recorder = recorderRef.current;
            if (elapsed >= LIVENESS_MAX_SECONDS && recorder && recorder.state === "recording") recorder.stop();
        }, 250);
        return () => window.clearInterval(timer);
    }, [recording]);

    const snap = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (!context) return;
        // The preview is mirrored like a mirror; the photo is the camera's own view.
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
            (blob) => {
                if (!blob) return setProblem("Could not take the photo. Try again, or upload a file instead.");
                const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
                setTaken({ file, url: URL.createObjectURL(blob) });
            },
            "image/jpeg",
            0.9
        );
    };

    const start = () => {
        const stream = streamRef.current;
        if (!stream || !mime) return;
        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(stream, { mimeType: mime });
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => {
            setRecording(false);
            // The container the browser wrote: MP4 where it can, WebM otherwise (the liveness upload takes both).
            const type = baseMime(mime);
            const blob = new Blob(chunks, { type });
            if (blob.size === 0) return setProblem("Nothing was recorded. Try again, or upload a file instead.");
            const file = new File([blob], type === "video/webm" ? "liveness.webm" : "liveness.mp4", { type });
            setTaken({ file, url: URL.createObjectURL(blob) });
        };
        recorderRef.current = recorder;
        setSeconds(0);
        setTaken(null);
        recorder.start(500);
        setRecording(true);
    };

    if (cannotRecord) {
        return (
            <div className="grid gap-4">
                <p className="rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">This browser cannot record video. Record the clip on your phone (or in Chrome, Edge, Firefox or Safari) and upload it as an MP4, MOV or WebM file instead.</p>
                <div className="flex justify-end">
                    <button type="button" onClick={onCancel} className={outlineButton}>
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-[#1d1e21]">
                {/* The live view stays mounted under a preview, so a retake finds the camera still attached. */}
                <video ref={videoRef} muted playsInline className={cn("size-full -scale-x-100 object-cover", taken && "invisible")} />
                {taken &&
                    (mode === "photo" ? (
                        <img src={taken.url} alt="Your selfie" className="absolute inset-0 size-full object-cover" />
                    ) : (
                        <video src={taken.url} controls playsInline className="absolute inset-0 size-full object-cover" />
                    ))}
                {!ready && !taken && !problem && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting the camera…</p>}
                {recording && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
                        <Circle className="size-2.5 fill-brand-bright text-brand-bright" aria-hidden />
                        {seconds}s / {LIVENESS_MAX_SECONDS}s
                    </span>
                )}
            </div>
            {problem && (
                <p role="alert" className="text-sm text-danger">
                    {problem}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={onCancel} className={outlineButton}>
                    Cancel
                </button>
                {taken ? (
                    <>
                        <button type="button" onClick={() => setTaken(null)} className={outlineButton}>
                            {mode === "photo" ? "Retake" : "Record again"}
                        </button>
                        <button type="button" onClick={() => onDone(taken.file)} className={brandButton}>
                            {mode === "photo" ? "Use this photo" : "Use this video"}
                        </button>
                    </>
                ) : mode === "photo" ? (
                    <button type="button" onClick={snap} disabled={!ready} className={cn(brandButton, "gap-2")}>
                        <Camera className="size-4" aria-hidden />
                        Take photo
                    </button>
                ) : recording ? (
                    <button type="button" onClick={() => recorderRef.current?.state === "recording" && recorderRef.current.stop()} className={cn(brandButton, "gap-2")}>
                        <Square className="size-4" aria-hidden />
                        Stop
                    </button>
                ) : (
                    <button type="button" onClick={start} disabled={!ready} className={cn(brandButton, "gap-2")}>
                        <Circle className="size-4" aria-hidden />
                        Start recording
                    </button>
                )}
            </div>
        </div>
    );
}
