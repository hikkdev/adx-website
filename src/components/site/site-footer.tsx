import Link from "next/link";
import { pageHref } from "@/lib/site-routes";

/**
 * The DR 12 site footer, as the Explore page draws it (5204:50115): a band of
 * category and place links under "Explore advertising on ADX", then the five
 * columns — Discover, Resources, For advertisers, For publishers, Need help —
 * and the legal line. The site's only footer (owner, 26 Sep 2026: one header,
 * one footer, the DR 12 ones): the static site's footer is gone, and what
 * only it carried moved here — the operator's name, address and phone (the
 * payment gateways check for them), Contact, Pricing and the apps.
 * PB-1: every link to a Studio page is drawn from the page's key, at render,
 * so it follows an address ADX changes (the root layout hands the table in).
 */
/** The operator, as the static site's footer and contact page named it. */
export const OPERATOR = {
    company: "Keysquare Technologies Pvt Ltd",
    address: "65-A, Kundan Nagar, New Delhi 110092",
    phone: "+91 80008 00546",
    phoneHref: "+918000800546",
    email: "kk@adx.in",
} as const;

const EXPLORE_COLUMNS: string[][] = [
    ["Billboards", "Roadside displays", "Building wraps", "Outdoor advertising"],
    ["Mall displays", "Office screens", "Venue advertising", "Indoor advertising"],
    ["Bus advertising", "Vehicle branding", "Transit displays", "Transit advertising"],
    ["Radio", "Newspapers", "Television", "Magazines"],
    ["Bengaluru", "Whitefield", "MG Road", "Indiranagar"],
    ["Plan a campaign", "Choose dates", "Upload artwork", "Track delivery"],
    ["Add your spaces", "Manage rates", "Accept bookings", "View payouts"],
    ["Booking help", "Payment help", "Artwork help", "Publisher help"],
];

/** A footer link: a fixed address, or a Studio page by key with a query or an anchor. */
type FooterHref = string | { page: string; search?: string; hash?: string };

const hrefOf = (link: FooterHref): string => (typeof link === "string" ? link : pageHref(link.page, {}, { search: link.search, hash: link.hash }));

const EXPLORE_HREF: Record<string, FooterHref> = {
    Billboards: { page: "explore", search: "category=OUTDOOR" },
    "Roadside displays": { page: "explore", search: "category=OUTDOOR" },
    "Building wraps": { page: "explore", search: "category=OUTDOOR" },
    "Outdoor advertising": { page: "formats", hash: "outdoor" },
    "Mall displays": { page: "explore", search: "category=INDOOR" },
    "Office screens": { page: "explore", search: "category=INDOOR&display=DIGITAL" },
    "Venue advertising": { page: "explore", search: "category=INDOOR" },
    "Indoor advertising": { page: "formats", hash: "indoor" },
    "Bus advertising": { page: "explore", search: "category=TRANSIT" },
    "Vehicle branding": { page: "explore", search: "category=TRANSIT" },
    "Transit displays": { page: "explore", search: "category=TRANSIT&display=DIGITAL" },
    "Transit advertising": { page: "formats", hash: "transit" },
    Radio: { page: "explore", search: "category=MEDIA" },
    Newspapers: { page: "explore", search: "category=MEDIA" },
    Television: { page: "explore", search: "category=MEDIA" },
    Magazines: { page: "explore", search: "category=MEDIA" },
    Bengaluru: { page: "explore", search: "city=Bengaluru" },
    Whitefield: { page: "explore", search: "city=Bengaluru&q=Whitefield" },
    "MG Road": { page: "explore", search: "city=Bengaluru&q=MG%20Road" },
    Indiranagar: { page: "explore", search: "city=Bengaluru&q=Indiranagar" },
    "Plan a campaign": "/advertiser/campaigns/new",
    "Choose dates": { page: "how-it-works", hash: "dates" },
    "Upload artwork": { page: "how-it-works", hash: "artwork" },
    "Track delivery": { page: "how-it-works", hash: "delivery" },
    "Add your spaces": { page: "publishers" },
    "Manage rates": { page: "publishers", hash: "rates" },
    "Accept bookings": { page: "publishers", hash: "bookings" },
    "View payouts": { page: "publishers", hash: "payouts" },
    "Booking help": { page: "help", hash: "booking" },
    "Payment help": { page: "help", hash: "payment" },
    "Artwork help": { page: "help", hash: "artwork" },
    "Publisher help": { page: "help", hash: "publisher" },
};

