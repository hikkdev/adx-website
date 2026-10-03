"use client";

import { Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { FLAG_INSTANT_BOOKING, useFeature } from "@/lib/flags";
import { usePublisher } from "@/app/publisher/layout";

/**
 * "Accept bookings automatically" — the instant-booking opt-in (Lot D,
 * Q6/Q105), the app's `InstantBookingSwitch`, with the same three states:
 *
 * - the `instant-booking` flag off for this account: nothing is drawn — the
 *   server answers 409 FEATURE_OFF to a listing that opts in;
 * - on, but no address on the publisher: drawn, off, disabled, and the line
 *   under it says why (an accepted booking needs somewhere to send the
 *   agent; the server refuses NO_MEETING_PLACE);
 * - on, with an address: the switch, off by default.
 *
 * The owner's caution is printed whatever the state, unless the console's
 * variant is `recommended`.
 */

export const INSTANT_BOOKING_CAUTION = "ADX recommends reviewing each booking. Switched on, an advertiser's booking is accepted the moment it is placed — you still choose who installs it.";
export const INSTANT_BOOKING_PLAIN = "Switched on, an advertiser's booking is accepted the moment it is placed — you still choose who installs it.";
export const NO_ADDRESS_REASON = "Add your address in Business profile first — an accepted booking needs somewhere to send the agent.";

export type MeetingPlace = { address?: string | null; city?: string | null; state?: string | null };

/** A street address, else a city and a state — the same fallback the accept screen uses. */
export function hasMeetingPlace(place: MeetingPlace | null | undefined): boolean {
    if (!place) return false;
    if (place.address && place.address.trim() !== "") return true;
    return Boolean(place.city && place.city.trim() !== "" && place.state && place.state.trim() !== "");
}

export function instantBookingGate(enabled: boolean, place: MeetingPlace | null | undefined): { shown: boolean; enabled: boolean; reason: string | null } {
    if (!enabled) return { shown: false, enabled: false, reason: null };
    if (!hasMeetingPlace(place)) return { shown: true, enabled: false, reason: NO_ADDRESS_REASON };
    return { shown: true, enabled: true, reason: null };
}

export const instantBookingCaution = (variant: string | null | undefined): string => (variant === "recommended" ? INSTANT_BOOKING_PLAIN : INSTANT_BOOKING_CAUTION);

/** Whether the flag is on for this account — the wizard strips the column from a create when it is not. */
export function useInstantBookingOn(): boolean {
    return useFeature(FLAG_INSTANT_BOOKING).enabled;
}

export function InstantBookingSwitch({ value, onChange, className }: { value: boolean; onChange: (next: boolean) => void; className?: string }) {
    const feature = useFeature(FLAG_INSTANT_BOOKING);
    const me = usePublisher() as (ReturnType<typeof usePublisher> & MeetingPlace) | null;
    const gate = instantBookingGate(feature.enabled, me);
    if (!gate.shown) return null;
    const on = value && gate.enabled;
    return (
        <div className={cn("rounded-lg border border-line bg-ground p-4", className)}>
            <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <Zap className={cn("size-4", on && "fill-current")} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">Accept bookings automatically</p>
                    <p className="text-xs text-dim">Advertisers book this space without waiting for you.</p>
                </div>
                <Switch checked={on} disabled={!gate.enabled} onCheckedChange={onChange} aria-label="Accept bookings automatically" className="data-[state=checked]:bg-brand" />
            </div>
            <p className="mt-3 text-xs text-dim">{instantBookingCaution(feature.variant)}</p>
            {gate.reason && <p className="mt-1 text-xs font-medium text-warning">{gate.reason}</p>}
        </div>
    );
}
