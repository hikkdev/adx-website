"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { BadgeCheck, Calendar, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Eye, Heart, Link2, Share2, Star, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { LayoutBlocks } from "@/components/layout/layout-blocks";
import { FeatureOff } from "@/components/platform/feature-off";
import { useLayout } from "@/components/layout/use-layout";
import { AvailabilityCalendar } from "@/components/site/availability-calendar";
import { SpaceCard } from "@/components/site/space-card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ApiError, messageOf } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { cart, useCart } from "@/lib/cart";
import { FLAG_INSTANT_BOOKING, FLAG_REVIEWS, useFlag, useSwitchedOff } from "@/lib/flags";
import { pageHref } from "@/lib/site-routes";
import { cn } from "@/lib/utils";
import {
    browseService,
    CATEGORY_LABEL,
    dateSpan,
    formatChip,
    highlightsOf,
    isIsoDay,
    perDay,
    publisherLine,
    ratingLabel,
    rupees,
    shareLinkOf,
    shareWordsOf,
    slotsLabel,
    similarHref,
    cardAvailability,
    countSpotView,
    specsOf,
    type BrowseCard,
    type ListingReview,
} from "@/services/browse";

const MapPanel = dynamic(() => import("@/components/site/map-panel").then((m) => m.MapPanel), { ssr: false });

const GST = 0.18;
const SERVICE_FEE = 200;

type State = { kind: "loading" } | { kind: "missing" } | { kind: "error"; message: string } | { kind: "ready"; card: BrowseCard };

function isoToday(offset = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
    const a = new Date(from + "T00:00:00").getTime();
    const b = new Date(to + "T00:00:00").getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
    return Math.round((b - a) / 86_400_000) + 1;
}

/** The visitor's dates off the URL, when both are days and the end is not before the start. */
function datesOf(initial?: { from: string | null; to: string | null }): { from: string; to: string } | null {
    if (!initial || !isIsoDay(initial.from) || !isIsoDay(initial.to) || initial.to < initial.from) return null;
    return { from: initial.from, to: initial.to };
}

