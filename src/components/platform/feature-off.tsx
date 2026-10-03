"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { KILL_SWITCHES, PLURAL_SWITCH_NAMES, useSwitchedOff } from "@/lib/flags";

/**
 * The page-side half of a kill switch (lib/flags.tsx has the reading). A
 * section the backend guards with `requireFeature(key)` is wrapped in
 * `FeatureGate`: while the platform has the feature switched off — the flags
 * answer says so, or a call just came back 503 FEATURE_OFF — the section is
 * not mounted, so it calls nothing, and one plain line stands in its place.
 * Its entry points (a nav item, a tile, a button) hide on the same reading.
 */

/** The line a switched-off section shows: "<Feature> is switched off for now." ("are" for a plural name). */
export function featureOffLine(name: string, plural = false): string {
    return `${name} ${plural ? "are" : "is"} switched off for now.`;
}

/** One plain line in the section's place, and whatever the page offers instead (a request form, the wallet). A `name` given here is read as singular unless `plural`. */
export function FeatureOff({ name, flag, plural, children, className }: { name?: string; flag?: string; plural?: boolean; children?: React.ReactNode; className?: string }) {
    const label = name ?? (flag ? KILL_SWITCHES[flag] : undefined) ?? "This feature";
    const are = plural ?? (name === undefined && !!flag && PLURAL_SWITCH_NAMES.has(flag));
    return (
        <div role="status" data-feature-off={flag ?? ""} className={cn("rounded-lg border border-line bg-white px-5 py-4 text-sm text-ink", className)}>
            <p>{featureOffLine(label, are)}</p>
            {children && <div className="mt-2 text-dim">{children}</div>}
        </div>
    );
}

/**
 * The section while its switch is on (or not known to be off); the plain
 * line while it is off. `off` replaces the line when the section has a
 * better thing to say, `name` the words in it.
 */
export function FeatureGate({ flag, name, off, className, children }: { flag: string; name?: string; off?: React.ReactNode; className?: string; children: React.ReactNode }) {
    const switchedOff = useSwitchedOff(flag);
    if (!switchedOff) return <>{children}</>;
    return <>{off ?? <FeatureOff flag={flag} name={name} className={className} />}</>;
}
