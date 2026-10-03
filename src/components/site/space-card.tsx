"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Star, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { cart, useCart, type CartDates } from "@/lib/cart";
import { messageOf } from "@/lib/api-client";
import { FLAG_INSTANT_BOOKING, useFlag } from "@/lib/flags";
import { recordClick, useImpression } from "@/lib/promotion-events";
import { cn } from "@/lib/utils";
import { browseService, cardAvailability, distanceLabel, formatChip, isIsoDay, perDay, perWeek, ratingLabel, type BrowseCard } from "@/services/browse";

/**
 * One space on the Explore grid (5204:49982): the photograph, the name, the
 * format chip beside the area, the weekly price, "Add" into the campaign
 * cart, and the heart. The heart is the backend's saved-spaces book, which
 * the app's Saved tab reads too; it needs a session, so a visitor is sent
 * to sign in and brought back.
 *
 * The app's card marks are drawn from the card and only when it has them:
 * the star line once a review is published, the bolt on a spot the
 * publisher accepts automatically (and only while the instant-booking flag
 * is on), the slots left on a screen, the distance when the browse was
 * asked around a point — and the per-day rate under the weekly figure, the
 * unit the filters and the app price in.
 *
 * AV-1: on a dated browse the card says how the dates stand — "Booked on
 * these dates", "Partly booked · 21 of 31 days free" — and its link carries
 * the dates to the listing page, whose calendar checks them.
 *
 * LM-1: a sponsored card (a publisher paid for the place) says so —
 * "Sponsored" on the photograph — and counts its impressions (half on
 * screen for a second, once per page view) and clicks for the publisher.
 * `surface` is the page it is drawn on.
 */
