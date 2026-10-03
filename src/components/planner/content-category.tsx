"use client";

import * as React from "react";
import { ChoiceRow } from "@/components/planner/fields";
import { plannerService, type ContentCategory } from "@/services/planner";

/**
 * Lot D (Q138): what the advertisement is about, from the seeded content
 * categories (`GET /campaigns/content-categories`). Venues decide which
 * categories they carry, and the desk checks every booked spot against the
 * answer — so it is asked with the brand, and a campaign without one is
 * flagged at review rather than refused here. Pressing the chosen one again
 * clears it.
 */
export function ContentCategoryQuestion({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
    const [state, setState] = React.useState<{ rows: ContentCategory[] | null; failed: boolean }>({ rows: null, failed: false });

    React.useEffect(() => {
        let cancelled = false;
        plannerService
            .contentCategories()
            .then((rows) => {
                if (!cancelled) setState({ rows, failed: false });
            })
            .catch(() => {
                if (!cancelled) setState({ rows: null, failed: true });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div>
            <h3 className="text-lg font-semibold leading-6 text-ink">What is the ad about?</h3>
            <p className="mt-2 text-sm text-dim">Venues decide which categories they carry — a school refuses alcohol, a clinic refuses gambling. ADX checks every space you book against this, so the answer has to be honest.</p>
            <div className="mt-4">
                {state.failed ? (
                    <p className="text-sm text-dim">The categories could not be loaded. You can carry on; ADX asks again before the artwork is reviewed.</p>
                ) : state.rows === null ? (
                    <p className="text-sm text-dim">Loading the categories…</p>
                ) : state.rows.length === 0 ? (
                    <p className="text-sm text-dim">ADX has not set up any categories yet.</p>
                ) : (
                    <div role="radiogroup" aria-label="What is the ad about?" className="grid gap-2.5 md:grid-cols-2">
                        {state.rows.map((category) => (
                            <ChoiceRow
                                key={category.id}
                                title={category.name}
                                description={category.isSensitive ? "Sensitive — some venues refuse it, and ADX checks each space." : undefined}
                                selected={value === category.id}
                                onSelect={() => onChange(value === category.id ? null : category.id)}
                                radio
                                compact
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
