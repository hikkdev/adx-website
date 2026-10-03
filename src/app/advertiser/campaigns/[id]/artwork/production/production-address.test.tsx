/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types. */
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Address search everywhere (1 Oct 2026): the print-production step's
 * measurement plan — a location-lift plan's business address is a
 * search-only field. A pick fills the line; the plan keeps the words and
 * never a pin. With the maps vendor silent the typed words are saved.
 */

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "c1" }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/advertiser/campaigns/c1/artwork/production",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: () => false }));
vi.mock("@/components/booking/step-page", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/booking/step-page")>()),
    StepPage: ({ children }: { children: (ready: ReadyCampaign) => React.ReactNode }) => <>{children(ready)}</>,
    useCampaignId: () => "c1",
}));

const geo = vi.hoisted(() => ({ autocomplete: vi.fn(), place: vi.fn() }));
vi.mock("@/services/listing-editor", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/listing-editor")>();
    return { ...actual, listingEditorService: { ...actual.listingEditorService, autocomplete: geo.autocomplete, place: geo.place } };
});

const patches = vi.hoisted(() => ({ list: [] as { path: string; body: unknown }[] }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: vi.fn(async () => ({})),
            post: vi.fn(async () => ({})),
            patch: vi.fn(async (path: string, body: unknown) => {
                patches.list.push({ path, body });
                return { ...ready.campaign, trackingMethod: "LOCATION_LIFT" };
            }),
            put: vi.fn(),
            delete: vi.fn(),
        },
    };
});

import type { ReadyCampaign } from "@/components/booking/step-page";
import type { AdvertiserProfile, Campaign } from "@/services/booking";
import ProductionPage from "./page";

const ready: ReadyCampaign = {
    campaign: { id: "c1", reference: "CMP-0110-2601", advertiserId: "a1", name: "Diwali launch", status: "DRAFT", spots: [], creatives: [], startDate: "2026-10-11", endDate: "2026-10-17", fulfilment: "ADX_PRINTS", trackingMethod: "NONE", trackingConfig: {}, creativePath: "UPLOAD", landingPage: null, reservation: null } as unknown as Campaign,
    review: null,
    advertiser: { id: "a1", name: "Meera Sharma", email: "meera@example.com" } as unknown as AdvertiserProfile,
    reload: vi.fn(),
    applyCampaign: vi.fn(),
    applyReview: vi.fn(),
};

const PLACE = { formattedAddress: "Phoenix Marketcity, Whitefield, Bengaluru, Karnataka 560048, India", latitude: 12.99, longitude: 77.69, placeId: "p9", city: "Bengaluru", state: "Karnataka", postalCode: "560048" };

async function openLiftPlan() {
    render(<ProductionPage params={Promise.resolve({ id: "c1" })} />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    fireEvent.change(screen.getByLabelText("How will you measure the campaign?"), { target: { value: "LOCATION_LIFT" } });
    return screen.getByLabelText("Business address");
}

beforeEach(() => {
    patches.list = [];
    geo.autocomplete.mockReset().mockResolvedValue([{ placeId: "p9", description: PLACE.formattedAddress, mainText: "Phoenix Marketcity", secondaryText: "Whitefield, Bengaluru" }]);
    geo.place.mockReset().mockResolvedValue(PLACE);
});

describe("Print production — the location-lift business address searches", () => {
    it("fills the line from a pick and saves the words, no pin", async () => {
        const line = await openLiftPlan();
        expect(line).toHaveAttribute("placeholder", "Type a building, street or landmark");
        fireEvent.focus(line);
        fireEvent.change(line, { target: { value: "Phoenix Market" } });
        fireEvent.click(await screen.findByRole("option", { name: /Phoenix Marketcity/ }));
        await waitFor(() => expect(line).toHaveValue(PLACE.formattedAddress));
        fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
        await waitFor(() => expect(patches.list).toHaveLength(1));
        expect(patches.list[0]).toEqual({
            path: "/campaigns/c1",
            body: { step: 13, tracking: { trackingMethod: "LOCATION_LIFT", trackingConfig: { businessAddress: PLACE.formattedAddress, measurementWindowDays: 14, baselinePeriod: "PRIOR_MONTH" } } },
        });
    });

    it("saves the typed words when the maps vendor answers nothing", async () => {
        geo.autocomplete.mockRejectedValue(new Error("no vendor"));
        const line = await openLiftPlan();
        fireEvent.focus(line);
        fireEvent.change(line, { target: { value: "Whitefield, Bengaluru" } });
        await waitFor(() => expect(geo.autocomplete).toHaveBeenCalled());
        expect(screen.queryByRole("listbox")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
        await waitFor(() => expect(patches.list).toHaveLength(1));
        expect(patches.list[0]!.body).toMatchObject({ tracking: { trackingConfig: { businessAddress: "Whitefield, Bengaluru" } } });
    });
});
