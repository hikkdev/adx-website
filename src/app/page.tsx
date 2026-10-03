import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { HomeBlocks } from "@/components/layout/home-blocks";
import { readLayoutServer } from "@/services/layouts";
import "./home.css";

/**
 * No title or description of its own: the home page wears the site's, which
 * the root layout reads from the Website surface of Settings › Brand & theme.
 */
export const metadata: Metadata = {};

/** LM-1: kept a minute at a time, with the layout a visitor sees. */
export const revalidate = 60;

/**
 * The home page's body, kept as the static site drew it (owner, 24 Sep
 * 2026: "the homepage is not ready yet, so keep the current homepage
 * design"), inside the site's one header and footer (owner, 26 Sep 2026:
 * the DR 12 chrome goes forward, the static site's is discarded). The
 * stylesheet is scoped under `.legacy-home` so nothing of it leaks into the
 * DR 12 pages. When the DR 12 home lands, the body is replaced whole.
 *
 * LM-1: that body is the `legacy_home` block of the `WEB_HOME` layout; the
 * blocks ADX publishes around it draw above or below it, outside its
 * stylesheet. No layout, or one that cannot be read, is the body alone.
 */
export default async function HomePage() {
    const layout = await readLayoutServer("WEB_HOME");
    return (
        <div className="flex min-h-screen flex-col bg-ground">
            <SiteHeader />
            <main className="flex-1">
              <HomeBlocks initial={layout} legacy={<div className="legacy-home">

              <section className="hero">
                <div className="wrap">
                  <h1>Advertising space, <span>booked like a room.</span></h1>
                  <p className="lead">ADX is a marketplace for out-of-home and in-store advertising in India. Publishers list their hoardings, billboards, digital screens and retail spots. Advertisers find them by place and audience and book campaigns by the day. ADX field agents verify every spot before it goes live and again on a fixed cadence.</p>
                  <Link className="cta" href="/contact">Talk to us</Link>
                  <a className="cta secondary" href="#how">See how it works</a>
                </div>
              </section>

              <section id="who">
                <div className="wrap">
                  <h2>Built for three sides of the same street</h2>
                  <p className="sub">One platform, one set of rules, three apps.</p>
                  <div className="grid">
                    <div className="card">
                      <h3>Advertisers</h3>
                      <p>Browse verified spots by city, category and audience. Book a campaign for the dates you want, pay online, and track it from booking to proof of display.</p>
                    </div>
                    <div className="card">
                      <h3>Publishers</h3>
                      <p>List a hoarding, a screen, a wall or a shelf in minutes. Set your daily rate, keep your calendar, and get paid into your bank account as campaigns run.</p>
                    </div>
                    <div className="card">
                      <h3>Field agents</h3>
                      <p>Onboard publishers and advertisers on the ground, photograph and verify spots, and earn per task with milestones and tiers.</p>
                    </div>
                  </div>
                </div>
              </section>

              <section id="how">
                <div className="wrap">
                  <h2>How it works</h2>
                  <p className="sub">From an empty wall to a running campaign.</p>
                  <div className="grid">
                    <div className="card step"><div className="n">1</div><div><h3>A spot is listed</h3><p>The publisher adds the location, size, photos and rate. If the space is held on a lease, licence or municipal permit, its term is recorded and renewals are tracked.</p></div></div>
                    <div className="card step"><div className="n">2</div><div><h3>ADX verifies it</h3><p>An agent visits, photographs the spot from the pin, and files the venue papers. Permanent structures are re-verified every 180 days, removable ones every 90.</p></div></div>
                    <div className="card step"><div className="n">3</div><div><h3>An advertiser books it</h3><p>The campaign is priced by the day, paid online, and scheduled. A QR code on the printed creative lets ADX count real-world scans.</p></div></div>
                    <div className="card step"><div className="n">4</div><div><h3>Everyone gets paid</h3><p>Publisher earnings accrue daily as the campaign runs and are withdrawn to a verified bank account. ADX keeps a platform commission on each booked day.</p></div></div>
                  </div>
                </div>
              </section>

              <section id="pricing">
                <div className="wrap">
                  <h2>Pricing</h2>
                  <p className="sub">ADX is free to join for advertisers, publishers and agents. Money moves only when a campaign is booked.</p>
                  <table className="plain">
                    <thead><tr><th>What</th><th>Who pays</th><th>How it is set</th></tr></thead>
                    <tbody>
                      <tr><td>Campaign booking</td><td>Advertiser</td><td>The publisher's daily rate for the spot multiplied by the campaign days, plus GST at the applicable rate. Shown in full before payment.</td></tr>
                      <tr><td>Platform commission</td><td>Deducted from the publisher's earnings</td><td>A percentage of each booked day, shown on every booking. It is never added on top of the advertiser's price.</td></tr>
                      <tr><td>Publisher subscription (optional)</td><td>Publisher</td><td>Monthly plans that add placement and analytics features. The free tier lists and sells spots without a subscription.</td></tr>
                      <tr><td>Withdrawals</td><td>Publisher or agent</td><td>Transfers to a verified Indian bank account or UPI ID. Daily and per-transfer limits apply by account tier.</td></tr>
                    </tbody>
                  </table>
                  <p className="sub" style={{marginTop: "18px"}}>Exact rates and the current commission schedule are shown inside the app at the point of booking and in the publisher's earnings statement. See the <Link href="/refund">refund and cancellation policy</Link> for what happens when a campaign changes.</p>
                </div>
              </section>

              <section id="apps">
                <div className="wrap">
                  <h2>The apps</h2>
                  <p className="sub">Two Android apps and a web console.</p>
                  <div className="grid">
                    <div className="card"><h3>ADX</h3><p>For advertisers and publishers. Sign in with your mobile number. Currently distributed directly to onboarding partners ahead of the Google Play listing.</p></div>
                    <div className="card"><h3>ADX Agent</h3><p>For field agents. Verification visits, onboarding, leads and earnings. Agents are onboarded and verified by ADX before they can take work.</p></div>
                    <div className="card"><h3>ADX Console</h3><p>For the ADX operations team: KYC, verification desk, campaigns, payouts and reports.</p></div>
                  </div>
                </div>
              </section>

              </div>} />
            </main>
            <SiteFooter />
        </div>
    );
}
