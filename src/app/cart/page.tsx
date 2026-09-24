import type { Metadata } from "next";
import { Suspense } from "react";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Campaign cart" };

/**
 * DR 12 · 04 · 01 · Campaign cart (5204:62238): the spaces a visitor is
 * considering, their dates, the print choice and the estimated total —
 * before a campaign exists. "Add campaign details" turns it into one.
 */
export default function CartPage() {
    return (
        <Suspense>
            <CartView />
        </Suspense>
    );
}
