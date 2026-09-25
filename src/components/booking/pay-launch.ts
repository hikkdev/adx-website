import { apiConfig } from "@/lib/api-config";
import { bookingService, insertionOrderAccepted, type AdvertiserProfile, type CampaignReview, type Eligibility } from "@/services/booking";
import { checkoutUrl, lastPayment, paymentsService, type PayMethod, type PaymentGateway, type PaymentIntent, type PaymentPurpose } from "@/services/payments";

/**
 * What stands between the pay button and the gateway, and the launch itself.
 *
 * The agreements are the person's own clicks: the platform agreement when
 * the eligibility says so, the insertion order when the review says so —
 * both recorded before the intent, because the intent refuses without them.
 * The gateway's page opens in a window taken synchronously on the click
 * (browsers block one opened after an await), and the return page polls
 * the payment until the webhook settles it.
 */
export async function recordAgreements(advertiser: AdvertiserProfile, campaignId: string, review: CampaignReview | null, eligibility: Eligibility | null): Promise<void> {
    if (eligibility?.blockedBy.includes("AGREEMENT")) await bookingService.acceptPlatformAgreement(advertiser.id);
    if (review && !insertionOrderAccepted(review)) await bookingService.acceptInsertionOrder(advertiser.id, campaignId);
}

/** Take the window on the click, before anything is awaited. Null when the browser refused. */
export function reserveCheckoutWindow(): Window | null {
    try {
        const win = window.open("", "adx-checkout");
        if (win) {
            win.document.title = "Opening the payment page…";
            win.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#77787d">Opening the secure payment page…</p>';
        }
        return win;
    } catch {
        return null;
    }
}

export interface LaunchedPayment {
    intent: PaymentIntent;
    url: string | null;
    /** True when the gateway's page was opened in the reserved window. */
    opened: boolean;
}

/**
 * The intent, then the gateway's page in the reserved window; the payment is
 * remembered for the return page. RF-1: `purpose: 'RESERVATION_FEE'` pays
 * the fee instead of the total. UP-1: `upiId` rides on the intent.
 */
export async function launchGateway(campaignId: string, gateway: PaymentGateway, method: PayMethod, win: Window | null, options: { purpose?: PaymentPurpose; upiId?: string } = {}): Promise<LaunchedPayment> {
    let intent: PaymentIntent;
    try {
        intent = await paymentsService.createIntent({ campaignId, gateway, ...(options.purpose ? { purpose: options.purpose } : {}), ...(options.upiId ? { upiId: options.upiId } : {}) });
    } catch (caught) {
        win?.close();
        throw caught;
    }
    const url = checkoutUrl(intent, apiConfig.baseUrl);
    lastPayment.remember(campaignId, { id: intent.payment.id, url, method, ...(options.purpose ? { purpose: options.purpose } : {}) });
    let opened = false;
    if (url && win && !win.closed) {
        try {
            win.location.href = url;
            opened = true;
        } catch {
            opened = false;
        }
    } else if (!url) {
        win?.close();
    }
    return { intent, url, opened };
}

export const returnHref = (campaignId: string, paymentId: string, purpose?: PaymentPurpose) =>
    `/advertiser/campaigns/${encodeURIComponent(campaignId)}/pay/return?payment=${encodeURIComponent(paymentId)}${purpose === "RESERVATION_FEE" ? "&purpose=RESERVATION_FEE" : ""}`;
