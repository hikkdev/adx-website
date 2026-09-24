"use client";

import * as React from "react";
import Link from "next/link";
import { Check, FileText } from "lucide-react";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { countWord, listingEditorService, rateLabel, requestedUpdatesOf, reviewStageOf, shortName, type MyListing, type ReviewStage } from "@/services/listing-editor";
import { Note, Problem } from "./fields";
import { ListingChrome, StepActions, TaskCard } from "./wizard-frame";

type State = { key: string; listing: MyListing | null; formatName: string | null; error: string | null };

/**
 * The listing's review, in the three frames' words: 25 · in review
 * (5204:81881) with the three checks, 27 · updates needed (5204:82267)
 * with ADX's requests listed, 28 · approved (5204:82435). A draft not yet
 * sent and a listing not approved use the same card with their own words.
 */
export function ListingStatus({ listingId }: { listingId: string }) {
    const [state, setState] = React.useState<State>({ key: "", listing: null, formatName: null, error: null });

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const listing = await listingEditorService.myListing(listingId);
                if (cancelled) return;
                if (!listing) {
                    setState({ key: listingId, listing: null, formatName: null, error: "That listing is not in your inventory." });
                    return;
                }
                let formatName: string | null = null;
                if (listing.mediaTypeId) {
                    try {
                        const catalogue = await listingEditorService.catalogue();
                        formatName = shortName(catalogue.mediaTypes.find((m) => m.id === listing.mediaTypeId)?.name ?? "") || null;
                    } catch {
                        /* falls back to the sub-type */
                    }
                }
                if (!cancelled) setState({ key: listingId, listing, formatName, error: null });
            } catch (caught) {
                if (!cancelled) setState({ key: listingId, listing: null, formatName: null, error: caught instanceof ApiError && caught.status === 404 ? "That listing is not in your inventory." : messageOf(caught, "Could not load this listing.") });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [listingId]);

    const ready = state.key === listingId;
    const listing = ready ? state.listing : null;
    const overview = `/publisher/listings/${encodeURIComponent(listingId)}`;

    if (!listing) {
        return (
            <ListingChrome crumb="Add a listing" chapter={4}>
                {ready && state.error ? <Problem>{state.error}</Problem> : <TaskCard title="Listing review status" subtitle="Reading the listing…"><div className="h-24" /></TaskCard>}
            </ListingChrome>
        );
    }

    const stage = reviewStageOf(listing);
    const spot = state.formatName ?? listing.subType ?? listing.placement ?? listing.category;

    if (stage === "LIVE") {
        return (
            <ListingChrome crumb="Add a listing" chapter={4}>
                <TaskCard title="" subtitle={undefined} className="[&>h1]:hidden">
                    <span className="flex size-9 items-center justify-center rounded-full bg-brand text-white">
                        <Check className="size-4" strokeWidth={3} aria-hidden />
                    </span>
                    <h1 className="mt-5 text-lg font-semibold text-ink">Listing approved</h1>
                    <p className="mt-1 text-sm text-dim">Your ad space is ready to be discovered and booked.</p>
                    <p className="mt-5 text-base font-semibold text-ink">{listing.title}</p>
                    <dl className="mt-5 space-y-4">
                        <Fact label="Ad spot" value={spot} />
                        <Fact label="Venue" value={[listing.address, listing.city].filter(Boolean).join(", ")} />
                        <Fact label="Pricing" value={rateLabel(listing)} />
                        <Fact label="Status" value="Live for booking" />
                    </dl>
                </TaskCard>
                <StepActions back="Back to My inventory" backHref="/publisher/inventory" primary="View listing" primaryHref={`/spaces/${encodeURIComponent(listing.displayId ?? listing.id)}`} />
            </ListingChrome>
        );
    }

    if (stage === "CHANGES_REQUESTED" || stage === "REJECTED") {
        const updates = requestedUpdatesOf(listing.rejectionReason);
        const rejected = stage === "REJECTED";
        return (
            <ListingChrome crumb="Add a listing" chapter={4}>
                <TaskCard title={rejected ? "This listing was not approved" : "Updates are needed before approval"} subtitle={rejected ? "ADX could not approve this listing as it stands. Its reason is below." : "ADX has requested a few corrections to your listing proof."}>
                    <p className="text-lg font-semibold text-ink">{rejected ? "What ADX said" : `${countWord(updates.length)} update${updates.length === 1 ? "" : "s"} requested`}</p>
                    <div className="mt-5 space-y-3">
                        {updates.length === 0 && <Note>ADX left no written request. Ask from Help & support what to correct.</Note>}
                        {updates.map((update) => (
                            <div key={update.index} className="flex items-start gap-3 rounded-md border border-line bg-white px-3.5 py-3">
                                <FileText className="mt-0.5 size-4 shrink-0 text-brand-bright" aria-hidden />
                                <div>
                                    <p className="text-sm font-semibold text-ink">{update.title}</p>
                                    <p className="mt-0.5 text-xs text-dim">{update.detail}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Note className="mt-5">{rejected ? "You can correct the listing and send it again, or raise the decision with ADX from Help & support." : "Your listing stays in review while these changes are resolved."}</Note>
                </TaskCard>
                <StepActions back="Back to My inventory" backHref="/publisher/inventory" primary={rejected ? "Correct and resend" : "Resolve requested changes"} primaryHref={`${overview}/fixes`} />
            </ListingChrome>
        );
    }

    const checks: { label: string; line: string; done: boolean; current: boolean }[] = [
        { label: "Documents received", line: "Listing documents and owner permission are under review", done: stage !== "DRAFT", current: stage === "DOCUMENT_REVIEW" },
        { label: "Field verification", line: "Location and supporting proof are checked by ADX", done: stage === "FINAL_APPROVAL", current: stage === "FIELD_VERIFICATION" },
        { label: "Final approval", line: "Listing goes live for booking", done: false, current: stage === "FINAL_APPROVAL" },
    ];
    const currentLabel: Record<ReviewStage, string> = { DOCUMENT_REVIEW: "Document review", FIELD_VERIFICATION: "Field verification", FINAL_APPROVAL: "Final approval", LIVE: "Live", CHANGES_REQUESTED: "Updates requested", REJECTED: "Not approved", DRAFT: "Not sent yet", OFF_MARKET: "Off the market" };

    return (
        <ListingChrome crumb="Add a listing" chapter={4}>
            <TaskCard title="Listing review status" subtitle="See the current stage and respond to any requested changes.">
                <p className="text-lg font-semibold text-ink">{listing.title}</p>
                <div className="mt-5 grid grid-cols-2 rounded-md border border-line bg-white">
                    <div className="border-r border-line px-3 py-2.5">
                        <p className="text-xs text-dim">Current stage</p>
                        <p className="mt-1 text-sm font-medium text-ink">{currentLabel[stage]}</p>
                    </div>
                    <div className="px-3 py-2.5">
                        <p className="text-xs text-dim">Updates</p>
                        <p className="mt-1 text-sm font-medium text-ink">{stage === "DRAFT" ? "Finish and send it from the listing" : stage === "OFF_MARKET" ? "Paused by ADX or by you" : "In My inventory"}</p>
                    </div>
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-dim">What we're checking</p>
                <div className="mt-3 space-y-2.5">
                    {checks.map((check) => (
                        <div key={check.label} className="flex items-start gap-3 rounded-md border border-line bg-white px-3.5 py-2.5">
                            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", check.done || check.current ? "bg-brand-bright" : "bg-line")} aria-hidden />
                            <div>
                                <p className="text-xs font-semibold text-ink">{check.label}</p>
                                <p className="text-[11px] text-dim">{check.line}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </TaskCard>
            <StepActions back="Back to My inventory" backHref="/publisher/inventory" primary={stage === "DRAFT" ? "Open the listing" : "View submitted details"} primaryHref={overview} />
        </ListingChrome>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-dim">{label}</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{value}</dd>
        </div>
    );
}
