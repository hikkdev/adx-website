/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types. */
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Onboarding addresses (the owner, 1 Oct 2026): the advertiser's billing
 * address — the set-up card's profile step and the account's billing card —
 * is the "Find the address" bar over plain boxes: the address, City |
 * State, PIN | Country. A pick fills them all; a billing address takes no
 * coordinates, so none is ever sent. No map. Typed by hand, the words save.
 */

const geo = vi.hoisted(() => ({ autocomplete: vi.fn(), place: vi.fn() }));
vi.mock("@/services/listing-editor", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/listing-editor")>();
    return { ...actual, listingEditorService: { ...actual.listingEditorService, autocomplete: geo.autocomplete, place: geo.place } };
});
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1" }, refresh: vi.fn(async () => null), signOut: vi.fn() }) }));
vi.mock("@/components/agreements/agreement-accept", () => ({ AgreementAccept: () => <p>Agreement</p> }));

const calls = vi.hoisted(() => ({ get: new Map<string, unknown>(), patch: [] as { path: string; body: unknown }[] }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: vi.fn(async (path: string) => calls.get.get(path) ?? {}),
            post: vi.fn(async () => ({})),
            patch: vi.fn(async (path: string, body: unknown) => {
                calls.patch.push({ path, body });
                return body;
            }),
            put: vi.fn(async () => ({})),
            delete: vi.fn(async () => ({})),
        },
    };
});

import type { AdvertiserProfile } from "@/services/advertiser-workspace";
import { BillingDetailsCard } from "./account-cards";
import { SetupCard } from "./setup-card";

const PLACE = { formattedAddress: "24, Whitefield Main Road, Bengaluru, Karnataka 560066, India", latitude: 12.97, longitude: 77.75, placeId: "p1", city: "Bengaluru", state: "Karnataka", postalCode: "560066" };

const advertiser = (over: Partial<AdvertiserProfile> = {}) =>
    ({ id: "a1", name: "Aster Home", type: "COMMERCIAL", companyName: "Aster Home Pvt Ltd", email: null, gstin: null, billingAddress: null, city: null, state: null, postalCode: null, country: null, kycStatus: "NOT_STARTED", ...over }) as unknown as AdvertiserProfile;

async function pickInBar(typed: string) {
    const bar = await screen.findByLabelText("Find the address");
    expect(bar).toHaveAttribute("placeholder", "Type a building, street or landmark");
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: typed } });
    fireEvent.click(await screen.findByRole("option", { name: /Whitefield Main Road/ }));
}

function noMapNoCoordinates() {
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByLabelText(/latitude|longitude/i)).toBeNull();
}

beforeEach(() => {
    geo.autocomplete.mockReset().mockResolvedValue([{ placeId: "p1", description: PLACE.formattedAddress, mainText: "24, Whitefield Main Road", secondaryText: "Bengaluru, Karnataka" }]);
    geo.place.mockReset().mockResolvedValue(PLACE);
    calls.get = new Map();
    calls.patch = [];
});

