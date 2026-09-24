import Link from "next/link";

/**
 * The DR 12 site footer, as the Explore page draws it (5204:50115): a band of
 * category and place links under "Explore advertising on ADX", then the five
 * columns — Discover, Resources, For advertisers, For publishers, Need help —
 * and the legal line. The listing page's shorter paper footer (5228:1781) is
 * `SiteFooter compact`.
 */
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

const EXPLORE_HREF: Record<string, string> = {
    Billboards: "/spaces?category=OUTDOOR",
    "Roadside displays": "/spaces?category=OUTDOOR",
    "Building wraps": "/spaces?category=OUTDOOR",
    "Outdoor advertising": "/formats#outdoor",
    "Mall displays": "/spaces?category=INDOOR",
    "Office screens": "/spaces?category=INDOOR&display=DIGITAL",
    "Venue advertising": "/spaces?category=INDOOR",
    "Indoor advertising": "/formats#indoor",
    "Bus advertising": "/spaces?category=TRANSIT",
    "Vehicle branding": "/spaces?category=TRANSIT",
    "Transit displays": "/spaces?category=TRANSIT&display=DIGITAL",
    "Transit advertising": "/formats#transit",
    Radio: "/spaces?category=MEDIA",
    Newspapers: "/spaces?category=MEDIA",
    Television: "/spaces?category=MEDIA",
    Magazines: "/spaces?category=MEDIA",
    Bengaluru: "/spaces?city=Bengaluru",
    Whitefield: "/spaces?city=Bengaluru&q=Whitefield",
    "MG Road": "/spaces?city=Bengaluru&q=MG%20Road",
    Indiranagar: "/spaces?city=Bengaluru&q=Indiranagar",
    "Plan a campaign": "/advertiser/campaigns/new",
    "Choose dates": "/how-it-works#dates",
    "Upload artwork": "/how-it-works#artwork",
    "Track delivery": "/how-it-works#delivery",
    "Add your spaces": "/publishers",
    "Manage rates": "/publishers#rates",
    "Accept bookings": "/publishers#bookings",
    "View payouts": "/publishers#payouts",
    "Booking help": "/help#booking",
    "Payment help": "/help#payment",
    "Artwork help": "/help#artwork",
    "Publisher help": "/help#publisher",
};

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
    {
        title: "Discover",
        links: [
            { label: "Explore spaces", href: "/spaces" },
            { label: "Browse formats", href: "/formats" },
            { label: "Saved spaces", href: "/advertiser/saved" },
            { label: "Plan a campaign", href: "/advertiser/campaigns/new" },
        ],
    },
    {
        title: "Resources",
        links: [
            { label: "How ADX works", href: "/how-it-works" },
            { label: "Artwork guide", href: "/help#artwork" },
            { label: "Help centre", href: "/help" },
            { label: "My requests", href: "/advertiser/requests" },
        ],
    },
    {
        title: "For advertisers",
        links: [
            { label: "Get started", href: "/sign-in" },
            { label: "My campaigns", href: "/advertiser" },
            { label: "Billing & payments", href: "/advertiser/billing" },
            { label: "Account settings", href: "/advertiser/account" },
        ],
    },
    {
        title: "For publishers",
        links: [
            { label: "List your space", href: "/publishers" },
            { label: "Your inventory", href: "/publisher/inventory" },
            { label: "Manage bookings", href: "/publisher/bookings" },
            { label: "Earnings & payouts", href: "/publisher/earnings" },
        ],
    },
];

export function SiteFooter({ compact = false }: { compact?: boolean }) {
    if (compact) {
        return (
            <footer className="bg-paper">
                <div className="mx-auto grid max-w-[1920px] gap-10 px-6 py-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-16">
                    <div>
                        <img src="/brand/adx-wordmark-red.svg" alt="ADX" className="h-[30px] w-auto" />
                        <p className="mt-6 text-[26px] font-bold leading-[37px] text-ink">Find your next audience.</p>
                        <p className="mt-2 text-[15px] leading-[21px] text-[#717278]">Advertising spaces. One place to plan them.</p>
                    </div>
                    <FooterColumn title="Explore" links={[{ label: "Find ad spaces", href: "/spaces" }, { label: "Advertising formats", href: "/formats" }, { label: "How ADX works", href: "/how-it-works" }]} underline />
                    <FooterColumn title="For your business" links={[{ label: "Advertisers", href: "/sign-in" }, { label: "Publishers", href: "/publishers" }, { label: "Help centre", href: "/help" }]} underline />
                    <FooterColumn title="Your account" links={[{ label: "Campaigns", href: "/advertiser" }, { label: "Saved spaces", href: "/advertiser/saved" }, { label: "Profile & billing", href: "/advertiser/billing" }]} underline />
                </div>
            </footer>
        );
    }

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
                                            <Link href={EXPLORE_HREF[label] ?? "/spaces"} className="hover:text-ink">
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
                            <Link href="/help" className="mt-2 block text-lg font-semibold tracking-tight text-ink hover:text-brand">
                                Visit the help centre
                            </Link>
                        </div>
                    </div>
                    <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-lg font-medium text-dim">
                        <p>© {new Date().getFullYear()} ADX. All rights reserved.</p>
                        <nav className="flex flex-wrap gap-x-8 gap-y-2" aria-label="Legal">
                            <a href="/terms.html" className="hover:text-ink">Booking terms</a>
                            <a href="/refund.html" className="hover:text-ink">Cancellation policy</a>
                            <a href="/privacy.html" className="hover:text-ink">Privacy</a>
                        </nav>
                    </div>
                </div>
            </div>
        </footer>
    );
}

function FooterColumn({ title, links, underline = false }: { title: string; links: { label: string; href: string }[]; underline?: boolean }) {
    return (
        <div>
            <p className={underline ? "text-sm font-bold text-ink" : "text-lg font-semibold tracking-tight text-ink"}>{title}</p>
            <ul className={underline ? "mt-4 space-y-3.5" : "mt-5 space-y-5"}>
                {links.map((link) => (
                    <li key={link.href + link.label}>
                        <Link
                            href={link.href}
                            className={underline ? "text-[15px] font-medium text-ink underline underline-offset-2 hover:text-brand" : "text-lg font-medium text-dim hover:text-ink"}
                        >
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
