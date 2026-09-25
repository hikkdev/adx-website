"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { cart, useCart } from "@/lib/cart";
import { ErrorNote, primaryButton, secondaryButton, smallButton } from "@/components/booking/booking-frame";
import { ChargesTable } from "@/components/booking/charges";
import { DateRangeDialog } from "@/components/booking/date-range-dialog";
import { CheckBox } from "@/components/booking/fields";
import { PrintChoice } from "@/components/booking/print-choice";
import { SpaceLineCard } from "@/components/booking/space-line";
import { kindLineOf, useListingCards } from "@/components/booking/summary-rail";
import { bookingService, estimateCart, flightDays, formatFlight, rupees } from "@/services/booking";

/**
 * "Your campaign cart" (5204:62238). The cart lives in this browser until
 * the person is signed in on an advertiser account; "Add campaign details"
 * then creates the campaign from it (`POST /campaigns`, the flight and
 * market, `PUT /campaigns/:id/spots`) and continues to the brief. A visitor
 * goes through sign-in first and comes back here with `?continue=1`, which
 * finishes the job; an account without an advertiser side opens one on the
 * way. PS-1: each print space may carry its own print choice, sent with
 * the spots when the campaign is made.
 */
export function CartView() {
    const router = useRouter();
    const params = useSearchParams();
    const { status, parties } = useAuth();
    const { lines, dates, printing } = useCart();
    const cards = useListingCards(lines.map((line) => line.listingId));
    const [datesOpen, setDatesOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const wantsContinue = params.get("continue") === "1";
    const continued = React.useRef(false);

    const days = flightDays(dates.from, dates.to);
    const printLines = lines.filter((line) => !kindLineOf(cards[line.listingId], {}).digital);
    const campaignChoice = printing ? "ADX_PRINTS" : "ADVERTISER_SHIPS";
    const estimate = estimateCart(
        lines.map((line) => ({ ratePerDay: line.ratePerDay, print: (line.fulfilment ?? campaignChoice) === "ADX_PRINTS" && !kindLineOf(cards[line.listingId], {}).digital })),
        days
    );
    const city = lines.map((line) => cards[line.listingId]?.city).find(Boolean) ?? null;

    const convert = React.useCallback(async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const campaign = await bookingService.campaignFromCart(cart.get(), { city });
            cart.clear();
            router.replace(`/advertiser/campaigns/${encodeURIComponent(campaign.id)}/details`);
        } catch (caught) {
            setError(messageOf(caught, "Could not start your campaign."));
            setBusy(false);
        }
    }, [busy, city, router]);

    const continueToDetails = () => {
        if (lines.length === 0) return;
        if (!dates.from || !dates.to) {
            setDatesOpen(true);
            return;
        }
        if (status === "signed-out") {
            router.push(`/sign-in?next=${encodeURIComponent("/cart?continue=1")}`);
            return;
        }
        if (status === "signed-in" && !parties.includes("ADVERTISER")) {
            router.push(`/choose-workspace?party=ADVERTISER&next=${encodeURIComponent("/cart?continue=1")}`);
            return;
        }
        if (status === "signed-in") void convert();
    };

    /* Back from sign-in or the workspace chooser: finish what "Add campaign details" started, once the session is known. */
    React.useEffect(() => {
        if (!wantsContinue || continued.current || status !== "signed-in" || !parties.includes("ADVERTISER")) return;
        if (lines.length === 0 || !dates.from || !dates.to) return;
        const timer = setTimeout(() => {
            if (continued.current) return;
            continued.current = true;
            void convert();
        }, 0);
        return () => clearTimeout(timer);
    }, [wantsContinue, status, parties, lines.length, dates.from, dates.to, convert]);

    return (
        <div className="flex min-h-[calc(100vh-64px)] flex-col lg:flex-row">
            <section className="bg-white px-6 py-10 lg:basis-[55%] lg:py-12 lg:pl-[max(24px,calc(100%*0.55-760px))] lg:pr-[104px]">
                <div className="ml-auto max-w-[656px]">
                    <h1 className="text-[32px] font-bold tracking-tight text-ink">Your campaign cart</h1>
                    <ErrorNote message={error} className="mt-4" />

                    {lines.length === 0 ? (
                        <div className="mt-6 rounded-lg border border-line p-8 text-center">
                            <p className="text-base font-semibold text-ink">Your cart is empty</p>
                            <p className="mt-2 text-sm text-dim">Add spaces from Explore and they will wait here, even before you sign in.</p>
                            <Link href="/spaces" className={`${primaryButton} mt-6`}>
                                Explore spaces
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="mt-6 space-y-3">
                                {lines.map((line) => {
                                    const kind = kindLineOf(cards[line.listingId], {});
                                    const rent = (Number(line.ratePerDay) || 0) * days;
                                    return (
                                        <div key={line.listingId}>
                                            <SpaceLineCard
                                                title={line.title}
                                                kindLine={kind.line}
                                                digital={kind.digital}
                                                datesLine={days > 0 ? `${formatFlight(dates.from, dates.to, { year: false })} · ${days} days · ${rupees(rent)}` : `Dates not set · ${line.ratePerDay ? `${rupees(line.ratePerDay)} / day` : "rate on request"}`}
                                                action={
                                                    <button type="button" onClick={() => cart.remove(line.listingId)} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-5 text-sm font-medium text-ink hover:border-ink">
                                                        Remove
                                                    </button>
                                                }
                                            />
                                            {!kind.digital && <PrintChoice className="mt-2 px-1" value={line.fulfilment ?? null} campaignChoice={campaignChoice} onChange={(next) => cart.setLineFulfilment(line.listingId, next)} />}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-[392px]">
                                <Link href="/spaces" className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white text-sm font-medium text-ink hover:border-ink">
                                    Review spaces
                                </Link>
                                <button type="button" onClick={() => setDatesOpen(true)} className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white text-sm font-medium text-ink hover:border-ink">
                                    {days > 0 ? "Edit dates" : "Choose dates"}
                                </button>
                            </div>

                            {printLines.length > 0 && (
                                <div className="mt-6 rounded-lg border border-line bg-white p-4 shadow-card">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <p className="text-base font-semibold text-ink">Printing and installation</p>
                                        <p className="text-xs text-dim">Selected for {printLines.map((line) => line.title).join(", ")}</p>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <div className="flex items-center justify-between rounded-md bg-ground px-3 py-2.5">
                                            <CheckBox checked={printing} onChange={(next) => cart.setPrinting(next)} label="Printing" />
                                            <span className="text-sm font-medium text-ink">{printing ? rupees(estimate.printing) : "₹0"}</span>
                                        </div>
                                        <div className="flex items-center justify-between rounded-md bg-ground px-3 py-2.5">
                                            <span className="text-sm text-ink">Installation by publisher</span>
                                            <span className="text-sm font-medium text-ink">{printing ? rupees(estimate.installation) : "₹0"}</span>
                                        </div>
                                    </div>
                                    <p className="mt-3 text-xs text-dim">{printing ? "Estimated from the rent — your publisher confirms the exact charge at review, before you pay. A space set to its own choice above keeps it." : "You will ship your own prints unless a space above says otherwise. Installation is still coordinated by your publisher."}</p>
                                </div>
                            )}

                            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                                <Link href="/spaces" className="text-sm font-medium text-ink underline underline-offset-2">
                                    Find more spaces
                                </Link>
                                <button type="button" onClick={continueToDetails} disabled={busy} className={primaryButton}>
                                    {busy ? "Creating your campaign…" : "Add campaign details"}
                                </button>
                            </div>
                            {status === "signed-out" && <p className="mt-3 text-xs text-dim">You will sign in on the next step. Your cart stays in this browser until then.</p>}
                        </>
                    )}
                </div>
            </section>

            <aside className="px-6 py-10 lg:flex-1 lg:px-16 lg:pt-[72px]">
                <div className="max-w-[470px]">
                    <h2 className="text-xl font-semibold text-ink">Campaign total</h2>
                    <ChargesTable
                        charges={estimate}
                        className="mt-4 bg-[#f2f2ef]"
                        note={lines.length > 0 ? (days > 0 ? "Estimate. Printing, installation and the platform fee are confirmed at review, before you pay." : "Choose your dates to see the rent for the flight.") : undefined}
                    />
                    {lines.length > 0 && days === 0 && (
                        <button type="button" onClick={() => setDatesOpen(true)} className={`${secondaryButton} mt-4`}>
                            Choose campaign dates
                        </button>
                    )}
                    {lines.length > 0 && days > 0 && (
                        <p className="mt-4 text-sm text-dim">
                            {lines.length} space{lines.length === 1 ? "" : "s"}{city ? ` in ${city}` : ""} · {formatFlight(dates.from, dates.to, { long: true })} · {days} days{" "}
                            <button type="button" onClick={() => setDatesOpen(true)} className={`${smallButton} ml-2 h-7 px-2.5 text-xs`}>
                                Edit dates
                            </button>
                        </p>
                    )}
                </div>
            </aside>

            {datesOpen && (
                <DateRangeDialog
                    open={datesOpen}
                    from={dates.from}
                    to={dates.to}
                    onClose={() => setDatesOpen(false)}
                    onApply={(from, to) => {
                        cart.setDates({ from, to });
                        setDatesOpen(false);
                    }}
                />
            )}
        </div>
    );
}
