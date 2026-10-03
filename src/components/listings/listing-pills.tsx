import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { rightsPill, verificationPill } from "./listing-model";

type PillRow = {
    status: string;
    instantBooking?: boolean;
    belowFloor?: boolean;
    rightsBasis?: "OWNED" | "LEASED" | "LICENSED" | "PERMIT" | null;
    rightsValidUntil?: string | null;
    rightsLapsedAt?: string | null;
    removability?: "PERMANENT" | "REMOVABLE" | null;
    verificationExpiresAt?: string | null;
};

const TONE = {
    warning: "border-warning/40 bg-warning-soft text-warning",
    danger: "border-danger/40 bg-danger-soft text-danger",
    brand: "border-brand/20 bg-brand-soft text-brand",
} as const;

function Pill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
    return <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium", TONE[tone])}>{children}</span>;
}

/**
 * The small pills under a space's name, as the app's listing card draws them:
 * the verification falling due or lapsed (QR-26), the lease, licence or
 * permit ending or ended (QR-24), the instant-booking bolt (Lot D — only
 * while the flag is on, since off it is a promise the platform is not
 * keeping), and "Below floor" (Lot E, the row's own `belowFloor`).
 */
export function ListingPills({ row, instant, className }: { row: PillRow; instant: boolean; className?: string }) {
    const verification = verificationPill({ status: row.status, removability: row.removability ?? null, verificationExpiresAt: row.verificationExpiresAt ?? null });
    const rights = rightsPill(row);
    const bolt = instant && row.instantBooking === true;
    if (!verification && !rights && !bolt && row.belowFloor !== true) return null;
    return (
        <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
            {verification && <Pill tone={verification.tone}>{verification.label}</Pill>}
            {rights && <Pill tone={rights.tone}>{rights.label}</Pill>}
            {bolt && (
                <Pill tone="brand">
                    <Zap className="size-3 fill-current" aria-hidden />
                    Accepts bookings automatically
                </Pill>
            )}
            {row.belowFloor === true && <Pill tone="warning">Below floor</Pill>}
        </div>
    );
}
