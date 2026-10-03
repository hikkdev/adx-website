/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types. */
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Onboarding addresses (the owner, 1 Oct 2026): where the website first
 * asks a publisher for an address — the onboarding ladder's details step
 * (an individual) or business step (a business or organisation), and the
 * listing flow's "Verify your business" — is the "Find the address" bar
 * over plain boxes: Address, City | State, PIN. A pick fills them and sends
 * the coordinates with the save (`PATCH /publishers/me` takes them), never
 * showing them; no map; typed by hand, the words save with no coordinates.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/publisher/profile/verify",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="map">Map</div> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const geo = vi.hoisted(() => ({ autocomplete: vi.fn(), place: vi.fn() }));
vi.mock("@/services/listing-editor", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/listing-editor")>();
    return { ...actual, listingEditorService: { ...actual.listingEditorService, autocomplete: geo.autocomplete, place: geo.place } };
});

const calls = vi.hoisted(() => ({ get: new Map<string, unknown>(), patch: [] as { path: string; body: unknown }[], post: [] as { path: string; body: unknown }[] }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: vi.fn(async (path: string) => calls.get.get(path) ?? {}),
            post: vi.fn(async (path: string, body: unknown) => {
                calls.post.push({ path, body });
                return body;
            }),
            patch: vi.fn(async (path: string, body: unknown) => {
                calls.patch.push({ path, body });
                return body;
            }),
            put: vi.fn(async () => ({})),
            delete: vi.fn(async () => ({})),
        },
    };
});

import { KycLadder } from "./kyc-ladder";
import { VerifyBusiness } from "@/components/listing-form/verify-business";
import type { OnboardingManifest } from "@/services/verification";

const PLACE = { formattedAddress: "12, 5th Cross, Koramangala, Bengaluru, Karnataka 560034, India", latitude: 12.93, longitude: 77.62, placeId: "p12", city: "Bengaluru", state: "Karnataka", postalCode: "560034" };

const manifest = (accountType: "INDIVIDUAL" | "BUSINESS", key: "details" | "business"): OnboardingManifest =>
    ({ party: "PUBLISHER", accountType, steps: [{ key, kind: "form", title: key === "details" ? "Your details" : "Your business", subtitle: "As on your documents." }] }) as unknown as OnboardingManifest;

async function pickInBar() {
    const bar = await screen.findByLabelText("Find the address");
    expect(bar).toHaveAttribute("placeholder", "Type a building, street or landmark");
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: "12 5th Cross" } });
    fireEvent.click(await screen.findByRole("option", { name: /5th Cross, Koramangala/ }));
}

function noMapNoCoordinates() {
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByLabelText(/latitude|longitude/i)).toBeNull();
    expect(screen.queryByDisplayValue(String(PLACE.latitude))).toBeNull();
}

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    calls.get = new Map();
    calls.patch = [];
    calls.post = [];
    geo.autocomplete.mockReset().mockResolvedValue([{ placeId: "p12", description: PLACE.formattedAddress, mainText: "12, 5th Cross, Koramangala", secondaryText: "Bengaluru" }]);
    geo.place.mockReset().mockResolvedValue(PLACE);
});

describe("Onboarding ladder — the publisher's address", () => {
    it("individual details: the bar fills the address, city, state and PIN and the save carries the coordinates", async () => {
        render(<KycLadder manifest={manifest("INDIVIDUAL", "details")} answers={{ name: "Asha Rao" }} onFinished={vi.fn()} />);
        noMapNoCoordinates();
        expect(screen.getByLabelText("Address")).toHaveAttribute("placeholder", "Building, street, area");
        expect(screen.getByLabelText("PIN code (optional)")).toHaveAttribute("placeholder", "Six digits — 560001");
        await pickInBar();
        await waitFor(() => expect(screen.getByLabelText("Address")).toHaveValue(PLACE.formattedAddress));
        expect(screen.getByLabelText("City")).toHaveValue("Bengaluru");
        expect(screen.getByLabelText("State")).toHaveValue("Karnataka");
        expect(screen.getByLabelText("PIN code (optional)")).toHaveValue("560034");
        noMapNoCoordinates();
        fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
        await waitFor(() => expect(calls.patch).toHaveLength(1));
        expect(calls.patch[0]).toEqual({ path: "/publishers/me", body: { name: "Asha Rao", address: PLACE.formattedAddress, city: "Bengaluru", state: "Karnataka", postalCode: "560034", latitude: PLACE.latitude, longitude: PLACE.longitude } });
    });

    it("business step: the registered address under the bar; typed by hand it saves with no coordinates", async () => {
        render(<KycLadder manifest={manifest("BUSINESS", "business")} answers={{ gstin: "29ABCDE1234F1Z5" }} onFinished={vi.fn()} />);
        expect(screen.getByLabelText("Find the address")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Registered address"), { target: { value: "14, Brigade Road" } });
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Bengaluru" } });
        fireEvent.change(screen.getByLabelText("State"), { target: { value: "Karnataka" } });
        fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
        await waitFor(() => expect(calls.patch).toHaveLength(1));
        expect(calls.patch[0]!.body).toEqual({ gstin: "29ABCDE1234F1Z5", address: "14, Brigade Road", city: "Bengaluru", state: "Karnataka" });
    });

    it("names a PIN that is not six digits", async () => {
        render(<KycLadder manifest={manifest("INDIVIDUAL", "details")} answers={{ name: "Asha Rao", address: "1 Road", city: "Pune", state: "Maharashtra" }} onFinished={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("PIN code (optional)"), { target: { value: "4110" } });
        fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
        expect(await screen.findByText(/A PIN code is six digits/)).toBeInTheDocument();
        expect(calls.patch).toHaveLength(0);
    });
});

describe("Verify your business — the business address", () => {
    const open = () => {
        calls.get.set("/publishers/me", { id: "pub-1", name: "Metro Media", mobile: "+919876543210", kycStatus: "PENDING", address: "Old Road", city: "Pune", state: null, postalCode: null });
        calls.get.set("/publishers/me/kyc", { businessRegCertUrl: "https://files.example/cert.pdf", status: "PENDING" });
        render(<VerifyBusiness />);
    };

    it("fills the boxes from a pick and sends the address, state, PIN and coordinates", async () => {
        open();
        await waitFor(() => expect(screen.getByLabelText("Address")).toHaveValue("Old Road"));
        noMapNoCoordinates();
        await pickInBar();
        await waitFor(() => expect(screen.getByLabelText("Address")).toHaveValue(PLACE.formattedAddress));
        expect(screen.getByLabelText("City")).toHaveValue("Bengaluru");
        expect(screen.getByLabelText("State")).toHaveValue("Karnataka");
        expect(screen.getByLabelText("PIN code")).toHaveValue("560034");
        fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
        await waitFor(() => expect(calls.patch).toHaveLength(1));
        expect(calls.patch[0]).toEqual({ path: "/publishers/me", body: { address: PLACE.formattedAddress, city: "Bengaluru", state: "Karnataka", postalCode: "560034", latitude: PLACE.latitude, longitude: PLACE.longitude } });
    });

    it("saves the typed address with no coordinates when nothing is picked", async () => {
        open();
        await waitFor(() => expect(screen.getByLabelText("Address")).toHaveValue("Old Road"));
        fireEvent.change(screen.getByLabelText("Address"), { target: { value: "14, Brigade Road" } });
        fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
        await waitFor(() => expect(calls.patch).toHaveLength(1));
        expect(calls.patch[0]!.body).toEqual({ address: "14, Brigade Road" });
    });
});
