import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readPageServer, type SitePageView } from "@/services/pages";
import { generateMetadata } from "./page";
import { PageView } from "./page-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/diwali", notFound: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ status: "signed-out", party: null, parties: [] }) }));
vi.mock("@/services/pages", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/services/pages")>();
    return { ...original, readPageServer: vi.fn() };
});

const page: SitePageView = {
    key: "diwali",
    title: "Diwali offers",
    path: "/diwali",
    channels: ["WEBSITE"],
    version: 3,
    isDefault: false,
    preview: false,
    meta: { seoTitle: "Diwali on ADX", seoDescription: "Festive spaces", seoImage: null, noindex: false },
    blocks: [
        { id: "h", type: "hero", props: { headline: "Light up Pune", primaryCta: { label: "Explore", target: { kind: "EXPLORE" } } } },
        { id: "s", type: "stats", props: { items: [{ value: "120", label: "spaces" }, { value: "9", label: "malls" }] } },
    ],
};

const params = (key: string) => Promise.resolve({ key });
const search = (query: Record<string, string> = {}) => Promise.resolve(query);

describe("PB-4: a Studio page", () => {
    it("draws its blocks in order with the site's h1 from the hero", () => {
        render(<PageView initial={page} pageKey="diwali" preview={null} city={null} />);
        expect(screen.getByRole("heading", { level: 1, name: "Light up Pune" })).toBeInTheDocument();
        expect(screen.getByText("120")).toBeInTheDocument();
        expect(screen.queryByTestId("preview-banner")).toBeNull();
    });

    it("says so when it is a preview of the draft, and when it has nothing on it", () => {
        render(<PageView initial={{ ...page, preview: true, version: 4 }} pageKey="diwali" preview="tok" city={null} />);
        expect(screen.getByTestId("preview-banner")).toHaveTextContent("Preview of draft v4");
        render(<PageView initial={{ ...page, blocks: [] }} pageKey="diwali" preview={null} city={null} />);
        expect(screen.getByText("This page has nothing on it yet.")).toBeInTheDocument();
    });

    it("takes its metadata from the version's SEO settings, and keeps a preview out of the index", async () => {
        vi.mocked(readPageServer).mockResolvedValue({ kind: "page", page });
        await expect(generateMetadata({ params: params("diwali"), searchParams: search() })).resolves.toEqual({ title: "Diwali on ADX", description: "Festive spaces" });
        expect(readPageServer).toHaveBeenLastCalledWith("diwali", {});
        await expect(generateMetadata({ params: params("diwali"), searchParams: search({ preview: "tok" }) })).resolves.toMatchObject({ robots: { index: false, follow: false } });
        expect(readPageServer).toHaveBeenLastCalledWith("diwali", { preview: "tok" });
        vi.mocked(readPageServer).mockResolvedValue({ kind: "missing" });
        await expect(generateMetadata({ params: params("gone"), searchParams: search() })).resolves.toEqual({ title: "Nothing here" });
    });
});
