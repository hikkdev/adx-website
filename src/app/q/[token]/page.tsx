import type { Metadata } from "next";
import { QrLanding } from "./qr-landing";

export const metadata: Metadata = { title: "ADX", robots: { index: false } };

/**
 * QR-27: the landing behind an ADX identity code, `/q/<token>`. The token is
 * the signed content of an account's own code; the backend says who it
 * belongs to without a session and without their number. On GitHub Pages
 * this was the 404 trick; here it is a route.
 */
export default async function QrLandingPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <QrLanding token={decodeURIComponent(token)} />;
}
