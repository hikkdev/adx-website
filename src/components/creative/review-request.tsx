"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { creativeHref, type CreativeProps } from "@/components/creative/creative-screen";
import { useSpotCards } from "@/components/creative/use-spot-cards";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import { messageOf } from "@/lib/api-client";
import { artworkSpec, audienceLabel, briefOf, creativesService, stanceNote } from "@/services/creatives";
import { planPrefs, plannerHref, type ContentCategory } from "@/services/planner";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/**
 * 03 · Review design request (5204:68616): the artwork each selected
 * space needs — print or digital, at the space's size, with what the
 * space says about the campaign's content — and the brief as written,
 * with its "Edit brief". "Send design request" records the brief and the
 * audience on the campaign, which is what the ADX desk's design list reads.
 */
export function ReviewRequest({ campaign, save }: CreativeProps) {
    const router = useRouter();
    const spots = campaign.spots.filter((spot) => spot.status !== "CANCELLED");
    const cards = useSpotCards(spots);
    const brief = briefOf(campaign);
    const notes = planPrefs.read(campaign.id).designNotes;
    const [rules, setRules] = React.useState<{ key: string; byListing: Record<string, { contentCategoryId: string; stance: string }[]>; categories: ContentCategory[] }>({ key: "", byListing: {}, categories: [] });
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const listingKey = spots.map((s) => s.listingId).sort().join(",");
    React.useEffect(() => {
        if (!listingKey || !campaign.contentCategoryId) return;
        let cancelled = false;
        Promise.all([
            Promise.all(listingKey.split(",").map((id) => creativesService.contentRules(id).then((rows) => [id, rows] as const).catch(() => [id, []] as const))),
            creativesService.contentCategories().catch(() => [] as ContentCategory[]),
        ]).then(([pairs, categories]) => {
            if (!cancelled) setRules({ key: listingKey, byListing: Object.fromEntries(pairs), categories });
        });
        return () => {
            cancelled = true;
        };
    }, [listingKey, campaign.contentCategoryId]);

    const categoryName = rules.categories.find((c) => c.id === campaign.contentCategoryId)?.name ?? null;
    const count = spots.length;
    const countWord = WORDS[count] ?? String(count);

    const submit = async () => {
        if (!brief || busy) return;
        setBusy(true);
        setError(null);
        try {
            await save({ creative: { creativePath: "ADX_DESIGN_AGENCY", creativeConfig: brief }, ...(campaign.persona ? { persona: campaign.persona } : {}), step: Math.max(campaign.step, 13) });
            router.push(creativeHref(campaign.id, "sent"));
        } catch (caught) {
            setError(messageOf(caught, "Could not send the design request."));
            setBusy(false);
        }
    };

    return (
        <>
            <TaskCard title="Review your design request" intro={count > 0 ? `Send a brief for the artwork your ${countWord} selected space${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""}.` : "Choose the spaces this campaign will run on, then send a brief for the artwork they need."}>
                <h3 className="text-base font-semibold text-ink">Artwork to be designed</h3>
                {count === 0 ? (
                    <p className="mt-3 text-sm text-dim">
                        No spaces selected yet.{" "}
                        <Link href={plannerHref(campaign.id, "spaces")} className="font-medium text-brand underline underline-offset-2">
                            Choose ad spaces
                        </Link>
                    </p>
                ) : (
                    <ul className="mt-3 space-y-2">
                        {spots.map((spot) => {
                            const spec = artworkSpec(spot, cards[spot.listingId] ?? null);
                            const note = rules.key === listingKey ? stanceNote(rules.byListing[spot.listingId] ?? [], campaign.contentCategoryId, categoryName) : null;
                            return (
                                <li key={spot.id} className="text-sm text-ink">
                                    {spot.listing.title} · {spec.kind}
                                    {spec.size ? ` · ${spec.size}` : " · size to be confirmed"}
                                    {note && <span className="ml-2 rounded bg-[#fff8e6] px-2 py-0.5 text-xs font-medium text-[#8a5a00]">{note}</span>}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div className="mt-6 rounded-lg bg-ground px-4 py-5">
                    {brief ? (
                        <>
                            <p className="text-lg font-semibold leading-6 text-ink">{brief.objective}</p>
                            <p className="mt-3 text-sm text-ink">Audience · {audienceLabel(campaign.persona) ?? "Not chosen yet"}</p>
                            <p className="mt-3 text-sm text-ink">{brief.keyMessage}</p>
                            {notes && <p className="mt-3 text-sm text-dim">Notes · {notes}</p>}
                        </>
                    ) : (
                        <p className="text-sm text-dim">No brief written yet.</p>
                    )}
                    <Link href={creativeHref(campaign.id, "brief")} className="mt-4 inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:border-ink">
                        Edit brief
                    </Link>
                </div>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: creativeHref(campaign.id, "audience") }} next={{ label: "Send design request", onClick: submit, disabled: !brief || count === 0, busy }} />
        </>
    );
}
