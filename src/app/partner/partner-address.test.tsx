/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types. */
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Onboarding addresses (the owner, 1 Oct 2026): the print shop's address —
 * on the application and on the shop profile — is the "Find the address"
 * bar over plain boxes (Address, City | State, PIN), no map. A pick fills
 * the line, the city, the state and the PIN and sends the coordinates with
 * the save, never showing them; typed by hand with no pick, the words save
 * and the coordinates keep what they were.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/partner/apply",
    useSearchParams: () => new URLSearchParams(),
}));
/* The map: a stand-in that shows the pin it holds and moves it when asked. */
vi.mock("next/dynamic", () => ({
    default: () =>
        function MapStandIn({ point, onChange }: { point: { latitude: number; longitude: number } | null; onChange: (next: { latitude: number; longitude: number }) => void }) {
            return (
                <div data-testid="map">
                    <span>{point ? `pin ${point.latitude},${point.longitude}` : "no pin"}</span>
                    <button type="button" onClick={() => onChange({ latitude: 18.52, longitude: 73.86 })}>
                        Drag pin
                    </button>
                </div>
            );
        },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/site/site-header", () => ({ SiteHeader: () => <header>ADX</header> }));
/* The person's own settings beside the shop are drawn by their own tests; here only the shop's address matters. */
vi.mock("@/components/account/settings-panels", () => ({ PersonSettings: () => <p>Person</p>, NotificationsSettings: () => null, PartnerSecurity: () => null }));
vi.mock("@/components/account/privacy-section", () => ({ PrivacySection: () => null }));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ status: "signed-in", parties: ["PRINT_PARTNER"], needsEmail: false, user: { id: "u1", displayId: "ADX-0110-2601" }, refresh: vi.fn(async () => null), signOut: vi.fn(), chooseParty: vi.fn() }),
}));
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: () => false }));
const account = vi.hoisted(() => ({ value: { partner: null as unknown, loaded: true, error: null, reload: () => undefined, replace: vi.fn() } }));
vi.mock("@/components/partner/partner-context", () => ({
    PartnerAccountProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    usePartnerAccount: () => account.value,
}));

const geo = vi.hoisted(() => ({ autocomplete: vi.fn(), place: vi.fn() }));
vi.mock("@/services/listing-editor", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/listing-editor")>();
    return { ...actual, listingEditorService: { ...actual.listingEditorService, autocomplete: geo.autocomplete, place: geo.place } };
});

const sent = vi.hoisted(() => ({ list: [] as { method: string; path: string; body: unknown }[] }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) =>
        vi.fn(async (path: string, body?: unknown) => {
            sent.list.push({ method, path, body });
            return { ...(account.value.partner as object), ...(body as object) };
        });
    return { ...actual, api: { get: vi.fn(async () => ({})), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: vi.fn(async () => ({})) } };
});

import PartnerApplyPage from "./apply/page";
import PartnerProfilePage from "./profile/page";

const PLACE = { formattedAddress: "12, 5th Cross, Koramangala, Bengaluru, Karnataka 560034, India", latitude: 12.93, longitude: 77.62, placeId: "p12", city: "Bengaluru", state: "Karnataka", postalCode: "560034" };

const shop = (over: Record<string, unknown> = {}) => ({
    id: "pp-1",
    displayId: "PP-0110-2601",
    name: "Rapid Prints",
    mobile: "+919876543210",
    legalName: null,
    gstin: null,
    panNumber: null,
    status: "ACTIVE",
    activatedAt: "2026-09-01T00:00:00Z",
    appliedAt: null,
    contactName: "Asha",
    email: "shop@rapid.example",
    address: "Old address",
    city: "Pune",
    latitude: null,
    longitude: null,
    capabilities: ["Flex banners"],
    maxWidthFt: null,
    turnaroundDays: 3,
    acceptsQuoteRequests: true,
    rateCard: { hasRateCard: false, rows: [], fileId: null },
    kyc: null,
    agreement: null,
    ...over,
});

async function pickInBar() {
    const bar = screen.getByLabelText("Find the address");
    expect(bar).toHaveAttribute("placeholder", "Type a building, street or landmark");
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: "12 5th Cross" } });
    fireEvent.click(await screen.findByRole("option", { name: /5th Cross, Koramangala/ }));
}

/** Nothing on screen names or holds a coordinate, and no map is drawn. */
function noMapNoCoordinates() {
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByLabelText(/latitude|longitude/i)).toBeNull();
    expect(screen.queryByDisplayValue(String(PLACE.latitude))).toBeNull();
    expect(screen.queryByText(/pin \d/)).toBeNull();
}

beforeEach(() => {
    sent.list = [];
    account.value.replace = vi.fn();
    geo.autocomplete.mockReset().mockResolvedValue([{ placeId: "p12", description: PLACE.formattedAddress, mainText: "12, 5th Cross, Koramangala", secondaryText: "Bengaluru" }]);
    geo.place.mockReset().mockResolvedValue(PLACE);
});

