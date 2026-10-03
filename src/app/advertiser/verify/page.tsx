import { Suspense } from "react";
import { AdvertiserVerify } from "./advertiser-verify";

/**
 * QR-18: the advertiser's verification, on a page of its own — reached from
 * a paid campaign waiting to launch (`?next=` brings them back to it), a
 * KYC notice, or Account settings; never a wall in front of the campaigns.
 */
export default function AdvertiserVerifyPage() {
    return (
        <Suspense>
            <AdvertiserVerify />
        </Suspense>
    );
}
