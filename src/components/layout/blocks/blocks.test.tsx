import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { rememberSiteRoutes } from "@/lib/site-routes";
import { ContentBlock } from "../layout-blocks";
import { PageBlocks } from "../page-blocks";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ status: "signed-out", party: null, parties: [] }) }));
vi.mock("@/components/site/space-card", () => ({ SpaceCard: ({ card }: { card: { id: string; title: string } }) => <div data-testid="space-card">{card.title}</div> }));
vi.mock("@/components/forms/location-field", () => ({ LocationField: () => <div data-testid="location-field" /> }));
vi.mock("@/services/browse", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/services/browse")>();
    return {
        ...original,
        browseService: {
            ...original.browseService,
            browse: vi.fn().mockResolvedValue({ items: [{ id: "l1", title: "MG Road hoarding" }, { id: "l2", title: "Whitefield wall" }], total: 2, page: 1, pageSize: 6 }),
            categories: vi.fn().mockResolvedValue({ items: [{ category: "OUTDOOR", count: 8, photoUrl: null }, { category: "INDOOR", count: 0, photoUrl: null }], total: 8 }),
            venues: vi.fn().mockResolvedValue({ items: [{ venueTypeId: "v1", name: "Mall", label: "Mall", category: "INDOOR", count: 2, photoUrl: null }], total: 1 }),
        },
    };
});

const media = { url: "https://cdn.test/a.jpg", width: 1600, height: 480, altText: "Festive" };
const draw = (type: Parameters<typeof ContentBlock>[0]["type"], props: Record<string, unknown>, surface = "diwali") => render(<ContentBlock type={type} props={props} surface={surface} place={{ city: "Pune" }} />);