describe("Print partner application — the shop address is the bar over plain boxes", () => {
    beforeEach(() => {
        account.value.partner = shop({ activatedAt: null, appliedAt: "2026-10-01T00:00:00Z", address: null, city: null });
    });

    it("fills the address, city, state and PIN from a pick and sends the coordinates without showing them", async () => {
        render(<PartnerApplyPage />);
        noMapNoCoordinates();
        await pickInBar();
        await waitFor(() => expect(screen.getByLabelText("Shop address")).toHaveValue(PLACE.formattedAddress));
        expect(screen.getByLabelText("City")).toHaveValue("Bengaluru");
        expect(screen.getByLabelText("State")).toHaveValue("Karnataka");
        expect(screen.getByLabelText("PIN code")).toHaveValue("560034");
        expect(screen.getByLabelText("PIN code")).toHaveAttribute("placeholder", "Six digits — 560001");
        noMapNoCoordinates();
        /* Typing over the line after a pick keeps the coordinates. */
        fireEvent.change(screen.getByLabelText("Shop address"), { target: { value: "12, 5th Cross, Koramangala — behind the temple" } });

        fireEvent.click(screen.getByRole("button", { name: "Send application" }));
        await waitFor(() => expect(sent.list).toHaveLength(1));
        expect(sent.list[0]).toMatchObject({
            method: "POST",
            path: "/print-partners/me/application",
            body: { address: "12, 5th Cross, Koramangala — behind the temple", city: "Bengaluru", state: "Karnataka", postalCode: "560034", latitude: PLACE.latitude, longitude: PLACE.longitude },
        });
    });

    it("saves the typed words with no coordinates when nothing was picked", async () => {
        render(<PartnerApplyPage />);
        fireEvent.change(screen.getByLabelText("Shop address"), { target: { value: "12, 5th Cross, Koramangala" } });
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Bengaluru" } });
        fireEvent.change(screen.getByLabelText("PIN code"), { target: { value: "560034" } });
        fireEvent.click(screen.getByRole("button", { name: "Send application" }));
        await waitFor(() => expect(sent.list).toHaveLength(1));
        expect(sent.list[0]!.body).toMatchObject({ address: "12, 5th Cross, Koramangala", city: "Bengaluru", postalCode: "560034" });
        expect(sent.list[0]!.body).not.toHaveProperty("latitude");
        expect(sent.list[0]!.body).not.toHaveProperty("longitude");
    });

    it("says the search is unavailable when the maps vendor fails, and the boxes still save", async () => {
        geo.autocomplete.mockRejectedValue(new Error("no vendor"));
        render(<PartnerApplyPage />);
        const bar = screen.getByLabelText("Find the address");
        fireEvent.focus(bar);
        fireEvent.change(bar, { target: { value: "12, 5th Cross" } });
        expect(await screen.findByText(/Address search is unavailable right now/)).toBeInTheDocument();
        expect(screen.queryByRole("listbox")).toBeNull();
        fireEvent.change(screen.getByLabelText("Shop address"), { target: { value: "12, 5th Cross, Koramangala" } });
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Bengaluru" } });
        fireEvent.click(screen.getByRole("button", { name: "Send application" }));
        await waitFor(() => expect(sent.list).toHaveLength(1));
        expect(sent.list[0]!.body).toMatchObject({ address: "12, 5th Cross, Koramangala", city: "Bengaluru" });
    });
});

describe("Shop profile — the address the agent collects from is the bar over plain boxes", () => {
    beforeEach(() => {
        account.value.partner = shop();
    });

    const openEditor = () => {
        render(<PartnerProfilePage />);
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    };

    it("fills the boxes from a pick; PATCH /print-partners/me carries the state, PIN and coordinates", async () => {
        openEditor();
        noMapNoCoordinates();
        await pickInBar();
        await waitFor(() => expect(screen.getByLabelText("Address the agent collects from")).toHaveValue(PLACE.formattedAddress));
        expect(screen.getByLabelText("City")).toHaveValue("Bengaluru");
        expect(screen.getByLabelText("State")).toHaveValue("Karnataka");
        expect(screen.getByLabelText("PIN code")).toHaveValue("560034");
        noMapNoCoordinates();
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent.list).toHaveLength(1));
        expect(sent.list[0]).toMatchObject({ method: "PATCH", path: "/print-partners/me", body: { address: PLACE.formattedAddress, city: "Bengaluru", state: "Karnataka", postalCode: "560034", latitude: PLACE.latitude, longitude: PLACE.longitude } });
    });

    it("keeps the shop's coordinates when the address is retyped with no pick", async () => {
        account.value.partner = shop({ latitude: 18.5, longitude: 73.8 });
        openEditor();
        fireEvent.change(screen.getByLabelText("Address the agent collects from"), { target: { value: "14 Market Road" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent.list).toHaveLength(1));
        expect(sent.list[0]!.body).toMatchObject({ address: "14 Market Road", city: "Pune", latitude: 18.5, longitude: 73.8 });
    });
});
