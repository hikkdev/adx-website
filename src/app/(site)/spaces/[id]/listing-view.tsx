"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Calendar, Check, ChevronDown, ChevronRight, Heart, Star, X } from "lucide-react";
import { toast } from "sonner";
import { SpaceCard } from "@/components/site/space-card";
import { ApiError, messageOf } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { cart, useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";
import { browseService, formatChip, rupees, type BrowseCard, type ListingReview } from "@/services/browse";

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

export function ListingView({ id }: { id: string }) {
    const router = useRouter();
    const { status } = useAuth();
    const { lines, dates } = useCart();
    const [state, setState] = React.useState<State>({ kind: "loading" });
    const [reviews, setReviews] = React.useState<{ items: ListingReview[]; total: number } | null>(null);
    const [similar, setSimilar] = React.useState<BrowseCard[]>([]);
    const [byPublisher, setByPublisher] = React.useState<BrowseCard[]>([]);
    const [photo, setPhoto] = React.useState(0);
    const [from, setFrom] = React.useState(dates.from ?? isoToday(3));
    const [to, setTo] = React.useState(dates.to ?? isoToday(16));
    const [production, setProduction] = React.useState(true);
    const [openFaq, setOpenFaq] = React.useState(0);
    const [saved, setSaved] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        browseService
            .listing(id)
            .then((card) => {
                if (cancelled) return;
                setState({ kind: "ready", card });
                setSaved(card.saved);
                document.title = `${card.title} — ADX`;
                browseService.reviews(card.id, 1, 6).then((page) => !cancelled && setReviews({ items: page.items, total: page.total })).catch(() => undefined);
                browseService.similar(card.id).then((rows) => !cancelled && setSimilar(rows.filter((r) => r.id !== card.id).slice(0, 2))).catch(() => undefined);
                if (card.publisherId) {
                    browseService
                        .browse({ publisherId: card.publisherId, pageSize: 3 })
                        .then((page) => !cancelled && setByPublisher(page.items.filter((r) => r.id !== card.id).slice(0, 2)))
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
                <Link href="/spaces" className="mt-6 inline-block rounded-[11px] bg-brand px-6 py-3 text-sm font-semibold text-white">
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

    return (
        <div className="mx-auto max-w-[1920px] px-6 pb-16 lg:px-16">
            <nav className="flex items-center gap-1.5 py-3 text-xs text-dim" aria-label="Breadcrumb">
                <Link href="/" className="hover:text-ink">Home</Link>
                <ChevronRight className="size-3" aria-hidden />
                <Link href={card.city ? `/spaces?city=${encodeURIComponent(card.city)}` : "/spaces"} className="hover:text-ink">{card.city ?? "Spaces"}</Link>
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
                        <button type="button" onClick={toggleSave} aria-pressed={saved} className="absolute right-4 top-4 flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-ink shadow-sm">
                            <Heart className={cn("size-4", saved ? "fill-brand text-brand" : "text-ink")} aria-hidden />
                            {saved ? "Saved" : "Save"}
                        </button>
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
                            {card.availableNow ? <li>Available now for your campaign dates</li> : card.availableFrom ? <li>Available from {new Date(card.availableFrom).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</li> : null}
                            {card.publisherVerified && <li>Publisher verified by ADX · installation proof on every booking</li>}
                            {card.estimatedDailyFootfall ? <li>About {card.estimatedDailyFootfall.toLocaleString("en-IN")} people pass this space every day</li> : null}
                        </ul>
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
                        <Link href="/help#artwork" className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2">
                            View artwork requirements
                        </Link>
                    </section>

                    <section className="mt-10">
                        <h2 className="text-2xl font-bold tracking-tight text-ink">Reviews</h2>
                        {card.reviewCount > 0 && card.ratingAvg ? (
                            <>
                                <div className="mt-4 flex items-center gap-3">
                                    <span className="text-3xl font-extrabold text-ink">{Number(card.ratingAvg).toFixed(1)}</span>
                                    <Stars value={Number(card.ratingAvg)} />
                                </div>
                                <p className="mt-1 text-xs text-dim">{card.reviewCount} review{card.reviewCount === 1 ? "" : "s"}</p>
                                {reviews && reviews.items.length > 0 && (
                                    <>
                                        <p className="mt-6 text-sm font-semibold text-ink">Featured reviews</p>
                                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                                            {reviews.items.slice(0, 2).map((review) => (
                                                <div key={review.id} className="rounded-xl border border-line bg-white p-5">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-semibold text-ink">An advertiser on ADX</p>
                                                        <Stars value={review.rating} small />
                                                    </div>
                                                    <p className="mt-2 text-sm text-dim">{review.note ?? "Booked and ran on this space."}</p>
                                                    <p className="mt-2 text-xs text-dim">{new Date(review.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <p className="mt-3 text-sm text-dim">No reviews yet. Reviews come from advertisers whose campaigns ran on this space.</p>
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
                            <h2 className="text-2xl font-bold tracking-tight text-ink">Similar listing</h2>
                            <p className="mt-1 text-sm text-dim">More {formatChip(card).toLowerCase()} spaces{card.city ? ` in ${card.city}` : ""}</p>
                            <div className="mt-5 grid gap-6 md:grid-cols-2">
                                {similar.map((row) => (
                                    <SpaceCard key={row.id} card={row} />
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* ── Right: price, publisher, calculator, CTAs, questions, publisher's other spaces ── */}
                <aside className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-ink">{card.title}</h1>
                            <p className="mt-1 text-sm text-dim">{area}{card.city ? `, ${card.city}` : ""}</p>
                        </div>
                        <p className="shrink-0 text-right">
                            <span className="text-2xl font-extrabold text-ink">{card.ratePerDay ? rupees(rate * 7) : "—"}</span>
                            <span className="text-sm text-dim"> / week</span>
                        </p>
                    </div>

                    <div className="flex items-center gap-4 rounded-xl border border-line bg-white p-4">
                        {card.publisherAvatarUrl ? (
                            <img src={card.publisherAvatarUrl} alt="" className="size-11 rounded-full object-cover" />
                        ) : (
                            <span className="flex size-11 items-center justify-center rounded-full bg-ground text-sm font-semibold text-ink">{(card.publisherName ?? "P").slice(0, 2).toUpperCase()}</span>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{card.publisherName ?? "ADX publisher"}</p>
                            {card.publisherId ? (
                                <Link href={`/spaces?publisherId=${encodeURIComponent(card.publisherId)}`} className="text-xs text-dim hover:text-ink">
                                    {byPublisher.length > 0 ? `${byPublisher.length}+ other spaces · ` : ""}View publisher →
                                </Link>
                            ) : (
                                <p className="text-xs text-dim">{card.publisherVerified ? "Verified by ADX" : "Listed on ADX"}</p>
                            )}
                        </div>
                        {card.ratingAvg && (
                            <span className="flex items-center gap-1 rounded-md bg-ground px-2.5 py-1.5 text-xs font-semibold text-ink">
                                <Star className="size-3.5 fill-[#f5b301] text-[#f5b301]" aria-hidden />
                                {Number(card.ratingAvg).toFixed(1)}
                            </span>
                        )}
                    </div>

                    <div className="rounded-xl border border-line bg-white p-4">
                        <p className="text-sm font-semibold text-ink">Plan your booking</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <label className="flex h-11 items-center gap-2.5 rounded-md border border-line px-3 text-sm text-ink">
                                <Calendar className="size-[18px] text-dim" aria-hidden />
                                <input type="date" value={from} min={isoToday()} onChange={(e) => setFrom(e.target.value)} aria-label="Start date" className="min-w-0 flex-1 bg-transparent focus:outline-none" />
                            </label>
                            <label className="flex h-11 items-center gap-2.5 rounded-md border border-line px-3 text-sm text-ink">
                                <Calendar className="size-[18px] text-dim" aria-hidden />
                                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="End date" className="min-w-0 flex-1 bg-transparent focus:outline-none" />
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
                        {card.display === "DIGITAL" && (
                            <p className="mt-4 text-xs text-dim">
                                {card.slotsLeft > 0 ? `${card.slotsLeft} of ${card.slotsTotal} slots free for these dates` : "Every slot is booked for these dates"}
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
                        <Link href="/help#booking" className="text-sm font-medium text-ink underline underline-offset-2">Ask about this space</Link>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {["Can I change my dates?", "What artwork is required?", "How do I track my campaign?"].map((q) => (
                                <Link key={q} href={`/help?q=${encodeURIComponent(q)}`} className="rounded-full border border-line bg-white px-3.5 py-2.5 text-xs text-ink hover:border-ink">
                                    {q}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {byPublisher.length > 0 && (
                        <div className="pt-6">
                            <h2 className="text-2xl font-bold tracking-tight text-ink">Publisher listing</h2>
                            <p className="mt-1 text-sm text-dim">More spaces from {card.publisherName ?? "this publisher"}</p>
                            <div className="mt-5 grid gap-4">
                                {byPublisher.map((row) => (
                                    <SpaceCard key={row.id} card={row} />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="pt-6">
                        <p className="text-xs text-dim">Advertisement</p>
                        <div className="mt-2 flex h-[325px] items-center justify-center rounded-xl border border-dashed border-line bg-white text-sm text-dim">Reserved ad space</div>
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
