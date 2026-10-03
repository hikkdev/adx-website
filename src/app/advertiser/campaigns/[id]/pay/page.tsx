"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Info } from "lucide-react";
import { toast } from "sonner";
import { ApiError, isFeatureOff, messageOf } from "@/lib/api-client";
import { FLAG_PAYMENT_GATEWAYS, useSwitchedOff } from "@/lib/flags";
import { FeatureOff } from "@/components/platform/feature-off";
import { BookingCard, EditLink, ErrorNote, primaryButton, smallButton } from "@/components/booking/booking-frame";
import { billingDraft } from "@/components/booking/billing-draft";
import { ClashList } from "@/components/booking/clash-hint";
import { AgreementAccept } from "@/components/agreements/agreement-accept";
import { AgeGate, useAgeGate, type AgeGate as AgeGateControl } from "@/components/checkout/age-gate";
import { FloatingField, RadioDot } from "@/components/booking/fields";
import { InsertionOrderPanel, insertionOrderSettled } from "@/components/booking/insertion-order";
import { launchGateway, recordAgreements, reserveCheckoutWindow, returnHref } from "@/components/booking/pay-launch";
import { PromoCode } from "@/components/booking/promo-code";
import { ReservationPanel } from "@/components/booking/reservation-panel";
import { StepPage, accountNameOf, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { SummaryRail } from "@/components/booking/summary-rail";
import { bookingService, chargesOf, discountLabel, estimateCart, flightDays, formatFlight, rupees, signHref, signingFromError, splitBillingAddress, type Campaign, type CampaignReview, type Eligibility, type PromoDiscount, type WalletView } from "@/services/booking";
import { formatMoney, subtractMoney, walletCovers } from "@/services/campaigns";
import { GATEWAY_LABEL, UPI_ID_PATTERN, UTR_PATTERN, notAvailableYet, paymentsService, pickGateway, upiCollectOf, type BankTransferDetails, type GatewayStatus, type PayMethod, type PaymentIntent, type PaymentPurpose, type PaymentSummary } from "@/services/payments";
import { reservationOffered, reservationOfferLine, reservationService } from "@/services/reservation";

/**
 * Review & pay (5204:64952, 5204:65488 for UPI, 5199:7072 for direct
 * banking): the campaign and billing summary, how to pay — card or UPI
 * through the configured gateway, or a bank transfer against ADX's account
 * with the UTR claimed here — the promo code, and the total. The card path
 * goes on to 5204:67916; UPI opens the gateway from here. RF-1: a big
 * checkout may be reserved first against a fee (`POST /campaigns/:id/reserve`),
 * paid from the wallet or through the same intents with
 * `purpose: 'RESERVATION_FEE'`; once paid, the buttons collect the balance.
 * UP-1: the UPI id rides on the intent — Cashfree sends a collect request.
 *
 * Parity with the app's authorize step: the ADX wallet is the first way to
 * pay when it covers the amount (`POST /campaigns/:id/authorize` — held now,
 * charged when the campaign starts), and the insertion order is its own
 * versioned text, accepted — or, above the policy's threshold, e-signed on
 * `/sign/:id` and back here — before any button opens.
 *
 * The `payments.gateways` kill switch guards `POST /payments/intents`, where
 * card, UPI and a bank transfer all start: while the platform has it off,
 * none of the three is offered and one plain line stands in their place;
 * the wallet (and the reservation fee from it) pays as before.
 *
 * 29 Sep 2026: an order needs the person placing it to be 18 or over. Every
 * way to pay here — and the reservation — goes through the age gate
 * (`components/checkout/age-gate.tsx`): no date of birth on file asks for it
 * on the spot and then carries on; under 18, the buttons wait.
 */
export default function PayPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={4} back={null} title={() => "Review & pay"} subtitle={(ready) => `${accountNameOf(ready.advertiser)} · ${ready.campaign.name}`}>
            {(ready) => <Pay key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

type Method = PayMethod | "WALLET";

function Pay({ ready }: { ready: ReadyCampaign }) {
    const router = useRouter();
    const { campaign, review, advertiser } = ready;
    const [picked, setMethod] = React.useState<Method | null>(null);
    const [wallet, setWallet] = React.useState<WalletView | null>(null);
    const [platformOpen, setPlatformOpen] = React.useState(false);
    const [gateways, setGateways] = React.useState<GatewayStatus[] | null>(null);
    const [bank, setBank] = React.useState<BankTransferDetails | null>(null);
    const [eligibility, setEligibility] = React.useState<Eligibility | null>(null);
    const [promo, setPromo] = React.useState<PromoDiscount | null>(review?.promo ?? null);
    /* Bumped when the platform agreement is accepted here, so the eligibility is read again. */
    const [eligibilityTick, setEligibilityTick] = React.useState(0);
    const [upiId, setUpiId] = React.useState("");
    const [breakdown, setBreakdown] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const draft = React.useMemo(() => billingDraft.read(campaign.id), [campaign.id]);
    /* The kill switch on the intents: card, UPI and the bank transfer go; the wallet stays. */
    const gatewaysOff = useSwitchedOff(FLAG_PAYMENT_GATEWAYS);
    /* 29 Sep 2026: 18 or over to order — asked here when the date of birth is missing. */
    const age = useAgeGate();

    /* RF-1: the reservation as it stands, and the offer the review makes. */
    const reservation = campaign.reservation ?? null;
    const feeDue = reservation?.status === "DUE";
    const feePaid = reservation?.status === "PAID";
    const offer = review?.reservationFee ?? null;
    const retainPct = offer?.retainPct ?? null;

    React.useEffect(() => {
        let cancelled = false;
        paymentsService
            .gateways()
            .then((rows) => {
                if (!cancelled) setGateways(rows);
            })
            .catch(() => {
                if (!cancelled) setGateways([]);
            });
        /* The bank rail is offered only when ADX has an account to name; a 404 is an older backend, and the row stays hidden. */
        paymentsService
            .bankTransferDetails()
            .then((answer) => {
                if (!cancelled && answer.configured) setBank(answer.details);
            })
            .catch(() => undefined);
        if (advertiser) {
            bookingService
                .wallet(advertiser.id)
                .then((row) => {
                    if (!cancelled) setWallet(row);
                })
                .catch(() => undefined);
        }
        return () => {
            cancelled = true;
        };
    }, [advertiser]);

    React.useEffect(() => {
        if (!advertiser) return;
        let cancelled = false;
        bookingService
            .eligibility(advertiser.id)
            .then((row) => {
                if (!cancelled) setEligibility(row);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [advertiser, eligibilityTick]);

    const charges = review ? chargesOf(review) : estimateCart(campaign.spots.map((spot) => ({ ratePerDay: spot.ratePerDay, print: campaign.fulfilment !== "ADVERTISER_SHIPS" })), flightDays(campaign.startDate, campaign.endDate));
    /* The full payment's amount is already total − fee on the server once the fee is PAID; the fee itself while it is DUE. */
    const payable = feePaid && reservation?.payable ? Number(reservation.payable) : charges.total;
    const collecting = feeDue && reservation ? Number(reservation.fee) : payable;
    const purpose: PaymentPurpose | undefined = feeDue ? "RESERVATION_FEE" : undefined;
    const gateway = gateways ? pickGateway(gateways) : null;
    const upiValid = !upiId || UPI_ID_PATTERN.test(upiId.trim());
    const insertionOrderOk = review ? insertionOrderSettled(review) : true;
    const needsPlatform = eligibility?.blockedBy.includes("AGREEMENT") ?? false;
    const profileIncomplete = eligibility?.blockedBy.includes("PROFILE") ?? false;
    const suspended = eligibility?.blockedBy.includes("SUSPENDED") ?? false;
    const agreementsOk = insertionOrderOk && !needsPlatform;
    const payHref = stepHref(campaign.id, "pay");
    /* The wallet pays what is due now: the balance once the fee is PAID, else the whole checkout — compared in paise. */
    const due = feePaid && reservation?.payable ? reservation.payable : (review?.total ?? String(charges.total));
    const covers = !!wallet && walletCovers(wallet.spendable, due);
    const walletShortBy = wallet && !covers ? subtractMoney(due, wallet.spendable) : null;
    const walletOffered = !!wallet && !feeDue;
    /* Switched off, the wallet is the only way offered — a card, UPI or bank choice made before the switch does not stand. */
    const method: Method | null = gatewaysOff ? (walletOffered ? "WALLET" : null) : (picked ?? (walletOffered && covers ? "WALLET" : "CARD"));
    const address = splitBillingAddress(advertiser?.billingAddress);
    const billing = {
        name: draft?.legalName ?? advertiser?.companyName ?? accountNameOf(advertiser),
        contact: advertiser?.name ?? null,
        email: draft?.email ?? advertiser?.email ?? null,
        gstin: draft?.gstin ?? advertiser?.gstin ?? null,
        address: [draft?.street ?? address.street, draft?.city ?? advertiser?.city].filter(Boolean).join(", "),
    };

    const blocked = suspended ? "This account cannot start a new campaign right now. Contact ADX support." : profileIncomplete ? "Complete your billing details before paying." : null;
    const canReserve = !!review && reservationOffered(offer, reservation) && !blocked && review.clashes.length === 0;

    const gates = async () => {
        if (!advertiser) throw new ApiError(0, "NO_ADVERTISER", "Your advertiser account could not be read.");
        await recordAgreements(advertiser, campaign.id, review, eligibility);
    };

    /** RF-1: the two refusals the reserve and fee doors make, in the page's own words. */
    const reservationMessage = (caught: unknown, fallback: string): string => {
        if (caught instanceof ApiError && caught.code === "RESERVATION_NOT_OFFERED") return caught.message || "Reserving for a fee is not offered on this checkout — pay in full to book.";
        if (caught instanceof ApiError && caught.code === "RESERVATION_FEE_LAPSED") return "The time to pay the reservation fee has passed. Reserve again, or pay in full.";
        return messageOf(caught, fallback);
    };

    /** The same, but nothing for the payments kill switch — its own line takes the options' place once the 503 lands. */
    const refusal = (caught: unknown, fallback: string): string | null => (isFeatureOff(caught, FLAG_PAYMENT_GATEWAYS) ? null : reservationMessage(caught, fallback));

    const openGateway = async (method: PayMethod) => {
        if (!gateway) return;
        const win = reserveCheckoutWindow();
        try {
            await gates();
            const launched = await launchGateway(campaign.id, gateway.gateway, method, win, { purpose, ...(method === "UPI" && upiId.trim() ? { upiId: upiId.trim() } : {}) });
            const collect = upiCollectOf(launched.intent);
            if (collect?.requested) toast.success(`Approve the ${rupees(launched.intent.payment.amount)} request in the UPI app for ${collect.upiId}.`);
            else if (collect && !collect.requested) toast.message("Cashfree could not send a collect request to that UPI id — pay on its page instead.");
            router.push(`${returnHref(campaign.id, launched.intent.payment.id, purpose)}${collect?.requested ? "&collect=1" : ""}`);
        } catch (caught) {
            win?.close();
            throw caught;
        }
    };

    const continueWithCard = async () => {
        if (busy || !age.ready(() => void continueWithCard())) return;
        setBusy(true);
        setError(null);
        try {
            if (feeDue) {
                /* The fee goes straight to the gateway's page — the card page is for the whole campaign. */
                await openGateway("CARD");
                return;
            }
            await gates();
            router.push(stepHref(campaign.id, "pay/card"));
        } catch (caught) {
            if (!age.caught(caught, () => void continueWithCard())) setError(refusal(caught, "Could not continue to the card page."));
            setBusy(false);
        }
    };

    const payWithUpi = async () => {
        if (busy || !gateway || !upiValid || !age.ready(() => void payWithUpi())) return;
        setBusy(true);
        setError(null);
        try {
            await openGateway("UPI");
        } catch (caught) {
            if (!age.caught(caught, () => void payWithUpi())) setError(refusal(caught, "Could not open the payment page."));
            setBusy(false);
        }
    };

    const reserve = async () => {
        if (busy || !canReserve || !age.ready(() => void reserve())) return;
        setBusy(true);
        setError(null);
        try {
            const answer = await reservationService.reserve<Campaign, CampaignReview>(campaign.id);
            ready.applyCampaign(answer.campaign);
            ready.applyReview(answer.review);
            toast.success(`Spots reserved. Pay the ${rupees(answer.reservation.fee)} fee within ${offer?.payWithinMinutes ?? 60} minutes to hold them.`);
        } catch (caught) {
            if (!age.caught(caught, () => void reserve())) setError(reservationMessage(caught, "Could not reserve these spots."));
        } finally {
            setBusy(false);
        }
    };

    /** The app's "Pay from the wallet": the amount is held on the wallet now and charged when the campaign starts. */
    const payFromWallet = async () => {
        if (busy || !covers || !age.ready(() => void payFromWallet())) return;
        setBusy(true);
        setError(null);
        try {
            await gates();
            const result = await bookingService.authorize(campaign.id);
            const failed = result.failedSpots?.length ?? 0;
            router.push(`${stepHref(campaign.id, "submitted")}?via=wallet${failed ? `&failed=${failed}` : ""}`);
        } catch (caught) {
            if (age.caught(caught, () => void payFromWallet())) {
                setBusy(false);
                return;
            }
            /* DS-3: the gate carries the open signing request — straight to it, and back here after. */
            const requestId = signingFromError(caught);
            if (requestId) {
                router.push(signHref(requestId, payHref));
                return;
            }
            setError(
                caught instanceof ApiError && caught.code === "INSUFFICIENT_FUNDS"
                    ? gatewaysOff
                        ? "Your wallet no longer covers this campaign."
                        : "Your wallet no longer covers this campaign. Pay by card, UPI or bank transfer — it tops up the wallet and books the campaign in one go."
                    : reservationMessage(caught, "Could not pay from your wallet.")
            );
            setBusy(false);
        }
    };

    const payFeeFromWallet = async () => {
        if (busy || !reservation || !age.ready(() => void payFeeFromWallet())) return;
        setBusy(true);
        setError(null);
        try {
            const answer = await reservationService.payFromWallet<Campaign>(campaign.id);
            ready.applyCampaign(answer.campaign);
            toast.success(`Reservation fee of ${rupees(answer.reservation.fee)} taken from your wallet. The spots are held.`);
        } catch (caught) {
            if (!age.caught(caught, () => void payFeeFromWallet())) setError(reservationMessage(caught, "Could not take the fee from your wallet — top it up, or pay the fee by card, UPI or bank transfer."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
                <BookingCard className="p-0">
                    <h2 className="border-b border-line px-6 py-4 text-base font-semibold text-ink">Campaign &amp; billing</h2>
                    <div className="px-6 py-4 text-sm text-ink">
                        <p className="font-semibold">{campaign.name}</p>
                        <p className="mt-1">
                            {campaign.spots.length} space{campaign.spots.length === 1 ? "" : "s"} selected
                        </p>
                        <p className="mt-1">{formatFlight(campaign.startDate, campaign.endDate, { long: true })}</p>
                    </div>
                    <div className="bg-ground px-6 py-4 text-sm text-ink">
                        <p className="font-semibold">{billing.name}</p>
                        {billing.contact && <p className="mt-1">Billing contact · {billing.contact}</p>}
                        <p className="mt-1">{billing.email ?? "No billing email"}</p>
                    </div>
                    <div className="px-6 py-4 text-sm text-ink">
                        <p className="font-semibold">Tax details</p>
                        <p className="mt-1">{billing.gstin ? `GSTIN ${billing.gstin}` : "GST details not added"}</p>
                        <p className="mt-1">{billing.address || <span className="text-brand">No billing address yet</span>}</p>
                        {draft && <p className="mt-1 text-xs text-dim">Not saved to your profile — the invoice carries what your profile holds.</p>}
                    </div>
                    <div className="flex justify-end px-6 pb-4">
                        <EditLink href={stepHref(campaign.id, "review/billing")} label="Edit billing" />
                    </div>
                </BookingCard>

                <BookingCard className="p-0">
                    <h2 className="border-b border-line px-6 py-4 text-base font-semibold text-ink">{feeDue ? "Pay the reservation fee" : feePaid ? "Pay the balance" : "Choose how to pay"}</h2>
                    <div className="space-y-3 px-4 py-4">
                        {reservation && (reservation.status === "DUE" || reservation.status === "PAID" || reservation.status === "LAPSED" || reservation.status === "RETAINED") && (
                            <ReservationPanel reservation={reservation} retainPct={retainPct}>
                                {feeDue && (
                                    <button type="button" onClick={() => void payFeeFromWallet()} disabled={busy || !!blocked || age.blocked} className={smallButton}>
                                        {busy ? "Please wait…" : `Pay ${rupees(reservation.fee)} from my wallet`}
                                    </button>
                                )}
                            </ReservationPanel>
                        )}
                        {feeDue && !gatewaysOff && <p className="px-1 text-xs text-dim">Or pay the fee by card, UPI or bank transfer below — the rest of the checkout waits until the spots are held.</p>}
                        {walletOffered && wallet && (
                            <div className={`rounded-md border ${method === "WALLET" ? "border-brand bg-[#fff7f7]" : "border-line bg-white"}`}>
                                <button type="button" role="radio" aria-checked={method === "WALLET"} disabled={!covers} onClick={() => setMethod("WALLET")} className="flex h-12 w-full items-center gap-4 px-4 text-left disabled:cursor-not-allowed">
                                    <RadioDot checked={method === "WALLET"} />
                                    <span className="flex-1 text-sm font-semibold text-ink">ADX wallet</span>
                                    <span className="text-sm text-dim">{formatMoney(wallet.spendable)} available</span>
                                </button>
                                <div className="px-4 pb-3 text-xs text-dim">
                                    {covers ? "Held on your wallet now and charged when the campaign starts." : `Your wallet is ${formatMoney(walletShortBy)} short.${gatewaysOff ? "" : " Pay by card, UPI or bank transfer below — it tops up the wallet and books the campaign in one go."}`}
                                    {Number(wallet.goodwill) > 0 && ` ${formatMoney(wallet.goodwill)} of the balance is ADX credit, spent before your own money.`}
                                    {!covers && (
                                        <>
                                            {" "}
                                            <Link href="/advertiser/billing" className="font-medium text-ink underline underline-offset-2">
                                                Top up your wallet
                                            </Link>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                        {gatewaysOff ? (
                            <FeatureOff flag={FLAG_PAYMENT_GATEWAYS}>{walletOffered || feeDue ? "Pay from your ADX wallet, or come back later." : undefined}</FeatureOff>
                        ) : (
                            <>
                                <MethodRow checked={method === "CARD"} onSelect={() => setMethod("CARD")} label="Credit / debit card" trailing={<CardMarks />} />
                                <MethodRow checked={method === "UPI"} onSelect={() => setMethod("UPI")} label="UPI" centred />
                                {method === "UPI" && (
                                    <div className="px-1">
                                        <FloatingField label="UPI ID (optional)" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourname@okaxis" invalid={!upiValid} autoComplete="off" />
                                        <p className="mt-2 text-xs text-dim">
                                            {gateway?.gateway === "CASHFREE"
                                                ? "With a UPI id, Cashfree sends a collect request straight to your UPI app — approve it there. Its page still opens in case you would rather scan."
                                                : gateway?.gateway === "RAZORPAY"
                                                  ? "Your UPI id is filled in on Razorpay's page; approve the request in your UPI app to complete payment."
                                                  : "Approve the request in your UPI app to complete payment."}
                                        </p>
                                    </div>
                                )}
                                {bank && (
                                    <BankTransferRow
                                        key={purpose ?? "SETTLEMENT"}
                                        campaignId={campaign.id}
                                        details={bank}
                                        checked={method === "BANK_TRANSFER"}
                                        onSelect={() => setMethod("BANK_TRANSFER")}
                                        amount={collecting}
                                        purpose={purpose}
                                        disabled={!!blocked || !agreementsOk || age.blocked}
                                        age={age}
                                        onBeforeIntent={gates}
                                        onClaimed={(payment) => {
                                            if (purpose === "RESERVATION_FEE") {
                                                toast.success("Transfer recorded. The spots are held once ADX confirms it.");
                                                ready.reload();
                                                return;
                                            }
                                            router.push(`${stepHref(campaign.id, "submitted")}?payment=${encodeURIComponent(payment.id)}`);
                                        }}
                                    />
                                )}

                                {gateways && !gateway && method !== "BANK_TRANSFER" && <p className="rounded-md bg-ground px-3 py-2 text-sm text-dim">No card or UPI gateway is set up yet — ask ADX{bank ? ", or pay by bank transfer" : ""}.</p>}
                            </>
                        )}

                        <PromoCode
                            className="px-1 pt-2"
                            campaignId={campaign.id}
                            promo={promo}
                            onReview={(next, code) => {
                                ready.applyReview(next);
                                setPromo(code);
                            }}
                        />

                        <div className="border-t border-line pt-4">
                            {review && (
                                <div className="mb-4 px-1">
                                    <InsertionOrderPanel campaign={campaign} review={review} advertiser={advertiser} returnTo={payHref} onChanged={ready.reload} />
                                </div>
                            )}
                            {needsPlatform && (
                                <div className="mb-4 px-1">
                                    {platformOpen ? (
                                        <AgreementAccept
                                            kind="ADVERTISER_PLATFORM"
                                            intro="One agreement, covering everything you book on ADX — accepted once, before your first payment."
                                            acceptLabel="Accept the agreement"
                                            onAccepted={() => {
                                                setPlatformOpen(false);
                                                setEligibilityTick((t) => t + 1);
                                            }}
                                            onCancel={() => setPlatformOpen(false)}
                                        />
                                    ) : (
                                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-4">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-ink">ADX advertiser agreement</p>
                                                <p className="mt-1 text-sm text-dim">Accept it once, before your first payment. It covers what you are buying and what happens if a site becomes unavailable.</p>
                                            </div>
                                            <button type="button" onClick={() => setPlatformOpen(true)} className={smallButton}>
                                                Read and accept it
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {blocked && (
                                <p className="mb-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-ink">
                                    {blocked}{" "}
                                    {profileIncomplete && (
                                        <Link href={stepHref(campaign.id, "review/billing")} className="font-medium underline underline-offset-2">
                                            Billing details
                                        </Link>
                                    )}
                                </p>
                            )}
                            {review && review.clashes.length > 0 && (
                                <div className="mb-4 rounded-md border border-[#f3c1c1] bg-[#fdf2f2] px-3 py-3" data-testid="pay-clashes">
                                    <p className="text-sm text-[#b42318]">
                                        {review.clashes.map((c) => c.title).join(", ")} no longer {review.clashes.length === 1 ? "has" : "have"} a slot on these dates.{" "}
                                        <Link href={stepHref(campaign.id, "spaces")} className="font-medium underline underline-offset-2">
                                            Remove {review.clashes.length === 1 ? "it" : "them"} or change the dates
                                        </Link>
                                    </p>
                                    <ClashList className="mt-3" clashes={review.clashes} length={review.days || flightDays(campaign.startDate, campaign.endDate)} quantityOf={(spotId) => review.lines.find((l) => l.spotId === spotId)?.quantity} campaignDates={{ from: campaign.startDate, to: campaign.endDate }} />
                                </div>
                            )}
                            <AgeGate gate={age} className="mb-4" />
                            <p className="px-1 text-sm text-dim">
                                Your artwork will be reviewed after payment.{" "}
                                <Link href={stepHref(campaign.id, "review")} className="underline underline-offset-2">
                                    Review booking details.
                                </Link>
                            </p>
                            <div className="mt-4 flex flex-wrap items-end justify-between gap-4 px-1">
                                <div>
                                    <p className="text-2xl font-semibold text-ink">{rupees(collecting)}</p>
                                    {feeDue && <p className="text-xs text-dim">Reservation fee · the campaign total is {rupees(charges.total)}</p>}
                                    {feePaid && <p className="text-xs text-dim">Balance · {rupees(charges.total)} less the {rupees(reservation!.fee)} fee already paid</p>}
                                    <button type="button" onClick={() => setBreakdown((b) => !b)} className="mt-1 text-sm text-dim underline underline-offset-2 hover:text-ink">
                                        {breakdown ? "Hide price breakdown" : "Review price breakdown"}
                                    </button>
                                </div>
                                {method === "WALLET" && (
                                    <button type="button" disabled={busy || !covers || !!blocked || !agreementsOk || review === null || review.clashes.length > 0 || age.blocked} onClick={() => void payFromWallet()} className={primaryButton}>
                                        {busy ? "Please wait…" : feePaid ? `Pay the balance ${rupees(collecting)} from my wallet` : `Pay ${rupees(collecting)} from my wallet`}
                                    </button>
                                )}
                                {method === "CARD" && (
                                    <button type="button" disabled={busy || !gateway || !!blocked || !agreementsOk || age.blocked} onClick={() => void continueWithCard()} className={primaryButton}>
                                        {busy ? "Please wait…" : feeDue ? `Pay ${rupees(collecting)} fee with card` : feePaid ? `Pay the balance ${rupees(collecting)} with card` : "Continue with card"}
                                    </button>
                                )}
                                {method === "UPI" && (
                                    <button type="button" disabled={busy || !gateway || !!blocked || !agreementsOk || !upiValid || age.blocked} onClick={() => void payWithUpi()} className={primaryButton}>
                                        {busy ? "Opening…" : feeDue ? `Pay ${rupees(collecting)} fee with UPI` : feePaid ? `Pay the balance ${rupees(collecting)} with UPI` : `Pay ${rupees(collecting)} with UPI`}
                                    </button>
                                )}
                            </div>
                            {breakdown && (
                                <dl className="mt-3 space-y-1 rounded-md bg-ground px-3 py-3 text-sm">
                                    <Line label="Media rent" value={rupees(charges.mediaRent)} />
                                    {charges.fees.map((fee) => (
                                        <Line key={fee.label} label={fee.label} value={rupees(fee.amount)} />
                                    ))}
                                    {charges.discount > 0 && <Line label="Discount" value={discountLabel(charges)} />}
                                    <Line label={charges.discount > 0 ? "GST on the discounted value" : "GST"} value={rupees(charges.gst)} />
                                    <Line label="Total" value={rupees(charges.total)} strong />
                                    {feePaid && reservation && <Line label="Reservation fee paid" value={`− ${rupees(reservation.fee)}`} />}
                                    {feePaid && <Line label="Balance payable" value={rupees(payable)} strong />}
                                </dl>
                            )}
                            <ErrorNote message={error} className="mt-4" />
                            {canReserve && offer && (
                                <div className="mt-4 rounded-md border border-line bg-ground px-4 py-3">
                                    <p className="text-sm font-semibold text-ink">Not ready to pay in full?</p>
                                    <p className="mt-1 text-sm text-ink">{reservationOfferLine(offer)}</p>
                                    <button type="button" onClick={() => void reserve()} disabled={busy || age.blocked} className={`${smallButton} mt-3`}>
                                        {busy ? "Please wait…" : `Reserve these spots for ${offer.holdHours} hours`}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </BookingCard>
            </div>

            <SummaryRail
                campaign={campaign}
                review={review}
                charges={charges}
                promo={promo}
                before={
                    <div className="mt-6">
                        <p className="text-base font-semibold text-ink">Before you pay</p>
                        <p className="mt-1 text-sm text-ink">Payment reserves your spaces. Artwork review and production follow. Track each step in your campaign.</p>
                    </div>
                }
            />
        </div>
    );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className="flex justify-between gap-4">
            <dt className={strong ? "font-semibold text-ink" : "text-dim"}>{label}</dt>
            <dd className={strong ? "font-semibold text-ink" : "text-ink"}>{value}</dd>
        </div>
    );
}

function MethodRow({ checked, onSelect, label, trailing, centred }: { checked: boolean; onSelect: () => void; label: string; trailing?: React.ReactNode; centred?: boolean }) {
    return (
        <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className={`flex h-12 w-full items-center gap-4 rounded-md border px-4 text-left ${checked ? "border-line bg-white" : "border-line bg-white hover:border-ink"}`}>
            <RadioDot checked={checked} />
            <span className={`text-sm font-semibold text-ink ${centred ? "flex-1 text-center" : "flex-1"}`}>{label}</span>
            {trailing}
        </button>
    );
}

function CardMarks() {
    return (
        <span className="flex items-center gap-1.5" aria-label="Visa, American Express and Mastercard accepted">
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-bold italic text-[#1a1f71]">VISA</span>
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-bold text-[#006fcf]">AMEX</span>
            <span className="flex items-center rounded border border-line px-1.5 py-0.5">
                <span className="size-2.5 rounded-full bg-[#eb001b]" />
                <span className="-ml-1 size-2.5 rounded-full bg-[#f79e1b]" />
            </span>
        </span>
    );
}

/**
 * Direct banking (5199:7072): the account to pay into, the exact amount and
 * the reference the intent minted, each with a copy; then the UTR claim.
 * `GET /payments/bank-transfer/details` says whether the rail is offered;
 * the BANK_TRANSFER intent carries the reference and the amount; the claim
 * is `POST /payments/:id/bank-transfer/submit`, and ops confirm it later.
 */
function BankTransferRow({ campaignId, details, checked, onSelect, amount, purpose, disabled, age, onBeforeIntent, onClaimed }: { campaignId: string; details: BankTransferDetails; checked: boolean; onSelect: () => void; amount: number; purpose?: PaymentPurpose; disabled: boolean; age: AgeGateControl; onBeforeIntent: () => Promise<void>; onClaimed: (payment: PaymentSummary) => void }) {
    const [intent, setIntent] = React.useState<PaymentIntent | null>(null);
    const [utr, setUtr] = React.useState("");
    const [paidOn, setPaidOn] = React.useState(() => new Date().toISOString().slice(0, 10));
    const [paid, setPaid] = React.useState(String(Math.round(amount)));
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState<string | null>(null);

    const reference = async () => {
        /* A bank transfer is an order too: the age gate (drawn by the page, beside its pay button) asks first. */
        if (busy || intent || !age.ready(() => void reference())) return;
        setBusy(true);
        setError(null);
        try {
            await onBeforeIntent();
            const answer = await paymentsService.createIntent({ campaignId, gateway: "BANK_TRANSFER", ...(purpose ? { purpose } : {}) });
            setIntent(answer);
            if (answer.bankTransfer?.amount) setPaid(String(Math.round(Number(answer.bankTransfer.amount))));
        } catch (caught) {
            /* The kill switch says nothing here: the page's own line replaces the row once the 503 lands. */
            if (!age.caught(caught, () => void reference())) setError(isFeatureOff(caught, FLAG_PAYMENT_GATEWAYS) ? null : notAvailableYet(caught) ? "Bank transfer is not available yet. Choose card or UPI." : messageOf(caught, "Could not prepare the transfer."));
        } finally {
            setBusy(false);
        }
    };

    const claim = async () => {
        if (!intent || busy) return;
        if (!UTR_PATTERN.test(utr.trim())) {
            setError("Enter the UTR or transaction reference your bank gave you (12–22 letters and digits).");
            return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
            setError("Say which day you made the transfer.");
            return;
        }
        if (!(Number(paid) > 0)) {
            setError("Enter the amount you transferred.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const payment = await paymentsService.submitBankTransfer(intent.payment.id, { utr: utr.trim(), paidOn, amount: Number(paid).toFixed(2) });
            onClaimed(payment);
        } catch (caught) {
            setError(notAvailableYet(caught) ? "Bank transfer confirmation is not available yet. Keep your UTR — ADX support can record it." : messageOf(caught, "Could not record the transfer."));
            setBusy(false);
        }
    };

    const copy = async (label: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(label);
            setTimeout(() => setCopied(null), 1500);
        } catch {
            /* ignore */
        }
    };

    const account = intent?.bankTransfer ?? details;
    const transferAmount = intent?.bankTransfer?.amount ?? intent?.payment.amount ?? amount;
    const referenceId = intent?.bankTransfer?.reference ?? intent?.payment.reference ?? null;

    return (
        <div className={`rounded-md border ${checked ? "border-brand bg-[#fff7f7]" : "border-line bg-white"}`}>
            <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className="flex h-12 w-full items-center gap-4 px-4 text-left">
                <RadioDot checked={checked} />
                <span className="text-sm font-semibold text-ink">Direct Banking (NEFT / RTGS / IMPS)</span>
            </button>
            {checked && (
                <div className="px-4 pb-4">
                    <div className="rounded-md bg-ground p-4">
                        <p className="text-sm font-semibold text-ink">{purpose === "RESERVATION_FEE" ? "Transfer the exact reservation fee to the bank account below:" : "Transfer the exact total amount to the bank account below:"}</p>
                        <dl className="mt-2 divide-y divide-line text-sm">
                            <BankRow label="Bank Name" value={`${account.bank}${account.branch ? ` · ${account.branch}` : ""}`} />
                            <BankRow label="Account Name" value={account.beneficiary} onCopy={() => void copy("Account Name", account.beneficiary)} copied={copied === "Account Name"} />
                            <BankRow label="Account Number" value={account.accountNumber} onCopy={() => void copy("Account Number", account.accountNumber)} copied={copied === "Account Number"} />
                            <BankRow label="IFSC Code" value={account.ifsc} onCopy={() => void copy("IFSC Code", account.ifsc)} copied={copied === "IFSC Code"} />
                            <BankRow label="Transfer Amount" value={rupees(transferAmount)} />
                            <BankRow
                                label="Reference ID"
                                value={
                                    referenceId ?? (
                                        <button type="button" disabled={busy || disabled} onClick={() => void reference()} className={`${smallButton} h-8`}>
                                            {busy ? "Preparing…" : "Get a reference"}
                                        </button>
                                    )
                                }
                                onCopy={referenceId ? () => void copy("Reference ID", referenceId) : undefined}
                                copied={copied === "Reference ID"}
                            />
                        </dl>
                        <p className="mt-3 flex items-start gap-1.5 text-xs text-dim">
                            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            {account.instructions || "Transfer the exact amount using NEFT, RTGS, or IMPS. Use the Reference ID as the payment remark. Payments are verified within 24–48 hours."}
                        </p>
                        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-brand-soft px-3 py-2 text-xs text-brand">
                            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            Please share the payment confirmation/UTR number after transfer for faster verification.
                        </p>
                        {!referenceId && disabled && <p className="mt-2 text-xs text-dim">Accept the insertion order and the agreement above to get your reference.</p>}
                    </div>
                    {intent && (
                        <div className="mt-4">
                            <p className="text-sm font-semibold text-ink">Payment confirmation</p>
                            <div className="mt-2 grid gap-3">
                                <FloatingField label="UTR / transaction reference" value={utr} onChange={(e) => setUtr(e.target.value.toUpperCase())} placeholder="e.g. HDFCN52026092512345" />
                                <div className="grid gap-3 md:grid-cols-2">
                                    <FloatingField label="Paid on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
                                    <FloatingField label="Amount (₹)" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} />
                                </div>
                            </div>
                            <button type="button" disabled={busy || disabled} onClick={() => void claim()} className={`${primaryButton} mt-3`}>
                                {busy ? "Recording…" : "I have transferred — submit"}
                            </button>
                            <p className="mt-2 text-xs text-dim">ADX confirms the transfer against its bank statement; your spaces are held meanwhile.</p>
                        </div>
                    )}
                    <ErrorNote message={error} className="mt-3" />
                </div>
            )}
        </div>
    );
}

function BankRow({ label, value, onCopy, copied }: { label: string; value: React.ReactNode; onCopy?: () => void; copied?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-dim">{label}</dt>
            <dd className="flex items-center gap-2 font-semibold text-ink">
                {value}
                {onCopy && (
                    <button type="button" onClick={onCopy} aria-label={`Copy ${label}`} title={copied ? "Copied" : `Copy ${label}`} className="text-dim hover:text-ink">
                        <Copy className="size-3.5" aria-hidden />
                    </button>
                )}
            </dd>
        </div>
    );
}
