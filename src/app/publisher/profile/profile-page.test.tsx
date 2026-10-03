import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Business profile (29 Sep 2026) — the publisher's one settings page: the
 * designed page's profile cards first with the person beside them (where
 * Settings used to hold them), then Notifications, then Privacy & security.
 */

const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
    usePathname: () => "/publisher/profile",
    useSearchParams: () => nav.search,
}));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="map">Map</div> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../layout", () => ({ usePublisher: () => ({ id: "pub-1", name: "Metro Media" }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1" }, refresh: vi.fn(async () => null), signOut: vi.fn() }) }));
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: () => false }));
vi.mock("@/components/custom-fields/custom-fields-section", () => ({ CustomFieldsSection: () => <p>Custom fields</p> }));
vi.mock("@/components/account/avatar-editor", () => ({ AvatarEditor: () => <p>Picture</p> }));
/* The maps vendor: the address bar's suggestions and the place a pick resolves to. */
const geo = vi.hoisted(() => ({ autocomplete: vi.fn(), place: vi.fn() }));
vi.mock("@/services/listing-editor", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/listing-editor")>();
    return { ...actual, listingEditorService: { ...actual.listingEditorService, autocomplete: geo.autocomplete, place: geo.place } };
});

const answers = vi.hoisted(() => ({ map: new Map<string, unknown>(), patches: [] as { path: string; body: unknown }[] }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const get = async (path: string): Promise<unknown> => (answers.map.has(path) ? answers.map.get(path) : {});
    const patch = vi.fn(async (path: string, body: unknown) => {
        answers.patches.push({ path, body });
        return body;
    });
    return { ...actual, api: { get, post: vi.fn(async () => ({})), patch, put: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) } };
});

import ProfilePage from "./page";

const PLACE = { formattedAddress: "12, 5th Cross, Koramangala, Bengaluru, Karnataka 560034, India", latitude: 12.93, longitude: 77.62, placeId: "p12", city: "Bengaluru", state: "Karnataka", postalCode: "560034" };

beforeEach(() => {
    nav.search = new URLSearchParams();
    answers.patches = [];
    geo.autocomplete.mockReset().mockResolvedValue([{ placeId: "p12", description: PLACE.formattedAddress, mainText: "12, 5th Cross, Koramangala", secondaryText: "Bengaluru" }]);
    geo.place.mockReset().mockResolvedValue(PLACE);
    answers.map = new Map<string, unknown>([
        ["/publishers/me", { id: "pub-1", displayId: "PUB-2909-2601", name: "Metro Media", email: "hello@metro.example", mobile: "+919876543210", type: "BUSINESS", kycStatus: "NOT_STARTED", address: "MG Road", city: "Bengaluru", state: "Karnataka" }],
        ["/users/me", { id: "u1", displayId: "ADX-2909-2601", mobile: "+919876543210", name: "Vikram Rao", firstName: "Vikram", lastName: "Rao", email: "vikram@metro.example", avatarUrl: null, hasPassword: false, language: "en", roles: ["PUBLISHER"], dateOfBirth: null }],
        ["/users/me/contacts", { primary: { mobile: "+919876543210", mobileVerifiedAt: "2026-09-01T00:00:00Z", email: "vikram@metro.example", emailVerified: true }, contacts: [] }],
        ["/users/me/preferences", {}],
        ["/notifications/preferences", []],
        ["/users/me/sessions", []],
        ["/auth/2fa/status", { method: "EMAIL", authenticator: { enrolled: false } }],
    ]);
});

