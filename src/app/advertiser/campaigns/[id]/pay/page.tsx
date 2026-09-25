"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Info } from "lucide-react";
import { toast } from "sonner";
import { ApiError, messageOf } from "@/lib/api-client";
import { BookingCard, EditLink, ErrorNote, primaryButton, smallButton } from "@/components/booking/booking-frame";
import { billingDraft } from "@/components/booking/billing-draft";
import { CheckBox, FloatingField, RadioDot } from "@/components/booking/fields";
import { launchGateway, recordAgreements, reserveCheckoutWindow, returnHref } from "@/components/booking/pay-launch";
import { PromoCode } from "@/components/booking/promo-code";
import { ReservationPanel } from "@/components/booking/reservation-panel";
import { StepPage, accountNameOf, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { SummaryRail } from "@/components/booking/summary-rail";
import { bookingService, chargesOf, discountLabel, estimateCart, flightDays, formatFlight, insertionOrderAccepted, rupees, splitBillingAddress, type Campaign, type CampaignReview, type Eligibility, type PromoDiscount } from "@/services/booking";
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
 */
export default function PayPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={4} back={null} title={() => "Review & pay"} subtitle={(ready) => `${accountNameOf(ready.advertiser)} · ${ready.campaign.name}`}>
            {(ready) => <Pay key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

function Pay({ ready }: { ready: ReadyCampaign }) {
    const router = useRouter();
    const { campaign, review, advertiser } = ready;
    const [method, setMethod] = React.useState<PayMethod>("CARD");
    const [gateways, setGateways] = React.useState<GatewayStatus[] | null>(null);
    const [bank, setBank] = React.useState<BankTransferDetails | null>(null);
    const [eligibility, setEligibility] = React.useState<Eligibility | null>(null);
    const [promo, setPromo] = React.useState<PromoDiscount | null>(review?.promo ?? null);
    const [terms, setTerms] = React.useState(false);
    const [platform, setPlatform] = React.useState(false);
    const [upiId, setUpiId] = React.useState("");
    const [breakdown, setBreakdown] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const draft = React.useMemo(() => billingDraft.read(campaign.id), [campaign.id]);

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
                .eligibility(advertiser.id)
                .then((row) => {
                    if (!cancelled) setEligibility(row);
                })
                .catch(() => undefined);
        }
        return () => {
            cancelled = true;
        };
    }, [advertiser]);

    const charges = review ? chargesOf(review) : estimateCart(campaign.spots.map((spot) => ({ ratePerDay: spot.ratePerDay, print: campaign.fulfilment !== "ADVERTISER_SHIPS" })), flightDays(campaign.startDate, campaign.endDate));
    /* The full payment's amount is already total − fee on the server once the fee is PAID; the fee itself while it is DUE. */
    const payable = feePaid && reservation?.payable ? Number(reservation.payable) : charges.total;
    const collecting = feeDue && reservation ? Number(reservation.fee) : payable;
    const purpose: PaymentPurpose | undefined = feeDue ? "RESERVATION_FEE" : undefined;
    const gateway = gateways ? pickGateway(gateways) : null;
    const upiValid = !upiId || UPI_ID_PATTERN.test(upiId.trim());
    const needsInsertionOrder = review ? !insertionOrderAccepted(review) : false;
    const needsPlatform = eligibility?.blockedBy.includes("AGREEMENT") ?? false;
    const profileIncomplete = eligibility?.blockedBy.includes("PROFILE") ?? false;
    const signing = review?.signing?.required && !review.signing.satisfied ? review.signing.request : null;
    const suspended = eligibility?.blockedBy.includes("SUSPENDED") ?? false;
    const agreementsOk = (!needsInsertionOrder || terms) && (!needsPlatform || platform);
    const address = splitBillingAddress(advertiser?.billingAddress);
    const billing = {
        name: draft?.legalName ?? advertiser?.companyName ?? accountNameOf(advertiser),
        contact: advertiser?.name ?? null,
        email: draft?.email ?? advertiser?.email ?? null,
        gstin: draft?.gstin ?? advertiser?.gstin ?? null,
        address: [draft?.street ?? address.street, draft?.city ?? advertiser?.city].filter(Boolean).join(", "),
    };

    const blocked = suspended ? "This account cannot start a new campaign right now. Contact ADX support." : profileIncomplete ? "Complete your billing details before paying." : signing ? "The insertion order has to be signed before this campaign can be paid." : null;
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
        if (busy) return;
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
            setError(reservationMessage(caught, "Could not continue to the card page."));
            setBusy(false);
        }
    };

    const payWithUpi = async () => {
        if (busy || !gateway || !upiValid) return;
        setBusy(true);
        setError(null);
        try {
            await openGateway("UPI");
        } catch (caught) {
            setError(reservationMessage(caught, "Could not open the payment page."));
            setBusy(false);
        }
    };

    const reserve = async () => {
        if (busy || !canReserve) return;
        setBusy(true);
        setError(null);
        try {
            const answer = await reservationService.reserve<Campaign, CampaignReview>(campaign.id);
            ready.applyCampaign(answer.campaign);
            ready.applyReview(answer.review);
            toast.success(`Spots reserved. Pay the ${rupees(answer.reservation.fee)} fee within ${offer?.payWithinMinutes ?? 60} minutes to hold them.`);
        } catch (caught) {
            setError(reservationMessage(caught, "Could not reserve these spots."));
        } finally {
            setBusy(false);
        }
    };

    const payFeeFromWallet = async () => {
        if (busy || !reservation) return;
        setBusy(true);
        setError(null);
        try {
            const answer = await reservationService.payFromWallet<Campaign>(campaign.id);
            ready.applyCampaign(answer.campaign);
            toast.success(`Reservation fee of ${rupees(answer.reservation.fee)} taken from your wallet. The spots are held.`);
        } catch (caught) {
            setError(reservationMessage(caught, "Could not take the fee from your wallet — top it up, or pay the fee by card, UPI or bank transfer."));
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
                                    <button type="button" onClick={() => void payFeeFromWallet()} disabled={busy || !!blocked} className={smallButton}>
                                        {busy ? "Please wait…" : `Pay ${rupees(reservation.fee)} from my wallet`}
                                    </button>
                                )}
                            </ReservationPanel>
                        )}
                        {feeDue && <p className="px-1 text-xs text-dim">Or pay the fee by card, UPI or bank transfer below — the rest of the checkout waits until the spots are held.</p>}
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
                                disabled={!!blocked || !agreementsOk}
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
                            {(needsInsertionOrder || needsPlatform) && (
                                <div className="mb-4 space-y-2 px-1">
                                    {needsInsertionOrder && (
                                        <CheckBox
                                            checked={terms}
                                            onChange={setTerms}
                                            label={
                                                <>
                                                    I have reviewed the booking details and terms.{" "}
                                                    <Link href="/help#booking" className="underline underline-offset-2">
                                                        Read booking and cancellation terms
                                                    </Link>
                                                </>
                                            }
                                        />
                                    )}
                                    {needsPlatform && (
                                        <CheckBox
                                            checked={platform}
                                            onChange={setPlatform}
                                            label={
                                                <>
                                                    I accept the ADX advertiser agreement.{" "}
                                                    <Link href="/help#agreement" className="underline underline-offset-2">
                                                        Read it
                                                    </Link>
                                                </>
                                            }
                                        />
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
                                    {signing?.signingUrl && (
                                        <a href={signing.signingUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                                            Sign the insertion order ↗
                                        </a>
                                    )}
                                </p>
                            )}
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
                                {method === "CARD" && (
                                    <button type="button" disabled={busy || !gateway || !!blocked || !agreementsOk} onClick={() => void continueWithCard()} className={primaryButton}>
                                        {busy ? "Please wait…" : feeDue ? `Pay ${rupees(collecting)} fee with card` : feePaid ? `Pay the balance ${rupees(collecting)} with card` : "Continue with card"}
                                    </button>
                                )}
                                {method === "UPI" && (
                                    <button type="button" disabled={busy || !gateway || !!blocked || !agreementsOk || !upiValid} onClick={() => void payWithUpi()} className={primaryButton}>
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
                                    <button type="button" onClick={() => void reserve()} disabled={busy} className={`${smallButton} mt-3`}>
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
function BankTransferRow({ campaignId, details, checked, onSelect, amount, purpose, disabled, onBeforeIntent, onClaimed }: { campaignId: string; details: BankTransferDetails; checked: boolean; onSelect: () => void; amount: number; purpose?: PaymentPurpose; disabled: boolean; onBeforeIntent: () => Promise<void>; onClaimed: (payment: PaymentSummary) => void }) {
    const [intent, setIntent] = React.useState<PaymentIntent | null>(null);
    const [utr, setUtr] = React.useState("");
    const [paidOn, setPaidOn] = React.useState(() => new Date().toISOString().slice(0, 10));
    const [paid, setPaid] = React.useState(String(Math.round(amount)));
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState<string | null>(null);

    const reference = async () => {
        if (busy || intent) return;
        setBusy(true);
        setError(null);
        try {
            await onBeforeIntent();
            const answer = await paymentsService.createIntent({ campaignId, gateway: "BANK_TRANSFER", ...(purpose ? { purpose } : {}) });
            setIntent(answer);
            if (answer.bankTransfer?.amount) setPaid(String(Math.round(Number(answer.bankTransfer.amount))));
        } catch (caught) {
            setError(notAvailableYet(caught) ? "Bank transfer is not available yet. Choose card or UPI." : messageOf(caught, "Could not prepare the transfer."));
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
                        {!referenceId && disabled && <p className="mt-2 text-xs text-dim">Tick the terms above to get your reference.</p>}
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
