/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types, which tsc reads from here. */
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { resetPageViews } from "@/lib/promotion-events";
import type { BrowseCard } from "@/services/browse";
import type { Layout } from "@/services/layouts";
import { LayoutBlocks } from "./layout-blocks";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ status: "signed-out", party: null, parties: [] }) }));

const ad = (id: string, over: Record<string, unknown> = {}) => ({ adBookingId: id, displayId: `ADB-${id}`, media: { url: `https://cdn.test/${id}.jpg`, width: 600, height: 750, altText: `Artwork ${id}` }, headline: `Headline ${id}`, ctaLabel: "Book now", targetUrl: "https://buyer.example/offer", ...over });
const layout = (blocks: Layout["blocks"], over: Partial<Layout> = {}): Layout => ({ surface: "WEB_LISTING", version: 2, isDefault: false, blocks, ...over });

describe("LM-1: the layout renderer", () => {
    beforeEach(() => {
        resetPageViews();
        window.sessionStorage.clear();
    });

    it("draws the page's own sections in the layout's order and skips what it does not know", () => {
        const { container } = render(
            <LayoutBlocks
                surface="WEB_EXPLORE"
                layout={layout([
                    { id: "1", type: "popular_rail", props: { title: "Loved in Pune" } },
                    { id: "2", type: "spinning_globe", props: {} },
                    { id: "3", type: "explore_search", props: {} },
                ])}
                system={{
                    explore_search: <p>Search</p>,
                    popular_rail: (title) => <p>{title}</p>,
                    results: <p>Results</p>,
                }}
            />
        );
        expect([...container.querySelectorAll("[data-block]")].map((node) => node.getAttribute("data-block"))).toEqual(["popular_rail", "explore_search", "results"]);
        expect(screen.getByText("Loved in Pune")).toBeInTheDocument();
    });

    it("falls back to today's order with no layout", () => {
        const { container } = render(<LayoutBlocks surface="WEB_FORMATS" layout={null} system={{ formats_hero: <p>Hero</p>, format_cards: <p>Cards</p>, venue_tiles: <p>Venues</p>, guides_strip: <p>Guides</p> }} />);
        expect(container.textContent).toBe("HeroCardsVenuesGuides");
    });

    it("draws a sold ad labelled Ad, linking out as sponsored in a new tab", () => {
        render(<LayoutBlocks surface="WEB_LISTING" layout={layout([{ id: "s", type: "ad_slot", props: { slotKey: "WEB_LISTING_SIDEBAR", ads: [ad("a1")] } }])} system={{}} />);
        expect(screen.getByText("Ad")).toBeInTheDocument();
        const link = screen.getByRole("link", { name: /Artwork a1/ });
        expect(link).toHaveAttribute("href", "https://buyer.example/offer");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "sponsored noopener");
        expect(screen.getAllByTestId("ad-slot")).toHaveLength(1);
    });

    it("shows one ad of several, and nothing at all for an empty slot", () => {
        const { unmount } = render(<LayoutBlocks surface="WEB_LISTING" layout={layout([{ id: "s", type: "ad_slot", props: { ads: [ad("a1"), ad("a2"), ad("a3")] } }])} system={{}} />);
        expect(screen.getAllByTestId("ad-slot")).toHaveLength(1);
        unmount();
        const { container } = render(<LayoutBlocks surface="WEB_LISTING" layout={layout([{ id: "s", type: "ad_slot", props: { slotKey: "WEB_LISTING_SIDEBAR", ads: [] } }])} system={{}} />);
        expect(screen.queryByTestId("ad-slot")).toBeNull();
        expect(screen.queryByText(/reserved/i)).toBeNull();
        expect(container.querySelector("[data-block=ad_slot]")).toBeEmptyDOMElement();
    });

    it("draws ADX's own banner without an Ad label, and a rich text block escaped", () => {
        render(
            <LayoutBlocks
                surface="WEB_HOME"
                layout={layout([
                    { id: "b", type: "promo_banner", props: { media: { url: "https://cdn.test/b.jpg", width: 1600, height: 480, altText: "Festive" }, headline: "Book for Diwali", target: { kind: "ROUTE", value: "/spaces" }, aspect: "WIDE" } },
                    { id: "t", type: "rich_text", props: { markdown: "Hello <script>alert(1)</script> **world**" } },
                ], { surface: "WEB_HOME" })}
                system={{ legacy_home: <p>Legacy</p> }}
            />
        );
        expect(screen.getByRole("link", { name: "Book for Diwali" })).toHaveAttribute("href", "/spaces");
        expect(screen.queryByText("Ad")).toBeNull();
        expect(document.querySelector("script")).toBeNull();
        expect(screen.getByText("world").tagName).toBe("STRONG");
    });
});

describe("LM-1: a sponsored card", () => {
    it("says Sponsored", async () => {
        const { SpaceCard } = await import("@/components/site/space-card");
        const card = {
            id: "l1",
            displayId: "LST-1",
            title: "MG Road hoarding",
            category: "OUTDOOR",
            subType: null,
            address: "MG Road",
            city: "Bengaluru",
            photos: [],
            ratePerDay: "1000.00",
            ratingAvg: null,
            reviewCount: 0,
            saved: false,
            instantBooking: false,
            display: "STATIC",
            slotsTotal: 1,
            slotsLeft: 1,
            distanceM: null,
            sponsored: true,
            boostId: "bst1",
        } as unknown as BrowseCard;
        render(<SpaceCard card={card} />);
        expect(screen.getByTestId("sponsored-label")).toHaveTextContent("Sponsored");
        render(<SpaceCard card={{ ...card, id: "l2", sponsored: false, boostId: undefined }} />);
        expect(screen.getAllByTestId("sponsored-label")).toHaveLength(1);
    });
});
