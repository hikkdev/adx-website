import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { requestedLine, type KycRequestStamp } from "@/services/verification";

/**
 * Lot N-M — "Requested by ADX on <date>": the strip a verification page
 * draws when the desk asked for the record (the `requestedAt` stamp on the
 * party's own KYC row), with the desk's note under it when the row carries
 * one. Nothing when the desk never asked, or the record is through.
 */
export function RequestedByAdx({ record, className }: { record: KycRequestStamp | null | undefined; className?: string }) {
    const line = requestedLine(record);
    if (!line) return null;
    const note = record?.requestNote?.trim() || null;
    return (
        <div className={cn("flex items-start gap-2.5 rounded-md bg-info-soft px-4 py-3", className)}>
            <Bell className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <div>
                <p className="text-sm font-semibold text-info">{line}</p>
                {note && <p className="mt-0.5 text-sm text-ink">{note}</p>}
            </div>
        </div>
    );
}
