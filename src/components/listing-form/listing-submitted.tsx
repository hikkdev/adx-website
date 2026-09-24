"use client";

import * as React from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { listingEditorService, type MyListing } from "@/services/listing-editor";
import { ListingChrome, StepActions, TaskCard } from "./wizard-frame";

/**
 * 24 · Listing in review (5204:81334): the draft and its proof are with
 * ADX; the listing lives in My inventory from here. The title is read off
 * the listing so the page says which spot was sent.
 */
export function ListingSubmitted({ listingId }: { listingId: string | null }) {
    const [listing, setListing] = React.useState<{ key: string; row: MyListing | null }>({ key: "", row: null });

    React.useEffect(() => {
        if (!listingId) return;
        let cancelled = false;
        listingEditorService
            .myListing(listingId)
            .then((row) => {
                if (!cancelled) setListing({ key: listingId, row });
            })
            .catch(() => {
                if (!cancelled) setListing({ key: listingId, row: null });
            });
        return () => {
            cancelled = true;
        };
    }, [listingId]);

    const row = listing.key === listingId ? listing.row : null;
    const statusHref = listingId ? `/publisher/listings/${encodeURIComponent(listingId)}/status` : "/publisher/inventory";

    return (
        <ListingChrome crumb="Add a listing" chapter={4}>
            <TaskCard title="Listing in review" subtitle="Your draft and proof have been submitted. You can follow its progress from My inventory.">
                <p className="text-lg font-semibold text-ink">{row?.title ?? (listingId ? "Your listing" : "Your listing")}</p>
                <span className="mt-5 flex size-8 items-center justify-center rounded-full bg-brand text-white">
                    <Clock className="size-4" aria-hidden />
                </span>
                <p className="mt-4 text-base font-semibold text-ink">Submitted · Pending verification</p>
                <p className="mt-1 text-xs text-dim">ADX will review your listing and supporting proof.</p>
                {row?.displayId && <p className="mt-2 text-xs text-dim">Reference {row.displayId}</p>}
                <p className="mt-3 text-xs text-dim">Saved to</p>
                <Link href="/publisher/inventory" className="mt-1 inline-flex h-7 items-center rounded-full border border-line bg-ground px-3 text-xs font-medium text-ink hover:border-ink">
                    My inventory
                </Link>
            </TaskCard>
            <StepActions back="Back to My inventory" backHref="/publisher/inventory" primary="View review status" primaryHref={statusHref} />
        </ListingChrome>
    );
}