export function ListingView({ id, initialDates }: { id: string; initialDates?: { from: string | null; to: string | null } }) {
    const urlDates = datesOf(initialDates);
    const router = useRouter();
    const { status } = useAuth();
    const { lines, dates } = useCart();
    const [state, setState] = React.useState<State>({ kind: "loading" });
    const [reviews, setReviews] = React.useState<{ items: ListingReview[]; total: number } | null>(null);
    const [similar, setSimilar] = React.useState<BrowseCard[]>([]);
    const similarTrack = React.useRef<HTMLDivElement>(null);
    const [byPublisher, setByPublisher] = React.useState<BrowseCard[]>([]);
    /* How many OTHER live spaces the publisher has — the "View all" line's count. */
    const [publisherOthers, setPublisherOthers] = React.useState(0);
    const [photo, setPhoto] = React.useState(0);
    const [from, setFrom] = React.useState(urlDates?.from ?? dates.from ?? isoToday(3));
    const [to, setTo] = React.useState(urlDates?.to ?? dates.to ?? isoToday(16));
    /* AV-1: the calendar checks the dates only once they are the visitor's — from the URL, or picked here — never the page's placeholder fortnight. */
    const [datesChosen, setDatesChosen] = React.useState(urlDates !== null);
    const [production, setProduction] = React.useState(true);
    const [openFaq, setOpenFaq] = React.useState(0);
    const [saved, setSaved] = React.useState(false);
    const [allReviews, setAllReviews] = React.useState(false);
    const instantOn = useFlag(FLAG_INSTANT_BOOKING);
    /* The `marketplace.reviews` kill switch: while it is off the reviews are not read, and the section says so. */
    const reviewsOff = useSwitchedOff(FLAG_REVIEWS);
    /* LM-1: the sidebar's layout, for this space's city — read once the space is. */
    const sidebarLayout = useLayout("WEB_LISTING", { city: state.kind === "ready" ? state.card.city : null, enabled: state.kind === "ready" });
    /* AV-1: the slots left and free days over the visitor's own dates — the page's first read counts today. */
    const [dated, setDated] = React.useState<{ key: string; card: Pick<BrowseCard, "display" | "slotsLeft" | "freeDays" | "windowDays"> } | null>(null);
    const datedKey = datesChosen && from && to && from <= to ? `${from}|${to}` : null;
    React.useEffect(() => {
        if (!datedKey) return;
        let cancelled = false;
        const [f, t] = datedKey.split("|") as [string, string];
        browseService
            .listing(id, { from: f, to: t })
            .then((card) => !cancelled && setDated({ key: datedKey, card }))
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [id, datedKey]);

    React.useEffect(() => {
        let cancelled = false;
        browseService
            .listing(id)
            .then((card) => {
                if (cancelled) return;
                setState({ kind: "ready", card });
                setSaved(card.saved);
                document.title = `${card.title} — ADX`;
                /* The listing-data-gaps lot: one view of this spot's page — the marketplace detail and the shared `/s/<LST-…>` link both land here. */
                countSpotView(card.id);
                /* `/similar` answers browse cards (26 Sep 2026): drawn as they come. */
                // SIM-1 (the owner, 27 Sep 2026): four at a time, scrolling for more, then "View all".
                browseService
                    .similar(card.id, 12)
                    .then((cards) => !cancelled && setSimilar(cards.filter((c) => c.id !== card.id)))
                    .catch(() => undefined);
                if (card.publisherId) {
                    browseService
                        .browse({ publisherId: card.publisherId, pageSize: 4 })
                        .then((page) => {
                            if (cancelled) return;
                            // The owner (27 Sep 2026): up to three more of the publisher's spaces, stacked, then "View all".
                            const others = page.items.filter((r) => r.id !== card.id);
                            setByPublisher(others.slice(0, 3));
                            setPublisherOthers(Math.max(others.length, page.total - (page.items.some((r) => r.id === card.id) ? 1 : 0)));
                        })
                        .catch(() => undefined);
                }
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                if (caught instanceof ApiError && caught.status === 404) setState({ kind: "missing" });
                else setState({ kind: "error", message: caught instanceof ApiError ? caught.message : "Could not load this space." });
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    /* The reviews, once the space says it has some — its own read, so the switch can hold it back without re-reading the space. */
    const reviewedCardId = state.kind === "ready" && state.card.reviewCount > 0 ? state.card.id : null;
    React.useEffect(() => {
        if (!reviewedCardId || reviewsOff) return;
        let cancelled = false;
        browseService
            .reviews(reviewedCardId, 1, 20)
            .then((page) => !cancelled && setReviews({ items: page.items, total: page.total }))
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [reviewedCardId, reviewsOff]);

    if (state.kind === "loading") {
        return (
            <div className="mx-auto max-w-[1920px] px-6 py-10 lg:px-16" aria-busy="true">
                <div className="h-[560px] animate-pulse rounded-2xl bg-white" />
            </div>
        );
    }
    if (state.kind === "missing" || state.kind === "error") {
        return (
            <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
                <p className="text-2xl font-semibold text-ink">{state.kind === "missing" ? "That space is not available" : "Could not load this space"}</p>
                <p className="mt-2 text-sm text-dim">{state.kind === "missing" ? "It may have been taken off the market, or the link is old." : state.message}</p>
                <Link href={pageHref("explore")} className="mt-6 inline-block rounded-[11px] bg-brand px-6 py-3 text-sm font-semibold text-white">
                    Explore spaces
                </Link>
            </div>
        );
    }

    const { card } = state;
    const area = card.address?.split(",")[0]?.trim() || card.city || "";
    const photos = card.photos.length ? card.photos : [];
    const days = daysBetween(from, to);
    const weeks = Math.max(1, Math.round(days / 7));
    const rate = card.ratePerDay ? Number(card.ratePerDay) : 0;
    const rental = rate * days;
    const productionCost = production ? Math.round(rental * 0.6) : 0;
    const subtotal = rental + productionCost + SERVICE_FEE;
    const gst = Math.round(subtotal * GST);
    const total = subtotal + gst;
    const inCart = lines.some((l) => l.listingId === card.id);
    const included = [
        card.size ? `${card.size} artwork` : "Artwork sized to the space",
        "Printing and mounting of creative",
        card.display === "DIGITAL" ? "Loop scheduling by ADX" : "Installation and removal of the creative",
    ];
    const excluded = ["Creative design and artwork production", card.display === "DIGITAL" ? "Content longer than the slot" : "Any production not included in your booking", "Extension beyond booked flight dates"];

    /* The dates, as the page carries them: in the URL (`?from=…&to=…`), so a link or a reload keeps them. */
    const chooseDates = (nextFrom: string, nextTo: string) => {
        setFrom(nextFrom);
        setTo(nextTo);
        setDatesChosen(true);
        if (!isIsoDay(nextFrom) || !isIsoDay(nextTo) || nextTo < nextFrom) return;
        const url = new URL(window.location.href);
        url.searchParams.set("from", nextFrom);
        url.searchParams.set("to", nextTo);
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    };

    const addToCampaign = () => {
        if (!inCart) {
            cart.add({ listingId: card.id, title: card.title, photo: photos[0] ?? null, chip: formatChip(card), area, ratePerDay: card.ratePerDay });
        }
        cart.setDates({ from, to });
        toast.success(inCart ? "Dates saved to your campaign" : "Added to your campaign", { description: card.title, action: { label: "View cart", onClick: () => router.push("/cart") } });
    };

    const bookNow = () => {
        addToCampaign();
        router.push("/cart");
    };

    const toggleSave = async () => {
        if (status !== "signed-in") {
            router.push(`/sign-in?next=${encodeURIComponent(`/spaces/${encodeURIComponent(id)}`)}`);
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

    /* The app's share button: the spot's words and the server's link to its page (`shareUrl`), or this page's address while the spot has none. */
    const shareUrl = () => shareLinkOf(card, window.location.href);
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl());
            toast.success("Link copied", { description: shareUrl() });
        } catch {
            toast.error("Could not copy the link. Copy it from the address bar instead.");
        }
    };
    const shareVia = async () => {
        try {
            await navigator.share({ title: card.title, text: shareWordsOf(card), url: shareUrl() });
        } catch (caught) {
            if (caught instanceof DOMException && caught.name === "AbortError") return;
            await copyLink();
        }
    };
    const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
    const rating = ratingLabel(card.ratingAvg, card.reviewCount);
    const highlights = highlightsOf(card, instantOn);
    const specs = specsOf(card);
    const onDates = datedKey && dated?.key === datedKey ? dated.card : null;
    const slots = slotsLabel(onDates ?? card);
    const onDatesLine = onDates ? cardAvailability(onDates, true) : null;
    const approval = publisherLine(card, instantOn);
    const shownReviews = reviews ? (allReviews ? reviews.items : reviews.items.slice(0, 2)) : [];

    return (
        <div className="mx-auto max-w-[1920px] px-6 pb-16 lg:px-16">
            <nav className="flex items-center gap-1.5 py-3 text-xs text-dim" aria-label="Breadcrumb">
                <Link href="/" className="hover:text-ink">Home</Link>
                <ChevronRight className="size-3" aria-hidden />
                <Link href={pageHref("explore", {}, card.city ? { search: `city=${encodeURIComponent(card.city)}` } : {})} className="hover:text-ink">{card.city ?? "Spaces"}</Link>
                <ChevronRight className="size-3" aria-hidden />
                <Link href={`/spaces?category=${card.category}`} className="hover:text-ink">{formatChip(card).toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Link>
                <ChevronRight className="size-3" aria-hidden />
                <span className="text-ink">{card.title}</span>
            </nav>

            <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_508px]">
                {/* ── Left: gallery, overview, what's included, reviews, FAQs, similar ── */}
                <div className="min-w-0">
                    <div className="relative overflow-hidden rounded-2xl bg-[#f1f1ee]">
                        {photos[photo] ? (
                            <img src={photos[photo]} alt={card.title} className="h-[560px] w-full object-cover" />
                        ) : (
                            <div className="flex h-[560px] items-center justify-center text-sm text-dim">No photograph yet</div>
                        )}
                        <div className="absolute right-4 top-4 flex items-center gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button type="button" className="flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-ink shadow-sm" data-testid="listing-share">
                                        <Share2 className="size-4" aria-hidden />
                                        Share
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuItem onSelect={() => void copyLink()}>
                                        <Link2 className="mr-2 size-4" aria-hidden />
                                        Copy link
                                    </DropdownMenuItem>
                                    {canShare && (
                                        <DropdownMenuItem onSelect={() => void shareVia()}>
                                            <Share2 className="mr-2 size-4" aria-hidden />
                                            Share via…
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <button type="button" onClick={toggleSave} aria-pressed={saved} className="flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-ink shadow-sm">
                                <Heart className={cn("size-4", saved ? "fill-brand text-brand" : "text-ink")} aria-hidden />
                                {saved ? "Saved" : "Save"}
                            </button>
                        </div>
                        {instantOn && card.instantBooking && (
                            <span className="absolute left-4 top-4 flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-brand shadow-sm" data-testid="listing-instant">
                                <Zap className="size-4 fill-brand" aria-hidden />
                                Instant booking
                            </span>
                        )}
                        {photos.length > 1 && (
                            <span className="absolute bottom-4 right-4 rounded bg-black/40 px-2.5 py-1 text-xs text-white">
                                {photo + 1} / {photos.length}
                            </span>
                        )}
                    </div>
                    {photos.length > 1 && (
                        <div className="mt-4 grid grid-cols-4 gap-3">
                            {photos.slice(0, 3).map((url, index) => (
                                <button key={url + index} type="button" onClick={() => setPhoto(index)} className={cn("h-[120px] overflow-hidden rounded-xl border-2", photo === index ? "border-ink" : "border-transparent")}>
                                    <img src={url} alt="" className="size-full object-cover" />
                                </button>
                            ))}
                            {photos.length > 3 && (
                                <button type="button" onClick={() => setPhoto((p) => (p + 1) % photos.length)} className="flex h-[120px] items-center justify-center rounded-xl bg-ink text-sm font-semibold text-white">
                                    +{photos.length - 3} photos
                                </button>
                            )}
                        </div>
                    )}

                    <section className="mt-10">
                        <h2 className="text-2xl font-bold tracking-tight text-ink">Overview</h2>
                        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-white p-5">
                            {card.latitude !== null && card.longitude !== null ? (
                                <MapPanel cards={[card]} className="border-0 shadow-none" />
                            ) : (
                                <div className="flex h-[220px] items-center justify-center rounded-xl bg-ground text-sm text-dim">No map position for this space yet</div>
                            )}
                            <p className="mt-4 text-sm text-dim">{card.address}</p>
                        </div>
                        <p className="mt-6 text-sm leading-relaxed text-ink">
                            {card.description ??
                                `Bring your brand into the everyday journey in ${area}${card.city ? `, ${card.city}` : ""}. This ${formatChip(card).toLowerCase()} can be booked for your campaign dates, with artwork and production requirements reviewed before it goes live.`}
                        </p>
                        <ul className="mt-6 space-y-2 text-sm text-ink">
                            <li>{formatChip(card).toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} in {area}{card.city ? `, ${card.city}` : ""}</li>
                            {card.size && <li>{card.size}{card.illumination ? ` · ${card.illumination}` : ""}{card.facing ? ` · facing ${card.facing.toLowerCase()}` : ""}</li>}
                            {onDatesLine && onDatesLine.tone !== "free" ? <li>{onDatesLine.tone === "booked" ? "Booked on your dates — see the calendar below for free dates" : `${onDatesLine.text} on your dates — see the calendar below`}</li> : card.availableNow ? <li>Available now for your campaign dates</li> : card.availableFrom ? <li>Available from {new Date(card.availableFrom).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</li> : null}
                            {card.publisherVerified && <li>Publisher verified by ADX · installation proof on every booking</li>}
                            {card.estimatedDailyFootfall ? <li>About {card.estimatedDailyFootfall.toLocaleString("en-IN")} people pass this space every day</li> : null}
                        </ul>
                        {highlights.length > 0 && (
                            <div className="mt-6 flex flex-wrap gap-3" data-testid="listing-highlights">
                                {highlights.map((item) => (
                                    <span key={item.key} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink">
                                        {item.key === "instant" || item.key === "lit" ? (
                                            <Zap className="size-4 text-brand" aria-hidden />
                                        ) : item.key === "footfall" ? (
                                            <Eye className="size-4 text-brand" aria-hidden />
                                        ) : item.key === "available" ? (
                                            <CheckCircle2 className="size-4 text-brand" aria-hidden />
                                        ) : (
                                            <Star className="size-4 text-brand" aria-hidden />
                                        )}
                                        {item.label}
                                    </span>
                                ))}
                            </div>
                        )}
                    </section>

                    {specs.length > 0 && (
                        <section className="mt-10" data-testid="listing-specs">
                            <h2 className="text-2xl font-bold tracking-tight text-ink">{CATEGORY_LABEL[card.category]} specs</h2>
                            <dl className="mt-5 grid gap-x-10 gap-y-4 rounded-2xl border border-line bg-white p-6 sm:grid-cols-2 xl:grid-cols-3">
                                {specs.map((row) => (
                                    <div key={row.label}>
                                        <dt className="text-xs font-bold uppercase tracking-[0.8px] text-dim">{row.label}</dt>
                                        <dd className="mt-1 text-sm font-medium text-ink">{row.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    )}

                    <section className="mt-10 scroll-mt-24" id="availability" data-testid="listing-availability">
                        <h2 className="text-2xl font-bold tracking-tight text-ink">Availability</h2>
                        <p className="mt-1 text-sm text-dim">
                            {card.display === "DIGITAL" && card.slotsTotal > 1
                                ? `Booked by the day. This screen sells ${card.slotsTotal} slots in its loop, so a day can be partly booked and still have room.`
                                : "Booked by the day. One booking holds the whole space for its dates."}
                        </p>
                        <div className="mt-5">
                            <AvailabilityCalendar
                                listingId={card.id}
                                slotsTotal={card.slotsTotal}
                                digital={card.display === "DIGITAL"}
                                chosen={datesChosen && days > 0 ? { from, to } : null}
                                onApply={(nextFrom, nextTo) => {
                                    chooseDates(nextFrom, nextTo);
                                    toast.success("Dates updated", { description: `Plan your booking now reads ${dateSpan(nextFrom, nextTo)}. Add to campaign books these dates.` });
                                }}
                            />
                        </div>
                    </section>

                    <section className="mt-10">
                        <h2 className="text-2xl font-bold tracking-tight text-ink">What&apos;s included</h2>
                        <div className="mt-5 grid gap-x-10 gap-y-3 md:grid-cols-2">
                            {included.map((item) => (
                                <p key={item} className="flex items-start gap-3 text-sm text-ink">
                                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                                    {item}
                                </p>
                            ))}
                            {excluded.map((item) => (
                                <p key={item} className="flex items-start gap-3 text-sm text-ink">
                                    <X className="mt-0.5 size-4 shrink-0 text-dim" aria-hidden />
                                    {item}
                                    {item.startsWith("Creative design") && (
                                        <>
                                            {" "}
                                            <Link href="/advertiser/campaigns/new?creative=adx" className="font-semibold text-brand">
                                                Design by ADX
                                            </Link>
                                        </>
                                    )}
                                </p>
                            ))}
                        </div>
                        <Link href={pageHref("help", {}, { hash: "artwork" })} className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2">
                            View artwork requirements
                        </Link>
                    </section>

                    <section className="mt-10" data-testid="listing-reviews">
                        <h2 className="text-2xl font-bold tracking-tight text-ink">{card.reviewCount > 0 ? `Reviews (${card.reviewCount})` : "Reviews"}</h2>
                        {reviewsOff ? (
                            <FeatureOff flag={FLAG_REVIEWS} className="mt-4" />
                        ) : card.reviewCount > 0 && rating ? (
                            <>
                                <div className="mt-4 flex items-center gap-3">
                                    <span className="text-3xl font-extrabold text-ink">{rating}</span>
                                    <Stars value={Number(card.ratingAvg)} />
                                </div>
                                <p className="mt-1 text-xs text-dim">
                                    {card.reviewCount} review{card.reviewCount === 1 ? "" : "s"} from advertisers whose campaigns ran here
                                </p>
                                {status !== "signed-in" ? (
                                    <p className="mt-5 text-sm text-dim">
                                        <Link href={`/sign-in?next=${encodeURIComponent(`/spaces/${encodeURIComponent(id)}`)}`} className="font-medium text-ink underline underline-offset-2">
                                            Sign in
                                        </Link>{" "}
                                        to read what advertisers said.
                                    </p>
                                ) : reviews && reviews.items.length > 0 ? (
                                    <>
                                        <p className="mt-6 text-sm font-semibold text-ink">{allReviews ? "What advertisers said" : "Featured reviews"}</p>
                                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                                            {shownReviews.map((review) => (
                                                <div key={review.id} className="rounded-xl border border-line bg-white p-5">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-semibold text-ink">An advertiser on ADX</p>
                                                        <Stars value={review.rating} small />
                                                    </div>
                                                    {review.note && <p className="mt-2 text-sm text-dim">{review.note}</p>}
                                                    <p className="mt-2 text-xs text-dim">{new Date(review.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                                                </div>
                                            ))}
                                        </div>
                                        {!allReviews && reviews.items.length > 2 && (
                                            <button type="button" onClick={() => setAllReviews(true)} className="mt-4 text-sm font-medium text-ink underline underline-offset-2 hover:text-brand">
                                                Read all {reviews.items.length} reviews
                                            </button>
                                        )}
                                        {allReviews && reviews.total > reviews.items.length && <p className="mt-3 text-xs text-dim">{reviews.total - reviews.items.length} more on ADX.</p>}
                                    </>
                                ) : null}
                            </>
                        ) : (
                            <p className="mt-3 text-sm text-dim">No reviews yet. Advertisers are asked once a campaign on this space has run.</p>
                        )}
                    </section>

                    <section className="mt-10">
                        <h2 className="text-2xl font-bold tracking-tight text-ink">FAQs</h2>
                        <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white">
                            {FAQS.map((faq, index) => (
                                <div key={faq.q}>
                                    <button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-ink">
                                        {faq.q}
                                        <ChevronDown className={cn("size-4 text-dim transition-transform", openFaq === index && "rotate-180")} aria-hidden />
                                    </button>
                                    {openFaq === index && <p className="px-5 pb-4 text-sm text-dim">{faq.a}</p>}
                                </div>
                            ))}
                        </div>
                    </section>

                    {similar.length > 0 && (
                        <section className="mt-10">
                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight text-ink">Similar listing</h2>
                                    <p className="mt-1 text-sm text-dim">More {formatChip(card).toLowerCase()} spaces{card.city ? ` in ${card.city}` : ""}</p>
                                </div>
                                {similar.length > 4 && (
                                    <div className="flex items-center gap-2">
                                        <button type="button" aria-label="Scroll similar listings back" onClick={() => similarTrack.current?.scrollBy({ left: -similarTrack.current.clientWidth, behavior: "smooth" })} className="flex size-9 items-center justify-center rounded-md border border-line bg-white text-ink hover:border-ink">
                                            <ChevronLeft className="size-4" aria-hidden />
                                        </button>
                                        <button type="button" aria-label="Scroll similar listings on" onClick={() => similarTrack.current?.scrollBy({ left: similarTrack.current.clientWidth, behavior: "smooth" })} className="flex size-9 items-center justify-center rounded-md border border-line bg-white text-ink hover:border-ink">
                                            <ChevronRight className="size-4" aria-hidden />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div
                                ref={similarTrack}
                                data-testid="similar-row"
                                className="mt-5 grid snap-x snap-mandatory auto-cols-[85%] grid-flow-col gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:auto-cols-[calc((100%-1rem)/2)] xl:auto-cols-[calc((100%-3rem)/4)] [&::-webkit-scrollbar]:hidden"
                            >
                                {similar.map((row) => (
                                    <div key={row.id} className="snap-start">
                                        <SpaceCard card={row} surface="WEB_LISTING" />
                                    </div>
                                ))}
                            </div>
                            <Link href={similarHref(card)} className="mt-5 inline-flex h-11 items-center justify-center rounded-md border border-ink bg-white px-6 text-sm font-medium text-ink hover:bg-ground">
                                View all similar listings
                            </Link>
                        </section>
                    )}
                </div>

                {/* ── Right: price, publisher, calculator, CTAs, questions, publisher's other spaces ── */}
                <aside className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-ink">{card.title}</h1>
                            <p className="mt-1 text-sm text-dim">{area}{card.city ? `, ${card.city}` : ""}</p>
                            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-dim" data-testid="listing-rating">
                                {rating ? (
                                    <>
                                        <Star className="size-3.5 fill-brand text-brand" aria-hidden />
                                        <span className="font-semibold text-ink">{rating}</span>· {card.reviewCount} review{card.reviewCount === 1 ? "" : "s"}
                                    </>
                                ) : (
                                    "No reviews yet"
                                )}
                            </p>
                        </div>
                        <div className="shrink-0 text-right">
                            <p>
                                <span className="text-2xl font-extrabold text-ink">{card.ratePerDay ? rupees(rate * 7) : "—"}</span>
                                <span className="text-sm text-dim"> / week</span>
                            </p>
                            <p className="mt-0.5 text-xs text-dim">{perDay(card.ratePerDay)}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 rounded-xl border border-line bg-white p-4">
                        {card.publisherAvatarUrl ? (
                            <img src={card.publisherAvatarUrl} alt="" className="size-11 rounded-full object-cover" />
                        ) : (
                            <span className="flex size-11 items-center justify-center rounded-full bg-ground text-sm font-semibold text-ink">{(card.publisherName ?? "P").slice(0, 2).toUpperCase()}</span>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                                <span className="truncate">{card.publisherName ?? "ADX publisher"}</span>
                                {card.publisherVerified === true && <BadgeCheck className="size-4 shrink-0 text-brand" aria-label="Verified by ADX" />}
                                {card.publisherVerified === false && <span className="shrink-0 rounded bg-ground px-1.5 py-0.5 text-[10px] font-medium text-dim">Unverified</span>}
                            </p>
                            {card.publisherId ? (
                                <Link href={`/spaces?publisherId=${encodeURIComponent(card.publisherId)}`} className="text-xs text-dim hover:text-ink">
                                    {publisherOthers > 0 ? `${publisherOthers} other space${publisherOthers === 1 ? "" : "s"} · ` : ""}View publisher →
                                </Link>
                            ) : (
                                <p className="text-xs text-dim">{card.publisherVerified ? "Verified by ADX" : "Listed on ADX"}</p>
                            )}
                        </div>
                        {rating && (
                            <span className="flex items-center gap-1 rounded-md bg-ground px-2.5 py-1.5 text-xs font-semibold text-ink">
                                <Star className="size-3.5 fill-[#f5b301] text-[#f5b301]" aria-hidden />
                                {rating}
                            </span>
                        )}
                    </div>
                    {approval && (
                        <p className="px-1 text-xs leading-relaxed text-dim" data-testid="listing-publisher-line">
                            {approval}
                        </p>
                    )}

                    <div className="rounded-xl border border-line bg-white p-4">
                        <p className="text-sm font-semibold text-ink">Plan your booking</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <label className="flex h-11 items-center gap-2.5 rounded-md border border-line px-3 text-sm text-ink">
                                <Calendar className="size-[18px] text-dim" aria-hidden />
                                <input type="date" value={from} min={isoToday()} onChange={(e) => chooseDates(e.target.value, to < e.target.value ? e.target.value : to)} aria-label="Start date" className="min-w-0 flex-1 bg-transparent focus:outline-none" />
                            </label>
                            <label className="flex h-11 items-center gap-2.5 rounded-md border border-line px-3 text-sm text-ink">
                                <Calendar className="size-[18px] text-dim" aria-hidden />
                                <input type="date" value={to} min={from} onChange={(e) => chooseDates(from, e.target.value)} aria-label="End date" className="min-w-0 flex-1 bg-transparent focus:outline-none" />
                            </label>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-xs text-dim">Booking duration</p>
                                <p className="mt-1 text-ink">{days > 0 ? `${days} day${days === 1 ? "" : "s"} · ${weeks} week${weeks === 1 ? "" : "s"}` : "Pick your dates"}</p>
                            </div>
                            <div>
                                <p className="text-xs text-dim">Placement</p>
                                <p className="mt-1 text-ink">{card.placement ?? formatChip(card).toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</p>
                            </div>
                        </div>
                        {slots && (
                            <p className="mt-4 text-xs text-dim">
                                <span className={cn("mr-1.5 rounded-full px-2 py-0.5 font-semibold", slots === "Booked" ? "bg-ground text-dim" : "bg-brand-soft text-brand")}>{slots}</span>
                                of {card.slotsTotal} on this screen{onDates ? " on your dates" : " today"} · the rate is per slot
                            </p>
                        )}
                        {/* AV-1: a static wall has no loop; on the visitor's dates it says whether they are free, partly or wholly taken. */}
                        {!slots && onDatesLine && (
                            <p className="mt-4 text-xs text-dim">
                                <span className={cn("mr-1.5 rounded-full px-2 py-0.5 font-semibold", onDatesLine.tone === "booked" ? "bg-ground text-dim" : "bg-[#fff4e5] text-[#9a5b00]")}>{onDatesLine.text}</span>
                                <a href="#availability" className="underline underline-offset-2 hover:text-ink">See the calendar</a>
                            </p>
                        )}
                        <label className="mt-4 flex h-11 cursor-pointer items-center justify-between rounded-md border border-line px-3 text-sm text-ink">
                            <select value={production ? "yes" : "no"} onChange={(e) => setProduction(e.target.value === "yes")} aria-label="Production" className="min-w-0 flex-1 appearance-none bg-transparent focus:outline-none">
                                <option value="yes">Printing &amp; installation selected</option>
                                <option value="no">I&apos;ll arrange printing &amp; installation</option>
                            </select>
                            <ChevronDown className="size-[18px] text-dim" aria-hidden />
                        </label>
                        <dl className="mt-4 space-y-3 rounded-lg bg-ground p-4 text-sm">
                            <Row label={`Space rental · ${weeks} week${weeks === 1 ? "" : "s"}`} value={rupees(rental)} />
                            {production && <Row label="Printing & installation" value={rupees(productionCost)} note="estimate, confirmed at checkout" />}
                            <Row label="Service fee" value={rupees(SERVICE_FEE)} />
                            <Row label="GST (18%)" value={rupees(gst)} />
                            <div className="border-t border-line pt-3">
                                <Row label="Total" value={rupees(total)} strong />
                            </div>
                        </dl>
                    </div>

                    <button type="button" onClick={addToCampaign} disabled={days === 0 || !card.ratePerDay} className="flex h-16 w-full items-center justify-center rounded-md bg-brand text-sm font-bold uppercase tracking-wide text-white hover:bg-[#a51b1b] disabled:cursor-not-allowed disabled:opacity-60">
                        {inCart ? "In your campaign" : "Add to campaign"}
                    </button>
                    <button type="button" onClick={bookNow} disabled={days === 0 || !card.ratePerDay} className="flex h-16 w-full items-center justify-center rounded-md border border-ink bg-white text-sm font-semibold text-ink hover:bg-ground disabled:cursor-not-allowed disabled:opacity-60">
                        Book now
                    </button>

                    <div className="pt-6">
                        <Link href={pageHref("help", {}, { hash: "booking" })} className="text-sm font-medium text-ink underline underline-offset-2">Ask about this space</Link>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {["Can I change my dates?", "What artwork is required?", "How do I track my campaign?"].map((q) => (
                                <Link key={q} href={`/help?q=${encodeURIComponent(q)}`} className="rounded-full border border-line bg-white px-3.5 py-2.5 text-xs text-ink hover:border-ink">
                                    {q}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* LM-1: the sidebar's lower part is the layout's — the publisher's other spaces and the sold ad slot, in the order ADX publishes. An empty slot draws nothing. */}
                    <div className="pt-6">
                        <LayoutBlocks
                            surface="WEB_LISTING"
                            layout={sidebarLayout}
                            place={{ city: card.city }}
                            gapClassName="pt-6"
                            system={{
                                publisher_listings: (title) =>
                                    byPublisher.length > 0 ? (
                                        <div>
                                            <h2 className="text-2xl font-bold tracking-tight text-ink">{title ?? "Publisher listing"}</h2>
                                            <p className="mt-1 text-sm text-dim">More spaces from {card.publisherName ?? "this publisher"}</p>
                                            <div className="mt-5 flex flex-col gap-4">
                                                {byPublisher.map((row) => (
                                                    <SpaceCard key={row.id} card={row} surface="WEB_LISTING" />
                                                ))}
                                            </div>
                                            {card.publisherId && (
                                                <Link
                                                    href={`/spaces?publisherId=${encodeURIComponent(card.publisherId)}`}
                                                    className="mt-4 flex h-11 items-center justify-center rounded-md border border-ink bg-white text-sm font-medium text-ink hover:bg-ground"
                                                >
                                                    View all {publisherOthers + 1} listings from {card.publisherName ?? "this publisher"}
                                                </Link>
                                            )}
                                        </div>
                                    ) : null,
                            }}
                        />
                    </div>
                </aside>
            </div>
        </div>
    );
}

const FAQS = [
    { q: "Can I change my campaign flight dates?", a: "You can request a date change from your campaign. New dates depend on availability and the booking terms shown before payment; your publisher will confirm the change before your campaign is updated." },
    { q: "How do I submit my creative artwork?", a: "After booking, upload your artwork for each space from the campaign. ADX reviews it against the space's requirements and sends it to print, or you can ask ADX's design team to prepare it." },
    { q: "What happens if the ad space is damaged during my campaign?", a: "Every installation is photographed and verified by ADX. If a space is damaged while your campaign runs, ADX arranges the fix with the publisher and credits the days lost." },
];

function Row({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <dt className={cn("text-dim", strong && "text-base font-semibold text-ink")}>
                {label}
                {note && <span className="block text-xs">{note}</span>}
            </dt>
            <dd className={cn("tabular-nums text-ink", strong && "text-lg font-extrabold")}>{value}</dd>
        </div>
    );
}

function Stars({ value, small }: { value: number; small?: boolean }) {
    return (
        <span className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={cn(small ? "size-3" : "size-5", n <= Math.round(value) ? "fill-[#f5b301] text-[#f5b301]" : "text-line")} aria-hidden />
            ))}
        </span>
    );
}
