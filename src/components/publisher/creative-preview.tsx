import { FileText } from "lucide-react";
import { Panel } from "@/components/workspace/page-heading";
import { CardTitle } from "@/components/publisher/parts";
import { creativeKind } from "@/services/publisher-bookings";

/**
 * "What they are running": the advertiser's artwork on the booking
 * (`designUrl`) — a picture, a video for a screen, or a file to open — and
 * the brief they wrote beside it. Nothing is drawn when neither exists.
 */
export function CreativePreview({ designUrl, brief, title = "What they are running", awaiting = true }: { designUrl: string | null | undefined; brief?: string | null; title?: string; awaiting?: boolean }) {
    const kind = creativeKind(designUrl);
    if (!kind && !brief?.trim()) return null;
    return (
        <Panel>
            <CardTitle>{title}</CardTitle>
            {kind === "image" && (
                <a href={designUrl!} target="_blank" rel="noopener noreferrer" className="mt-3 block overflow-hidden rounded-md bg-ground">
                    <img src={designUrl!} alt="The advertiser's artwork" className="max-h-[320px] w-full object-contain" />
                </a>
            )}
            {kind === "video" && <video src={designUrl!} controls muted playsInline className="mt-3 max-h-[320px] w-full rounded-md bg-ground" />}
            {(kind === "pdf" || kind === "file") && (
                <a href={designUrl!} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-3 rounded-md border border-line px-4 py-3 text-sm font-medium text-ink hover:border-ink">
                    <FileText className="size-5 text-dim" aria-hidden />
                    Open the artwork{kind === "pdf" ? " (PDF)" : ""}
                </a>
            )}
            {!kind && awaiting && <p className="mt-2 text-sm text-dim">The artwork is not on the booking yet. It appears here once the advertiser's creative is approved.</p>}
            {brief?.trim() && (
                <p className="mt-3 whitespace-pre-line rounded-md bg-ground px-3 py-2 text-sm text-dim">
                    <span className="font-medium text-ink">The advertiser&apos;s brief:</span> {brief}
                </p>
            )}
        </Panel>
    );
}