describe("Business profile", () => {
    it("opens on the profile: the business's cards, with the person behind the account beside them", async () => {
        render(<ProfilePage />);
        expect(await screen.findByRole("heading", { level: 1, name: /Business profile/ })).toBeInTheDocument();
        expect(within(screen.getByRole("tablist", { name: "Settings sections" })).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Profile", "Notifications", "Privacy & security"]);
        expect(screen.getByText("Business verification")).toBeInTheDocument();
        expect(await screen.findByLabelText("First name")).toHaveValue("Vikram");
        expect(screen.getByLabelText("Date of birth")).toHaveValue("");
        expect(screen.getByRole("heading", { name: "About you" })).toBeInTheDocument();
        /* The person is edited right here now — no way out to a settings page. */
        expect(screen.queryByRole("link", { name: /Edit in Settings|Add your date of birth/ })).not.toBeInTheDocument();
    });

    it("asks where the business is with the address bar over plain boxes — no map, no coordinates", async () => {
        render(<ProfilePage />);
        const bar = await screen.findByLabelText("Find the address");
        expect(bar).toHaveAttribute("placeholder", "Type a building, street or landmark");
        expect(screen.getByLabelText("Address")).toHaveValue("MG Road");
        expect(screen.getByLabelText("Address")).toHaveAttribute("placeholder", "Building, street, area");
        expect(screen.getByLabelText("PIN code")).toHaveAttribute("placeholder", "Six digits — 560001");
        expect(screen.queryByTestId("map")).toBeNull();
        expect(screen.queryByLabelText(/latitude|longitude/i)).toBeNull();
        expect(screen.queryByText(/Pinned on the map|drop the pin/)).toBeNull();
    });

    it("fills the address, city, state and PIN from a pick and sends the coordinates with the save, never showing them", async () => {
        render(<ProfilePage />);
        const bar = await screen.findByLabelText("Find the address");
        fireEvent.focus(bar);
        fireEvent.change(bar, { target: { value: "12 5th Cross" } });
        fireEvent.click(await screen.findByRole("option", { name: /5th Cross, Koramangala/ }));
        await waitFor(() => expect(screen.getByLabelText("Address")).toHaveValue(PLACE.formattedAddress));
        expect(screen.getByLabelText("City")).toHaveValue("Bengaluru");
        expect(screen.getByLabelText("State")).toHaveValue("Karnataka");
        expect(screen.getByLabelText("PIN code")).toHaveValue("560034");
        expect(screen.queryByDisplayValue(String(PLACE.latitude))).toBeNull();
        fireEvent.click(within(bar.closest("form")!).getByRole("button", { name: "Save details" }));
        await waitFor(() => expect(answers.patches).toHaveLength(1));
        expect(answers.patches[0]).toEqual({ path: "/publishers/me", body: { address: PLACE.formattedAddress, postalCode: "560034", latitude: PLACE.latitude, longitude: PLACE.longitude } });
    });

    it("saves an address typed by hand with no coordinates", async () => {
        render(<ProfilePage />);
        const line = await screen.findByLabelText("Address");
        fireEvent.change(line, { target: { value: "14, Brigade Road" } });
        fireEvent.change(screen.getByLabelText("PIN code"), { target: { value: "560001" } });
        fireEvent.click(within(line.closest("form")!).getByRole("button", { name: "Save details" }));
        await waitFor(() => expect(answers.patches).toHaveLength(1));
        expect(answers.patches[0]!.body).toEqual({ address: "14, Brigade Road", postalCode: "560001" });
    });

    it("draws the notifications: the frame's booking emails over the full matrix", async () => {
        nav.search = new URLSearchParams("section=notifications");
        render(<ProfilePage />);
        expect(await screen.findByText("Notification preferences")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    });

    it("draws privacy & security: password, sign-in security, sessions, privacy and agent access", async () => {
        nav.search = new URLSearchParams("section=privacy");
        render(<ProfilePage />);
        expect(await screen.findByText("Set a password")).toBeInTheDocument();
        expect(screen.getByText("One-time code to your phone or email")).toBeInTheDocument();
        expect(await screen.findByText("Active sessions")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Open/ })).toHaveAttribute("href", "/publisher/access");
        expect(screen.queryByText("Business verification")).not.toBeInTheDocument();
    });
});