const COLUMNS: { title: string; links: { label: string; href: FooterHref }[] }[] = [
    {
        title: "Discover",
        links: [
            { label: "Explore spaces", href: { page: "explore" } },
            { label: "Browse formats", href: { page: "formats" } },
            { label: "Saved spaces", href: "/advertiser/saved" },
            { label: "Plan a campaign", href: "/advertiser/campaigns/new" },
        ],
    },
    {
        title: "Resources",
        links: [
            { label: "How ADX works", href: { page: "how-it-works" } },
            { label: "Pricing", href: { page: "home", hash: "pricing" } },
            { label: "The ADX apps", href: { page: "home", hash: "apps" } },
            { label: "Artwork guide", href: { page: "help", hash: "artwork" } },
            { label: "Help centre", href: { page: "help" } },
            { label: "My requests", href: "/advertiser/requests" },
        ],
    },
    {
        title: "For advertisers",
        links: [
            { label: "Get started", href: "/sign-in" },
            { label: "Advertise with ADX", href: { page: "advertise" } },
            { label: "My campaigns", href: "/advertiser/campaigns" },
            { label: "Billing & payments", href: "/advertiser/billing" },
            { label: "Account settings", href: "/advertiser/account" },
        ],
    },
    {
        title: "For publishers",
        links: [
            { label: "List your space", href: { page: "publishers" } },
            { label: "Your inventory", href: "/publisher/inventory" },
            { label: "Manage bookings", href: "/publisher/bookings" },
            { label: "Earnings & payouts", href: "/publisher/earnings" },
            // PP-W: the print shops' door — the app offers "I print and install" at sign-up.
            { label: "Print and install with ADX", href: "/partner/apply" },
        ],
    },
];

export function SiteFooter() {
    return (
        <footer>
            <div className="bg-ground">
                <div className="mx-auto max-w-[1920px] px-6 py-14 lg:px-16">
                    <p className="text-lg font-semibold tracking-tight text-ink">Explore advertising on ADX</p>
                    <div className="mt-5 border-t border-line pt-8">
                        <div className="grid gap-x-10 gap-y-8 text-sm font-medium text-dim sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
                            {EXPLORE_COLUMNS.map((column) => (
                                <ul key={column[0]} className="space-y-1">
                                    {column.map((label) => (
                                        <li key={label}>
                                            <Link href={hrefOf(EXPLORE_HREF[label] ?? { page: "explore" })} className="hover:text-ink">
                                                {label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-white">
                <div className="mx-auto max-w-[1920px] px-6 pb-10 pt-14 lg:px-14">
                    <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
                        {COLUMNS.map((column) => (
                            <FooterColumn key={column.title} title={column.title} links={column.links} />
                        ))}
                        <div>
                            <p className="text-lg font-semibold tracking-tight text-ink">Need help?</p>
                            <Link href={pageHref("help")} className="mt-2 block text-lg font-semibold tracking-tight text-ink hover:text-brand">
                                Visit the help centre
                            </Link>
                            <ul className="mt-5 space-y-5">
                                <li>
                                    <Link href="/contact" className="text-lg font-medium text-dim hover:text-ink">
                                        Contact ADX
                                    </Link>
                                </li>
                                <li>
                                    <a href={`tel:${OPERATOR.phoneHref}`} className="text-lg font-medium tabular-nums text-dim hover:text-ink">
                                        {OPERATOR.phone}
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>
                    <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-lg font-medium text-dim">
                        <p>© {new Date().getFullYear()} ADX. All rights reserved.</p>
                        <nav className="flex flex-wrap gap-x-8 gap-y-2" aria-label="Legal">
                            <Link href="/terms" className="hover:text-ink">Booking terms</Link>
                            <Link href="/refund" className="hover:text-ink">Cancellation policy</Link>
                            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
                            <Link href="/legal" className="hover:text-ink">All policies</Link>
                            <Link href="/status" className="hover:text-ink">System status</Link>
                            <Link href="/contact" className="hover:text-ink">Contact</Link>
                        </nav>
                    </div>
                    <p className="mt-6 text-sm leading-relaxed text-dim">
                        ADX is operated by {OPERATOR.company}, {OPERATOR.address} ·{" "}
                        <a href={`tel:${OPERATOR.phoneHref}`} className="tabular-nums hover:text-ink">{OPERATOR.phone}</a> ·{" "}
                        <a href={`mailto:${OPERATOR.email}`} className="hover:text-ink">{OPERATOR.email}</a>
                    </p>
                </div>
            </div>
        </footer>
    );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: FooterHref }[] }) {
    return (
        <div>
            <p className="text-lg font-semibold tracking-tight text-ink">{title}</p>
            <ul className="mt-5 space-y-5">
                {links.map((link) => (
                    <li key={link.label}>
                        <Link href={hrefOf(link.href)} className="text-lg font-medium text-dim hover:text-ink">
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