describe("Billing details card — the bar over plain boxes", () => {
    it("fills the address, city, state, PIN and country from a pick, and saves them without coordinates", async () => {
        render(<BillingDetailsCard advertiser={advertiser()} kyc={null} onChanged={vi.fn()} />);
        noMapNoCoordinates();
        await pickInBar("24 Whitefield");
        const line = screen.getByLabelText("Billing address");
        await waitFor(() => expect(line).toHaveValue(PLACE.formattedAddress));
        expect(line).toHaveAttribute("placeholder", "Building, street, area");
        expect(geo.autocomplete).toHaveBeenCalledWith("24 Whitefield", expect.any(String), undefined);
        expect(geo.place).toHaveBeenCalledWith("p1", expect.any(String));
        expect(screen.getByLabelText("City")).toHaveValue("Bengaluru");
        expect(screen.getByLabelText("State")).toHaveValue("Karnataka");
        expect(screen.getByLabelText("PIN code")).toHaveValue("560066");
        expect(screen.getByLabelText("PIN code")).toHaveAttribute("placeholder", "Six digits — 560001");
        expect(screen.getByLabelText("Country")).toHaveValue("India");
        noMapNoCoordinates();

        fireEvent.click(screen.getByRole("button", { name: "Save billing details" }));
        await waitFor(() => expect(calls.patch).toHaveLength(1));
        expect(calls.patch[0]).toEqual({ path: "/advertisers/a1", body: { billingAddress: PLACE.formattedAddress, city: "Bengaluru", state: "Karnataka", postalCode: "560066", country: "India" } });
        expect(JSON.stringify(calls.patch[0]!.body)).not.toMatch(/latitude|longitude/);
    });

    it("never clears a box the place does not name", async () => {
        geo.place.mockResolvedValue({ ...PLACE, formattedAddress: "Whitefield Main Road", state: null, postalCode: null });
        render(<BillingDetailsCard advertiser={advertiser({ state: "Kerala", postalCode: "682001", country: "India" })} kyc={null} onChanged={vi.fn()} />);
        await pickInBar("Whitefield");
        await waitFor(() => expect(screen.getByLabelText("Billing address")).toHaveValue("Whitefield Main Road"));
        expect(screen.getByLabelText("State")).toHaveValue("Kerala");
        expect(screen.getByLabelText("PIN code")).toHaveValue("682001");
    });

    it("saves the typed words when nothing is picked", async () => {
        geo.autocomplete.mockRejectedValue(new Error("no vendor"));
        render(<BillingDetailsCard advertiser={advertiser()} kyc={null} onChanged={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("Billing address"), { target: { value: "12, 5th Cross, Koramangala" } });
        fireEvent.click(screen.getByRole("button", { name: "Save billing details" }));
        await waitFor(() => expect(calls.patch).toHaveLength(1));
        expect(calls.patch[0]!.body).toEqual({ billingAddress: "12, 5th Cross, Koramangala" });
    });
});

describe("Set-up card — the profile step's billing address is the bar over plain boxes", () => {
    const open = () => {
        calls.get.set("/advertisers/me", advertiser());
        calls.get.set("/advertisers/a1/eligibility", { eligible: false, blockedBy: ["PROFILE"] });
        render(<SetupCard advertiserId="a1" />);
    };

    it("fills the address, city, state, PIN and country from a pick and sends them, no coordinates", async () => {
        open();
        await pickInBar("24 Whitefield");
        const line = screen.getByLabelText("Billing address");
        await waitFor(() => expect(line).toHaveValue(PLACE.formattedAddress));
        expect(screen.getByLabelText("City")).toHaveValue("Bengaluru");
        expect(screen.getByLabelText("State")).toHaveValue("Karnataka");
        expect(screen.getByLabelText("PIN code")).toHaveValue("560066");
        expect(screen.getByLabelText("Country")).toHaveValue("India");
        noMapNoCoordinates();
        fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
        await waitFor(() => expect(calls.patch).toHaveLength(1));
        expect(calls.patch[0]).toEqual({ path: "/advertisers/a1", body: { companyName: "Aster Home Pvt Ltd", billingAddress: PLACE.formattedAddress, city: "Bengaluru", state: "Karnataka", postalCode: "560066", country: "India" } });
    });

    it("saves the typed words when nothing is picked", async () => {
        open();
        const line = await screen.findByLabelText("Billing address");
        fireEvent.change(line, { target: { value: "12, 5th Cross, Koramangala" } });
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Bengaluru" } });
        fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
        await waitFor(() => expect(calls.patch).toHaveLength(1));
        expect(calls.patch[0]!.body).toEqual({ companyName: "Aster Home Pvt Ltd", billingAddress: "12, 5th Cross, Koramangala", city: "Bengaluru" });
    });
});
