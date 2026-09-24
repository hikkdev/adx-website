import type { Metadata } from "next";
import { HelpView } from "./help-view";

export const metadata: Metadata = {
    title: "Help centre",
    description: "Help with your campaign, booking or ad space — booking, billing and payments, artwork requirements, delivery proofs, cancellations and publisher help.",
};

/** DR 12 · 06 · Help centre (5204:58251). */
export default function HelpPage() {
    return <HelpView />;
}
