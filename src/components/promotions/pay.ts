import { apiConfig } from "@/lib/api-config";
import { checkoutUrl, paymentsService, type PaymentGateway, type PaymentIntent } from "@/services/payments";

/**
 * LM-1: paying for a display ad or a sponsored listing through the gateway —
 * the campaign pay step's pattern (`components/booking/pay-launch.ts`): the
 * window is taken on the click, the intent is opened with `adBookingId` or
 * `listingBoostId`, the gateway's page goes into the window, and the
 * booking's page polls `GET /payments/:id` (its `?payment=` parameter)
 * until the webhook settles it.
 */
export type PromotionTarget = { adBookingId: string } | { listingBoostId: string };

export interface LaunchedPromotionPayment {
    intent: PaymentIntent;
    url: string | null;
    opened: boolean;
}

export async function launchPromotionGateway(target: PromotionTarget, gateway: PaymentGateway, win: Window | null): Promise<LaunchedPromotionPayment> {
    let intent: PaymentIntent;
    try {
        intent = await paymentsService.createIntent({ ...target, gateway });
    } catch (caught) {
        win?.close();
        throw caught;
    }
    const url = checkoutUrl(intent, apiConfig.baseUrl);
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

export { reserveCheckoutWindow } from "@/components/booking/pay-launch";