export function SpaceCard({ card, dates, onSavedChange, surface = "WEB_EXPLORE" }: { card: BrowseCard; dates?: CartDates; onSavedChange?: (saved: boolean) => void; surface?: string }) {
    const router = useRouter();
    const { status } = useAuth();
    const { lines } = useCart();
    const instantOn = useFlag(FLAG_INSTANT_BOOKING);
    const [saved, setSaved] = React.useState(card.saved);
    const photos = card.photos ?? [];
    const inCart = lines.some((line) => line.listingId === card.id);
    const area = card.address?.split(",")[0]?.trim() || card.city || null;
    const dated = isIsoDay(dates?.from) || isIsoDay(dates?.to);
    const datesQuery = isIsoDay(dates?.from) && isIsoDay(dates?.to) ? `?from=${dates.from}&to=${dates.to}` : "";
    const href = `/spaces/${encodeURIComponent(card.displayId ?? card.id)}${datesQuery}`;
    const rating = ratingLabel(card.ratingAvg, card.reviewCount);
    const availability = cardAvailability(card, dated);
    const distance = distanceLabel(card.distanceM);
    const promoted = card.sponsored && card.boostId ? { boostId: card.boostId } : null;
    const articleRef = React.useRef<HTMLElement>(null);
    useImpression(articleRef, promoted, surface);
    const onOpen = () => {
        if (promoted) recordClick(promoted, surface);
    };

    const toggleSave = async () => {
        if (status !== "signed-in") {
            router.push(`/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
            return;
        }
        const next = !saved;
        setSaved(next);
        try {
            if (next) await browseService.save(card.id);
            else await browseService.unsave(card.id);
            onSavedChange?.(next);
        } catch (caught) {
            setSaved(!next);
            toast.error(messageOf(caught, next ? "Could not save that space." : "Could not remove that space."));
        }
    };

    const add = () => {
        if (inCart) {
            cart.remove(card.id);
            toast("Removed from your campaign cart");
            return;
        }
        cart.add({ listingId: card.id, title: card.title, photo: photos[0] ?? null, chip: formatChip(card), area, ratePerDay: card.ratePerDay });
        if (dates && (dates.from || dates.to)) cart.setDates(dates);
        toast.success("Added to your campaign", { description: card.title, action: { label: "View cart", onClick: () => router.push("/cart") } });
    };

    return (
        <article ref={articleRef} className="relative overflow-hidden rounded-[14px] border border-line bg-white shadow-card" data-sponsored={card.sponsored ? "true" : undefined}>
            <Link href={href} onClick={onOpen} className="block p-[9px]">
                <div className="relative h-[210px] overflow-hidden rounded-[10px] bg-[#f1f1ee]">
                    {photos[0] ? (
                        <img src={photos[0]} alt={card.title} className="size-full object-cover" loading="lazy" />
                    ) : (
                        <div className="flex size-full items-center justify-center text-sm text-dim">No photo yet</div>
                    )}
                    {instantOn && card.instantBooking && (
                        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-brand shadow-sm">
                            <Zap className="size-3 fill-brand" aria-hidden />
                            Instant booking
                        </span>
                    )}
                    {card.sponsored && (
                        <span className="absolute bottom-2 left-2 rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.5px] text-ink shadow-sm" data-testid="sponsored-label">
                            Sponsored
                        </span>
                    )}
                    {photos.length > 1 && <span className="absolute bottom-2 right-2 rounded-md bg-[rgba(15,15,20,0.62)] px-2 py-0.5 text-[10px] font-semibold text-white">1/{photos.length}</span>}
                </div>
            </Link>
            <button
                type="button"
                onClick={toggleSave}
                aria-pressed={saved}
                aria-label={saved ? "Remove from saved spaces" : "Save this space"}
                className="absolute right-[21px] top-[21px] flex size-[34px] items-center justify-center rounded-full bg-white shadow-sm"
            >
                <Heart className={cn("size-[18px]", saved ? "fill-brand text-brand" : "text-ink")} aria-hidden />
            </button>
            <div className="px-[19px] pb-4 pt-1.5">
                <Link href={href} onClick={onOpen} className="line-clamp-1 text-sm font-semibold text-ink hover:text-brand">
                    {card.title}
                </Link>
                {(rating || distance) && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-dim">
                        {rating && (
                            <>
                                <Star className="size-3 fill-brand text-brand" aria-hidden />
                                <span className="font-semibold text-ink">{rating}</span>
                                <span>· {card.reviewCount} review{card.reviewCount === 1 ? "" : "s"}</span>
                            </>
                        )}
                        {rating && distance && <span>·</span>}
                        {distance && <span>{distance}</span>}
                    </p>
                )}
                <div className="mt-3 flex items-center gap-2.5">
                    <span className="rounded-md bg-brand-soft px-2 py-[3px] text-xs font-bold uppercase tracking-[0.5px] text-brand-bright">{formatChip(card)}</span>
                    {area && <span className="truncate text-xs text-dim">{area}</span>}
                    {availability && availability.text.length <= 16 && <AvailabilityTag availability={availability} className="ml-auto shrink-0" />}
                </div>
                {availability && availability.text.length > 16 && <AvailabilityTag availability={availability} className="mt-2" />}
                <div className="mt-4 flex items-center justify-between">
                    <div>
                        <p className="text-lg font-extrabold tracking-[-0.2px] text-ink">{perWeek(card.ratePerDay)}</p>
                        {card.ratePerDay && <p className="text-xs text-dim">{perDay(card.ratePerDay)}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={add}
                        className={cn(
                            "h-[34px] w-16 rounded-[10px] border-[1.2px] text-sm font-semibold",
                            inCart ? "border-brand bg-brand-soft text-brand-bright" : "border-line bg-white text-ink hover:border-ink"
                        )}
                    >
                        {inCart ? "Added" : "Add"}
                    </button>
                </div>
            </div>
        </article>
    );
}

/** The card's availability words, with a dot beside them — the words carry it, the colour only repeats it. */
function AvailabilityTag({ availability, className }: { availability: { text: string; tone: "free" | "partly" | "booked" }; className?: string }) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs", availability.tone === "booked" ? "text-dim" : availability.tone === "partly" ? "font-medium text-warning" : "font-medium text-brand", className)} data-testid="card-availability">
            <span className={cn("size-1.5 shrink-0 rounded-full", availability.tone === "booked" ? "bg-dim" : availability.tone === "partly" ? "bg-warning" : "bg-brand")} aria-hidden />
            {availability.text}
        </span>
    );
}
