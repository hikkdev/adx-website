import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Account settings (29 Sep 2026, the owner: "Sure, go ahead with further
 * cleanup") — the advertiser's one settings page: the designed page is the
 * profile section, Settings & privacy's notifications and privacy are the
 * other two, and the frame's "Full name" is asked as the two names the
 * account keeps, saved together so the display name never drifts.
 */

const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
    usePathname: () => "/advertiser/account",
    useSearchParams: () => nav.search,
}));
vi.mock("@/app/advertiser/layout", () => ({ useAdvertiser: () => ({ id: "adv-1", name: "Aster Home Pvt Ltd" }) }));
const refresh = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1", firstName: "Meera" }, refresh, signOut: vi.fn() }) }));
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: () => false }));
/* Parts that read their own corners of the API, drawn as markers. */
vi.mock("@/components/custom-fields/custom-fields-section", () => ({ CustomFieldsSection: () => <p>Custom fields</p> }));
vi.mock("@/components/access/my-qr", () => ({ MyQrPanel: () => <p>My QR code</p> }));
vi.mock("@/components/access/access-log", () => ({ AccessLogPanel: () => <p>Access log</p> }));
vi.mock("@/components/account/avatar-editor", () => ({ AvatarEditor: () => <p>Picture</p> }));

const answers = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
const get = vi.hoisted(() => vi.fn(async (path: string): Promise<unknown> => (answers.map.has(path) ? answers.map.get(path) : {})));
const patch = vi.hoisted(() => vi.fn(async (_path: string, body: unknown): Promise<unknown> => body));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: vi.fn(async () => ({})), patch: (path: string, body: unknown) => patch(path, body), put: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) } };
});

import AccountPage from "./page";

const me = { id: "u1", displayId: "ADX-2909-2601", mobile: "+919876543210", name: "Meera Sharma", firstName: "Meera", lastName: "Sharma", email: "meera@aster.example", emailVerifiedAt: "2026-09-01T00:00:00Z", avatarUrl: null, hasPassword: true, language: "en", roles: ["ADVERTISER"], dateOfBirth: "1990-04-12", gender: "FEMALE", advertiserProfile: { id: "adv-1" } };

beforeEach(() => {
    nav.search = new URLSearchParams();
    nav.replace.mockReset();
    patch.mockClear();
    refresh.mockClear();
    answers.map = new Map<string, unknown>([
        ["/users/me", me],
        ["/advertisers/me", { id: "adv-1", displayId: "ADV-2909-2601", name: "Aster Home Pvt Ltd", type: "COMMERCIAL", companyName: "Aster Home Pvt Ltd", email: null, gstin: null, billingAddress: "24, Whitefield Main Road", city: "Bengaluru", state: "Karnataka", postalCode: "560066", country: "India", kycStatus: "NOT_STARTED" }],
        ["/users/me/contacts", { primary: { mobile: "+919876543210", mobileVerifiedAt: "2026-09-01T00:00:00Z", email: "meera@aster.example", emailVerified: true }, contacts: [] }],
        ["/users/me/preferences", {}],
        ["/notifications/preferences", []],
        ["/users/me/sessions", [{ id: "s1", current: true, userAgent: "Mozilla/5.0 (Macintosh)", ipAddress: "10.0.0.1", createdAt: "2026-09-28T00:00:00Z", lastUsedAt: "2026-09-29T00:00:00Z" }]],
        ["/auth/2fa/status", { method: "EMAIL", authenticator: { enrolled: false } }],
    ]);
});

describe("one page, three sections", () => {
    it("keeps the frame's heading and opens on the profile, with the tabs for the other two", async () => {
        render(<AccountPage />);
        expect(screen.getByRole("heading", { level: 1, name: "Account settings" })).toBeInTheDocument();
        const tabs = within(screen.getByRole("tablist", { name: "Settings sections" })).getAllByRole("tab");
        expect(tabs.map((tab) => tab.textContent)).toEqual(["Profile", "Notifications", "Privacy & security"]);
        expect(tabs[0]).toHaveAttribute("aria-selected", "true");
        expect(await screen.findByRole("heading", { name: "Billing details" })).toBeInTheDocument();
        expect(screen.getByText("Custom fields")).toBeInTheDocument();
        /* The person's other facts, the contacts and the language — Settings & privacy's profile half. */
        expect(await screen.findByLabelText("Date of birth")).toHaveValue("1990-04-12");
        expect(screen.getByRole("heading", { name: "About you" })).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "Email & contacts" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument();
    });

    it("switches section through the address, so a link and a reload keep it", async () => {
        render(<AccountPage />);
        fireEvent.click(screen.getByRole("tab", { name: "Privacy & security" }));
        expect(nav.replace).toHaveBeenCalledWith("/advertiser/account?section=privacy", { scroll: false });
    });

    it("draws the notifications: the frame's quick switches over every kind on every channel", async () => {
        nav.search = new URLSearchParams("section=notifications");
        render(<AccountPage />);
        expect(screen.getByRole("tab", { name: "Notifications" })).toHaveAttribute("aria-selected", "true");
        expect(await screen.findByRole("heading", { name: "Notification preferences" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
        expect(await screen.findByText("Quiet hours")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Billing details" })).not.toBeInTheDocument();
    });

    it("draws privacy & security: password, the authenticator, sessions, privacy, the data copy, closure and agent access", async () => {
        nav.search = new URLSearchParams("section=privacy");
        render(<AccountPage />);
        expect(await screen.findByRole("heading", { name: "Password" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Active sessions" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
        expect(await screen.findByText(/^Download my data/)).toBeInTheDocument();
        expect(screen.getAllByText("Close my account").length).toBeGreaterThan(0);
        expect(screen.getByRole("heading", { name: "Agent access" })).toBeInTheDocument();
        expect(screen.getByText("My QR code")).toBeInTheDocument();
    });

    it("opens the section an old anchor's card lives in", async () => {
        window.history.replaceState(null, "", "/advertiser/account#security");
        render(<AccountPage />);
        expect(screen.getByRole("tab", { name: "Privacy & security" })).toHaveAttribute("aria-selected", "true");
        expect(await screen.findByRole("heading", { name: "Password" })).toBeInTheDocument();
        window.history.replaceState(null, "", "/advertiser/account");
    });
});

describe("the name", () => {
    it("is asked as the two names the account keeps, once — never as a full name that can drift", async () => {
        render(<AccountPage />);
        expect(await screen.findByLabelText("First name")).toHaveValue("Meera");
        expect(screen.getByLabelText("Last name")).toHaveValue("Sharma");
        expect(screen.queryByText("Full name")).not.toBeInTheDocument();
        expect(screen.getAllByLabelText("First name")).toHaveLength(1);
    });

    it("saves both names together, and the shell reads the session again", async () => {
        render(<AccountPage />);
        fireEvent.change(await screen.findByLabelText("Last name"), { target: { value: "Sharma-Rao" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/me", { firstName: "Meera", lastName: "Sharma-Rao" }));
        await waitFor(() => expect(refresh).toHaveBeenCalled());
    });
});
