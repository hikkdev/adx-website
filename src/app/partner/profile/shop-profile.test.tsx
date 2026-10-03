import * as React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Shop profile (29 Sep 2026) — the print partner's one settings page: the
 * shop, the person behind it, notifications, privacy and security. The
 * shop's cards are the print floor's and say so while it is switched off;
 * the person's settings draw either way.
 */

const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
    usePathname: () => "/partner/profile",
    useSearchParams: () => nav.search,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1", displayId: "ADX-2909-2601" }, refresh: vi.fn(async () => null), signOut: vi.fn() }) }));
const flags = vi.hoisted(() => ({ off: new Set<string>() }));
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: (key: string) => flags.off.has(key) }));
const account = vi.hoisted(() => ({ value: { partner: null as unknown, loaded: false, error: null, reload: () => undefined, replace: () => undefined } }));
vi.mock("@/components/partner/partner-context", () => ({ usePartnerAccount: () => account.value }));
vi.mock("@/components/account/avatar-editor", () => ({ AvatarEditor: () => <p>Picture</p> }));

const answers = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const get = async (path: string): Promise<unknown> => (answers.map.has(path) ? answers.map.get(path) : {});
    return { ...actual, api: { get, post: vi.fn(async () => ({})), patch: vi.fn(async () => ({})), put: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) } };
});

import { FLAG_PRINT_FLOOR } from "@/lib/flags";
import PartnerProfilePage from "./page";

const shop = {
    id: "pp-1",
    displayId: "PP-2909-2601",
    name: "Sharma Prints",
    mobile: "+919876543210",
    legalName: "Sharma Prints LLP",
    gstin: null,
    panNumber: null,
    status: "ACTIVE",
    activatedAt: "2026-09-01T00:00:00Z",
    contactName: "Asha",
    email: "shop@sharma.example",
    address: "12 Market Road",
    city: "Pune",
    capabilities: ["Flex"],
    maxWidthFt: 10,
    turnaroundDays: 3,
    acceptsQuoteRequests: true,
    rateCard: { hasRateCard: false, rows: [], fileId: null },
    kyc: null,
    agreement: null,
};

beforeEach(() => {
    nav.search = new URLSearchParams();
    flags.off = new Set();
    account.value = { partner: shop, loaded: true, error: null, reload: () => undefined, replace: () => undefined };
    answers.map = new Map<string, unknown>([
        ["/users/me", { id: "u1", displayId: "ADX-2909-2601", mobile: "+919876543210", name: "Asha Sharma", firstName: "Asha", lastName: "Sharma", email: "asha@sharma.example", avatarUrl: null, hasPassword: true, language: "en", roles: ["PARTNER"], dateOfBirth: "1988-01-02" }],
        ["/users/me/contacts", { primary: { mobile: "+919876543210", mobileVerifiedAt: "2026-09-01T00:00:00Z", email: "asha@sharma.example", emailVerified: true }, contacts: [] }],
        ["/users/me/preferences", {}],
        ["/notifications/preferences", []],
        ["/users/me/sessions", []],
        ["/auth/2fa/status", { method: "EMAIL", authenticator: { enrolled: false } }],
    ]);
});

describe("Shop profile", () => {
    it("opens on the shop and the person behind it — with no way out to a separate settings page", async () => {
        render(<PartnerProfilePage />);
        expect(screen.getByRole("heading", { level: 1, name: "Shop profile" })).toBeInTheDocument();
        expect(screen.getByText("Sharma Prints")).toBeInTheDocument();
        expect(screen.getByText("Accept quote requests")).toBeInTheDocument();
        expect(await screen.findByLabelText("First name")).toHaveValue("Asha");
        expect(screen.queryByRole("link", { name: /Settings & privacy/ })).not.toBeInTheDocument();
    });

    it("with the print floor off, says so in the shop's place and still draws the person", async () => {
        flags.off = new Set([FLAG_PRINT_FLOOR]);
        account.value = { partner: null, loaded: false, error: null, reload: () => undefined, replace: () => undefined };
        render(<PartnerProfilePage />);
        expect(screen.getByText("The print partner workspace is switched off for now.")).toBeInTheDocument();
        expect(await screen.findByLabelText("First name")).toHaveValue("Asha");
    });

    it("draws the security cards the shop page never had, and privacy, in Privacy & security", async () => {
        nav.search = new URLSearchParams("section=privacy");
        render(<PartnerProfilePage />);
        expect(await screen.findByText("Change password")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Active sessions" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
        expect(screen.getByText("Show my name to advertisers and publishers")).toBeInTheDocument();
    });

    it("draws every kind on every channel in Notifications", async () => {
        nav.search = new URLSearchParams("section=notifications");
        render(<PartnerProfilePage />);
        expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
        expect(await screen.findByText("Quiet hours")).toBeInTheDocument();
    });
});