describe("PB-4: the Studio blocks draw from their resolved props", () => {
    afterEach(() => rememberSiteRoutes(null));

    it("hero: the headline as the page's h1 (an h2 on a system page), the line, the picture and the two buttons", () => {
        draw("hero", { headline: "Book for Diwali", subheadline: "Spaces across Pune", media, primaryCta: { label: "Explore spaces", target: { kind: "EXPLORE" } }, secondaryCta: { label: "Talk to us", target: { kind: "PAGE", value: "help" } }, align: "LEFT" });
        expect(screen.getByRole("heading", { level: 1, name: "Book for Diwali" })).toBeInTheDocument();
        expect(screen.getByText("Spaces across Pune")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Festive" })).toHaveAttribute("src", media.url);
        expect(screen.getByRole("link", { name: "Explore spaces" })).toHaveAttribute("href", "/spaces");
        expect(screen.getByRole("link", { name: "Talk to us" })).toHaveAttribute("href", "/help");
        draw("hero", { headline: "On a system page" }, "WEB_HELP");
        expect(screen.getByRole("heading", { level: 2, name: "On a system page" })).toBeInTheDocument();
        const { container } = draw("hero", { subheadline: "no headline" });
        expect(container).toBeEmptyDOMElement();
    });

    it("cta_strip: the band in its tone, the button only when its target goes somewhere", () => {
        draw("cta_strip", { headline: "Ready to book?", body: "It takes a minute.", ctaLabel: "Start", target: { kind: "ROUTE", value: "/spaces?city=Pune" }, tone: "INK" });
        expect(screen.getByTestId("cta-strip")).toHaveClass("bg-ink");
        expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/spaces?city=Pune");
        draw("cta_strip", { headline: "No door", ctaLabel: "Start", target: { kind: "ROUTE", value: "//evil" }, tone: "BRAND" });
        expect(screen.getAllByRole("link", { name: "Start" })).toHaveLength(1);
    });

    it("columns: each with its picture, a linked title, and the text as Markdown", () => {
        draw("columns", { columns: [{ title: "Outdoor", markdown: "Big **and** bold", media, target: { kind: "CATEGORY", value: "OUTDOOR" } }, { title: "Indoor", markdown: "Cosy" }] });
        expect(screen.getByRole("link", { name: /Outdoor/ })).toHaveAttribute("href", "/spaces?category=OUTDOOR");
        expect(screen.getByText("and").tagName).toBe("STRONG");
        expect(screen.getByRole("heading", { level: 3, name: "Indoor" })).toBeInTheDocument();
    });

    it("image and video: a figure with its caption; only a safe embed", () => {
        draw("image", { media, caption: "Festive lights", width: "CONTAINED", target: { kind: "URL", value: "https://x.example/" } });
        expect(screen.getByRole("link", { name: "Festive lights" })).toHaveAttribute("target", "_blank");
        expect(screen.getByText("Festive lights", { selector: "figcaption" })).toBeInTheDocument();
        draw("video", { url: "https://youtu.be/dQw4w9WgXcQ", caption: "How ADX works" });
        expect(screen.getByTitle("How ADX works")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
        const { container } = draw("video", { url: "https://evil.example/x" });
        expect(container).toBeEmptyDOMElement();
    });

    it("faq: the first question open with a Markdown answer, the rest closed until clicked", () => {
        draw("faq", { title: "Questions", items: [{ question: "How long?", answer: "About **a day**." }, { question: "How much?", answer: "It depends." }] });
        expect(screen.getByRole("heading", { level: 2, name: "Questions" })).toBeInTheDocument();
        expect(screen.getByText("a day").tagName).toBe("STRONG");
        expect(screen.queryByText("It depends.")).toBeNull();
        screen.getByRole("button", { name: "How much?" }).click();
    });

    it("steps, stats, divider and a button row", () => {
        draw("steps", { title: "How it works", items: [{ title: "List", body: "Add your space" }, { title: "Book", body: "" }] });
        expect(screen.getByText("01")).toBeInTheDocument();
        expect(screen.getByText("Book")).toBeInTheDocument();
        draw("stats", { items: [{ value: "1,200", label: "spaces" }, { value: "36", label: "cities" }] });
        expect(screen.getByText("1,200")).toBeInTheDocument();
        draw("divider", { style: "LINE" });
        expect(screen.getByTestId("divider-line")).toBeInTheDocument();
        draw("divider", { style: "SPACE" });
        expect(screen.getByTestId("divider-space")).toBeInTheDocument();
        draw("button_row", { buttons: [{ label: "Primary", target: { kind: "NEW_CAMPAIGN" }, style: "PRIMARY" }, { label: "Second", target: { kind: "LISTING", value: "LST-1" }, style: "SECONDARY" }] });
        expect(screen.getByRole("link", { name: "Primary" })).toHaveAttribute("href", "/advertiser/campaigns/new");
        expect(screen.getByRole("link", { name: "Second" })).toHaveAttribute("href", "/spaces/LST-1");
    });

    it("category_tiles: the site's mosaic in the page's city, All opening the categories page there", async () => {
        const { container } = draw("category_tiles", { title: "Browse" });
        await waitFor(() => expect(container.querySelector('a[href="/spaces?city=Pune&category=OUTDOOR"]')).not.toBeNull());
        expect(container.querySelector('a[href="/spaces?city=Pune&category=INDOOR&venueTypeId=v1"]')).not.toBeNull();
        expect(screen.getAllByRole("link", { name: "All categories" })[0]).toHaveAttribute("href", "/categories?city=Pune");
        expect(screen.getByRole("heading", { level: 2, name: "Browse" })).toBeInTheDocument();
    });

    it("listing_grid: the rail's spaces as a grid with a See all link", async () => {
        draw("listing_grid", { title: "Loved in Pune", columns: 4, seeAllLabel: "See all", query: { sort: "RATING", pageSize: 4 } });
        await waitFor(() => expect(screen.getAllByTestId("space-card")).toHaveLength(2));
        expect(screen.getByText("MG Road hoarding")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/spaces?sort=RATING");
    });

    it("form: the resolved form drawn in place, nothing when the server resolved none", () => {
        draw("form", { heading: "Talk to us", form: { key: "contact", title: "Contact", audience: "PUBLIC", version: 1, definition: { screens: [{ key: "s", fields: [{ id: "name", kind: "text", label: "Your name", required: true }] }], successMessage: "Ta", consentText: "ADX may write back" } } });
        expect(screen.getByRole("heading", { level: 2, name: "Talk to us" })).toBeInTheDocument();
        expect(screen.getByLabelText(/Your name/)).toBeInTheDocument();
        expect(screen.getByText("ADX may write back")).toBeInTheDocument();
        const { container } = draw("form", { formKey: "gone", form: null });
        expect(container).toBeEmptyDOMElement();
    });

    it("a page draws its content blocks in order and skips the rest", () => {
        const { container } = render(
            <PageBlocks
                surface="diwali"
                blocks={[
                    { id: "1", type: "hero", props: { headline: "Hi" } },
                    { id: "2", type: "help_hero", props: {} },
                    { id: "3", type: "stats", props: { items: [{ value: "1", label: "one" }, { value: "2", label: "two" }] } },
                ]}
            />
        );
        expect([...container.querySelectorAll("[data-block]")].map((node) => node.getAttribute("data-block"))).toEqual(["hero", "stats"]);
    });
});
