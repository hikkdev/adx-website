"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brandButton, outlineButton } from "@/components/publisher/parts";
import type { PublisherReadiness } from "@/services/publisher-workspace";
import { missingWords, readinessAction } from "./home-model";

/**
 * QR-3: the listing door. Until the basics are in, "Add ad space" answers
 * with what is missing and the way to add it, instead of opening a wizard
 * whose submit the server would refuse (409 PROFILE_INCOMPLETE). With no
 * readiness on the read (an older backend) the door is always open.
 */
export function ListingDoor({ readiness, label = "Add ad space", className = brandButton }: { readiness: PublisherReadiness | null | undefined; label?: string; className?: string }) {
    const [open, setOpen] = React.useState(false);
    const canList = readiness ? readiness.canList : true;
    if (canList) {
        return (
            <Link href="/publisher/listings/new" className={className}>
                {label}
            </Link>
        );
    }
    const action = readiness ? readinessAction(readiness) : null;
    return (
        <>
            <button type="button" onClick={() => setOpen(true)} className={className}>
                {label}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[460px] rounded-lg border-line p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-ink">Add your details first</DialogTitle>
                        <DialogDescription className="text-sm text-dim">
                            ADX needs your {readiness ? missingWords(readiness) : "details"} before you can list a space. Spaces you add are reviewed by ADX; verified profiles and their spaces are shown first to advertisers.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 flex justify-end gap-3">
                        <button type="button" onClick={() => setOpen(false)} className={outlineButton}>
                            Not now
                        </button>
                        <Link href={action?.href ?? "/publisher/profile"} className={brandButton}>
                            Complete your details
                        </Link>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
