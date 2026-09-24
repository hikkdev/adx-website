"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { cart, useCart, type CartDates } from "@/lib/cart";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { browseService, formatChip, perWeek, type BrowseCard } from "@/services/browse";

/**
 * One space on the Explore grid (5204:49982): the photograph, the name, the
 * format chip beside the area, the weekly price, "Add" into the campaign
 * cart, and the heart. The heart is the backend's saved-spaces book, which
 * the app's Saved tab reads too; it needs a session, so a visitor is sent
 * to sign in and brought back.
 */
export function SpaceCard({ card, dates }: { card: BrowseCard; dates?: CartDates }) {
    const router = useRouter();
    const { status } = useAuth();
    const { lines } = useCart();
    const [saved, setSaved] = React.useState(card.saved);
    const inCart = lines.some((line) => line.listingId === card.id);
    const area = card.address?.split(",")[0]?.trim() || card.city || null;
    const href = `/spaces/${encodeURIComponent(card.displayId ?? card.id)}`;

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
        } catch (caught) {
            setSaved(!next);
            toast.error(messageOf(caught, "Could not update your saved spaces."));
        }
    };

    const add = () => {
        if (inCart) {
            cart.remove(card.id);
            toast("Removed from your campaign cart");
            return;
        }
        cart.add({ listingId: card.id, title: card.title, photo: card.photos[0] ?? null, chip: formatChip(card), area, ratePerDay: card.ratePerDay });
        if (dates && (dates.from || dates.to)) cart.setDates(dates);
        toast.success("Added to your campaign", { description: card.title, action: { label: "View cart", onClick: () => router.push("/cart") } });
    };

    return (
        <article className="relative overflow-hidden rounded-[14px] border border-line bg-white shadow-card">
            <Link href={href} className="block p-[9px]">
                <div className="relative h-[210px] overflow-hidden rounded-[10px] bg-[#f1f1ee]">
                    {card.photos[0] ? (
                        <img src={card.photos[0]} alt={card.title} className="size-full object-cover" loading="lazy" />
                    ) : (
                        <div className="flex size-full items-center justify-center text-sm text-dim">No photo yet</div>
                    )}
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
                <Link href={href} className="line-clamp-1 text-sm font-semibold text-ink hover:text-brand">
                    {card.title}
                </Link>
                <div className="mt-3 flex items-center gap-2.5">
                    <span className="rounded-md bg-brand-soft px-2 py-[3px] text-xs font-bold uppercase tracking-[0.5px] text-brand-bright">{formatChip(card)}</span>
                    {area && <span className="truncate text-xs text-dim">{area}</span>}
                    {card.display === "DIGITAL" && <span className="ml-auto text-xs text-dim">{card.slotsLeft > 0 ? `${card.slotsLeft} slot${card.slotsLeft === 1 ? "" : "s"} left` : "Booked"}</span>}
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <p className="text-lg font-extrabold tracking-[-0.2px] text-ink">{perWeek(card.ratePerDay)}</p>
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
