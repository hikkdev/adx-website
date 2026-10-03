"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Star, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, btnPrimary, btnSmall, ErrorPanel, LoadingLine } from "@/components/advertiser/bits";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { messageOf } from "@/lib/api-client";
import { cart, useCart } from "@/lib/cart";
import { FLAG_INSTANT_BOOKING, useFlag } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { browseService, formatChip, perDay, perWeek, ratingLabel, slotsLabel, type BrowseCard } from "@/services/browse";

const PAGE = 20;

type Loaded = { items: BrowseCard[]; total: number; page: number };

/**
 * Saved spaces — the hearts, gathered (the app's Lot D saved-spaces screen):
 * every space this account has saved, newest save first, over
 * `GET /advertisers/:id/saved`. Each one can go into the campaign cart the
 * way it would from Explore, or be removed. A removed space stays on the
 * page, marked, until the next read — with Undo — rather than vanishing
 * under the pointer; the count in the heading is the server's. A space
 * that has left the market is not listed at all: the server leaves it out
 * rather than drawing it as bookable.
 */
export default function SavedSpacesPage() {
    const me = useAdvertiser();
    const [loaded, setLoaded] = React.useState<Loaded | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [more, setMore] = React.useState(false);
    const [removed, setRemoved] = React.useState<Record<string, boolean>>({});

    React.useEffect(() => {
        if (!me) return;
        let cancelled = false;
        browseService
            .saved(me.id, 1, PAGE)
            .then((page) => {
                if (cancelled) return;
                setLoaded({ items: page.items, total: page.total, page: 1 });
                setError(null);
            })
            .catch((caught: unknown) => !cancelled && setError(messageOf(caught, "Could not read your saved spaces.")));
        return () => {
            cancelled = true;
        };
    }, [me]);

    const loadMore = async () => {
        if (!me || !loaded) return;
        setMore(true);
        try {
            const next = await browseService.saved(me.id, loaded.page + 1, PAGE);
            setLoaded((current) => (current ? { items: [...current.items, ...next.items.filter((row) => !current.items.some((c) => c.id === row.id))], total: next.total, page: loaded.page + 1 } : current));
        } catch (caught) {
            toast.error(messageOf(caught, "Could not read more of your saved spaces."));
        } finally {
            setMore(false);
        }
    };

    const setSaved = async (card: BrowseCard, keep: boolean) => {
        setRemoved((current) => ({ ...current, [card.id]: !keep }));
        try {
            if (keep) await browseService.save(card.id);
            else await browseService.unsave(card.id);
        } catch (caught) {
            setRemoved((current) => ({ ...current, [card.id]: keep }));
            toast.error(messageOf(caught, keep ? "Could not save that space again." : "Could not remove that space."));
        }
    };

    const removedCount = Object.values(removed).filter(Boolean).length;
    const total = loaded ? Math.max(0, loaded.total - removedCount) : 0;

    return (
        <>
            <PageHeading
                title="Saved spaces"
                subtitle={!loaded ? "Spaces you kept with the heart, on the web or in the ADX app." : total === 0 ? "Nothing saved yet" : `${total} space${total === 1 ? "" : "s"} you have saved`}
                actions={
                    <Link href="/spaces" className={btnOutline}>
                        Browse spaces
                    </Link>
                }
            />

            {error ? (
                <ErrorPanel title="Could not read your saved spaces" message={error} />
            ) : !loaded ? (
                <div className="mt-6">
                    <LoadingLine>Loading your saved spaces…</LoadingLine>
                </div>
            ) : loaded.items.length === 0 ? (
                <Panel className="mt-6 flex flex-col items-center py-14 text-center">
                    <Heart className="size-7 text-[#c8c8c5]" aria-hidden />
                    <p className="mt-3 text-base font-semibold text-ink">No saved spaces</p>
                    <p className="mt-1 max-w-sm text-sm text-dim">Select the heart on any space to keep it here for your next campaign.</p>
                    <Link href="/spaces" className={cn(btnPrimary, "mt-5")}>
                        Browse spaces
                    </Link>
                </Panel>
            ) : (
                <div className="mt-6 space-y-3" data-testid="saved-list">
                    {loaded.items.map((card) => (
                        <SavedRow key={card.id} card={card} removed={!!removed[card.id]} onRemove={() => void setSaved(card, false)} onUndo={() => void setSaved(card, true)} />
                    ))}
                    {loaded.items.length < loaded.total && (
                        <button type="button" onClick={() => void loadMore()} disabled={more} className={cn(btnOutline, "w-full")}>
                            {more ? "Loading…" : `Show more (${loaded.total - loaded.items.length} left)`}
                        </button>
                    )}
                </div>
            )}
        </>
    );
}

