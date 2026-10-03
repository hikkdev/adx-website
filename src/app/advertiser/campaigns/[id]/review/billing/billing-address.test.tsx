/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types. */
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Onboarding addresses (the owner, 1 Oct 2026): the campaign's billing step
 * — often where an advertiser first gives a billing address — is the "Find
 * the address" bar over plain boxes: the address, City | State, PIN |
 * Country. A pick fills the address, city, PIN and the state (when it is one
 * of the list's); a billing address takes no coordinates. No map.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "c1" }),
    useRouter: () => ({ push, replace: vi.fn() }),
    usePathname: () => "/advertiser/campaigns/c1/review/billing",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1", email: "meera@example.com" } }) }));
vi.mock("@/components/booking/summary-rail", () => ({ SummaryRail: () => <aside>Summary</aside> }));
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
                return body;
            }),
            put: vi.fn(),
            delete: vi.fn(),
        },
    };
});

import type { ReadyCampaign } from "@/components/booking/step-page";
import type { AdvertiserProfile, Campaign } from "@/services/booking";
import BillingPage from "./page";

const ready: ReadyCampaign = {
    campaign: { id: "c1", reference: "CMP-0110-2601", advertiserId: "a1", name: "Diwali launch", status: "DRAFT", spots: [], creatives: [], startDate: "2026-10-11", endDate: "2026-10-17", fulfilment: null, reservation: null } as unknown as Campaign,
    review: null,
    advertiser: { id: "a1", name: "Meera Sharma", type: "COMMERCIAL", companyName: "Meera Foods", email: "meera@example.com", gstin: null, billingAddress: null, city: null, state: null, postalCode: null } as unknown as AdvertiserProfile,
    reload: vi.fn(),
    applyCampaign: vi.fn(),
    applyReview: vi.fn(),
};

const PLACE = { formattedAddress: "7, Indiranagar 100 Feet Road, Bengaluru, Karnataka 560038, India", latitude: 12.97, longitude: 77.64, placeId: "p7", city: "Bengaluru", state: "Karnataka", postalCode: "560038" };

beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
    patches.list = [];
    geo.autocomplete.mockReset().mockResolvedValue([{ placeId: "p7", description: PLACE.formattedAddress, mainText: "7, Indiranagar 100 Feet Road", secondaryText: "Bengaluru" }]);
    geo.place.mockReset().mockResolvedValue(PLACE);
});

async function pickInBar() {
    const bar = await screen.findByLabelText("Find the address");
    expect(bar).toHaveAttribute("placeholder", "Type a building, street or landmark");
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: "7 Indiranagar" } });
    fireEvent.click(await screen.findByRole("option", { name: /Indiranagar 100 Feet Road/ }));
}

describe("Billing details — the bar over plain boxes", () => {
    it("fills the address, city, PIN and state from a pick and saves them, no coordinates", async () => {
        render(<BillingPage params={Promise.resolve({ id: "c1" })} />);
        await pickInBar();
        const line = screen.getByLabelText("Address");
        await waitFor(() => expect(line).toHaveValue(PLACE.formattedAddress));
        expect(line).toHaveAttribute("placeholder", "Building, street, area");
        expect(screen.getByLabelText("City")).toHaveValue("Bengaluru");
        expect(screen.getByLabelText("PIN code")).toHaveValue("560038");
        expect(screen.getByLabelText("State")).toHaveValue("Karnataka");
        expect(screen.queryByTestId("map")).toBeNull();
        expect(screen.queryByLabelText(/latitude|longitude/i)).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
        await waitFor(() => expect(patches.list).toHaveLength(1));
        expect(patches.list[0]!.path).toBe("/advertisers/a1");
        expect(patches.list[0]!.body).toMatchObject({ billingAddress: PLACE.formattedAddress, city: "Bengaluru", postalCode: "560038", state: "Karnataka" });
        expect(JSON.stringify(patches.list[0]!.body)).not.toMatch(/latitude|longitude/);
    });

    it("leaves the state alone when the place names one the list does not hold", async () => {
        geo.place.mockResolvedValue({ ...PLACE, state: "Nowhere Pradesh" });
        render(<BillingPage params={Promise.resolve({ id: "c1" })} />);
        await pickInBar();
        await waitFor(() => expect(screen.getByLabelText("Address")).toHaveValue(PLACE.formattedAddress));
        expect(screen.getByLabelText("State")).toHaveValue("");
    });

    it("saves the typed address when nothing is picked", async () => {
        geo.autocomplete.mockRejectedValue(new Error("no vendor"));
        render(<BillingPage params={Promise.resolve({ id: "c1" })} />);
        const line = await screen.findByLabelText("Address");
        fireEvent.change(line, { target: { value: "12, 5th Cross, Koramangala" } });
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Bengaluru" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
        await waitFor(() => expect(patches.list).toHaveLength(1));
        expect(patches.list[0]!.body).toMatchObject({ billingAddress: "12, 5th Cross, Koramangala", city: "Bengaluru" });
    });
});