function SavedRow({ card, removed, onRemove, onUndo }: { card: BrowseCard; removed: boolean; onRemove: () => void; onUndo: () => void }) {
    const router = useRouter();
    const { lines } = useCart();
    const instantOn = useFlag(FLAG_INSTANT_BOOKING);
    const inCart = lines.some((line) => line.listingId === card.id);
    const href = `/spaces/${encodeURIComponent(card.displayId ?? card.id)}`;
    const area = card.address?.split(",")[0]?.trim() || card.city || null;
    const rating = ratingLabel(card.ratingAvg, card.reviewCount);
    const slots = slotsLabel(card);

    const addToCart = () => {
        if (inCart) {
            router.push("/cart");
            return;
        }
        cart.add({ listingId: card.id, title: card.title, photo: card.photos[0] ?? null, chip: formatChip(card), area, ratePerDay: card.ratePerDay });
        toast.success("Added to your campaign", { description: card.title, action: { label: "View cart", onClick: () => router.push("/cart") } });
    };

    return (
        <article className={cn("flex flex-col gap-5 rounded-lg border border-line bg-white p-4 sm:flex-row sm:items-center", removed && "bg-ground")} data-testid={`saved-${card.id}`}>
            <Link href={href} className={cn("relative block h-[120px] w-full shrink-0 overflow-hidden rounded-md bg-[#f1f1ee] sm:w-[180px]", removed && "opacity-50")}>
                {card.photos[0] ? <img src={card.photos[0]} alt={card.title} className="size-full object-cover" loading="lazy" /> : <span className="flex size-full items-center justify-center text-xs text-dim">No photo yet</span>}
                {instantOn && card.instantBooking && (
                    <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-brand">
                        <Zap className="size-3 fill-brand" aria-hidden />
                        Instant
                    </span>
                )}
            </Link>
            <div className={cn("min-w-0 flex-1", removed && "opacity-60")}>
                <Link href={href} className="line-clamp-1 text-sm font-semibold text-ink hover:text-brand">
                    {card.title}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-2.5">
                    <span className="rounded-md bg-brand-soft px-2 py-[3px] text-xs font-bold uppercase tracking-[0.5px] text-brand-bright">{formatChip(card)}</span>
                    <span className="truncate text-xs text-dim">{[area, card.city].filter((v, i, all) => v && all.indexOf(v) === i).join(", ")}</span>
                    {slots && <span className={cn("text-xs", slots === "Booked" ? "text-dim" : "font-medium text-brand")}>{slots}</span>}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-dim">
                    {rating ? (
                        <>
                            <Star className="size-3 fill-brand text-brand" aria-hidden />
                            <span className="font-semibold text-ink">{rating}</span>· {card.reviewCount} review{card.reviewCount === 1 ? "" : "s"}
                        </>
                    ) : (
                        "No reviews yet"
                    )}
                    {card.estimatedDailyFootfall ? <span>· ~{card.estimatedDailyFootfall.toLocaleString("en-IN")} people a day</span> : null}
                </p>
                <p className="mt-2 text-sm">
                    <span className="font-extrabold text-ink">{perWeek(card.ratePerDay)}</span>
                    {card.ratePerDay && <span className="ml-2 text-xs text-dim">{perDay(card.ratePerDay)}</span>}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
                {removed ? (
                    <>
                        <p className="text-xs text-dim">Removed from saved spaces</p>
                        <button type="button" onClick={onUndo} className={btnSmall}>
                            Undo
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" onClick={addToCart} className={inCart ? btnOutline : btnPrimary}>
                            {inCart ? "In your cart · View" : "Add to cart"}
                        </button>
                        <button type="button" onClick={onRemove} className={btnSmall}>
                            <Heart className="mr-1.5 size-4 fill-brand text-brand" aria-hidden />
                            Remove
                        </button>
                    </>
                )}
            </div>
        </article>
    );
}
