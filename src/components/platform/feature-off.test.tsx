import * as React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { status: "signed-in" as "signed-in" | "signed-out", user: { id: "usr-1" } as { id: string } | null } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth.value }));

import { api } from "@/lib/api-client";
import { FlagsProvider, FLAG_LIVE_CHAT, FLAG_REVIEWS, useSwitchedOff } from "@/lib/flags";
import { FeatureGate, FeatureOff, featureOffLine } from "./feature-off";

/**
 * The page-side half of the kill switches (28 Sep 2026): `FeatureGate` draws
 * the section while its switch is on or unknown and one plain line while it
 * is off — the flags answer says so, or a call came back 503 FEATURE_OFF in
 * the middle of the session — and a fresh answer that says on brings it back.
 */

type Route = { status: number; body: unknown };
let routes: Record<string, Route>;
let calls: string[];

function json(route: Route) {
    return new Response(JSON.stringify(route.body), { status: route.status, headers: { "Content-Type": "application/json" } });
}

const flagsAnswer = (data: unknown): Route => ({ status: 200, body: { success: true, data } });
const featureOff = (key: string): Route => ({ status: 503, body: { success: false, error: { code: "FEATURE_OFF", message: "This feature is switched off", details: { key } } } });

beforeEach(() => {
    auth.value = { status: "signed-in", user: { id: "usr-1" } };
    calls = [];
    routes = { "/app/flags": flagsAnswer({ [FLAG_LIVE_CHAT]: { enabled: true, variant: null } }) };
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            const path = new URL(url, "http://x").pathname.replace(/^.*\/api\/v1/, "");
            calls.push(path);
            return json(routes[path] ?? { status: 404, body: { success: false, error: { code: "NOT_FOUND", message: "no" } } });
        })
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** A section that reads on mount, the way a gated page does. */
function Chat() {
    React.useEffect(() => {
        void api.get("/support/live/status").catch(() => undefined);
    }, []);
    return <p>The chat thread</p>;
}

function Probe({ flag }: { flag: string }) {
    return <span data-testid="probe">{useSwitchedOff(flag) ? "off" : "on"}</span>;
}

describe("FeatureOff", () => {
    it("says the feature is switched off, in the registry's words, 'are' for a plural name", () => {
        expect(featureOffLine("Live chat")).toBe("Live chat is switched off for now.");
        render(
            <>
                <FeatureOff flag={FLAG_LIVE_CHAT} />
                <FeatureOff flag={FLAG_REVIEWS} />
                <FeatureOff name="Applying as a print partner">Come back later.</FeatureOff>
            </>
        );
        expect(screen.getByText("Live chat is switched off for now.")).toBeInTheDocument();
        expect(screen.getByText("Reviews are switched off for now.")).toBeInTheDocument();
        expect(screen.getByText("Applying as a print partner is switched off for now.")).toBeInTheDocument();
        expect(screen.getByText("Come back later.")).toBeInTheDocument();
    });
});

describe("FeatureGate", () => {
    it("draws the section while the switch is on, and it reads", async () => {
        render(
            <FlagsProvider>
                <FeatureGate flag={FLAG_LIVE_CHAT}>
                    <Chat />
                </FeatureGate>
            </FlagsProvider>
        );
        expect(screen.getByText("The chat thread")).toBeInTheDocument();
        await waitFor(() => expect(calls).toContain("/support/live/status"));
        expect(screen.queryByText("Live chat is switched off for now.")).not.toBeInTheDocument();
    });

    it("draws the plain line in the section's place once the answer says off, and the section is not mounted", async () => {
        routes["/app/flags"] = flagsAnswer({ [FLAG_LIVE_CHAT]: { enabled: false, variant: null } });
        render(
            <FlagsProvider>
                <FeatureGate flag={FLAG_LIVE_CHAT} off={<FeatureOff flag={FLAG_LIVE_CHAT}>Send a request instead.</FeatureOff>}>
                    <Chat />
                </FeatureGate>
            </FlagsProvider>
        );
        expect(await screen.findByText("Live chat is switched off for now.")).toBeInTheDocument();
        expect(screen.getByText("Send a request instead.")).toBeInTheDocument();
        expect(screen.queryByText("The chat thread")).not.toBeInTheDocument();
    });

    it("draws the section when the answer does not name the key, or the read fails, or nobody is signed in — the server decides", async () => {
        routes["/app/flags"] = { status: 500, body: { success: false, error: { code: "INTERNAL", message: "boom" } } };
        const { unmount } = render(
            <FlagsProvider>
                <FeatureGate flag={FLAG_LIVE_CHAT}>
                    <Chat />
                </FeatureGate>
            </FlagsProvider>
        );
        await waitFor(() => expect(calls).toContain("/app/flags"));
        expect(screen.getByText("The chat thread")).toBeInTheDocument();
        unmount();

        auth.value = { status: "signed-out", user: null };
        render(
            <FlagsProvider>
                <FeatureGate flag={FLAG_REVIEWS}>
                    <p>The reviews</p>
                </FeatureGate>
            </FlagsProvider>
        );
        expect(screen.getByText("The reviews")).toBeInTheDocument();
    });

    it("takes the section down when a call comes back 503 FEATURE_OFF mid-session, and a fresh answer brings it back", async () => {
        routes["/support/live/status"] = featureOff(FLAG_LIVE_CHAT);
        render(
            <FlagsProvider>
                <Probe flag={FLAG_LIVE_CHAT} />
                <FeatureGate flag={FLAG_LIVE_CHAT}>
                    <Chat />
                </FeatureGate>
            </FlagsProvider>
        );
        // The flags answer said on; the section's own read was refused — the whole page now reads off.
        expect(await screen.findByText("Live chat is switched off for now.")).toBeInTheDocument();
        expect(screen.getByTestId("probe")).toHaveTextContent("off");

        // Switched back on: the next read of /app/flags (the tab coming back to the front) is the platform's word.
        routes["/support/live/status"] = { status: 200, body: { success: true, data: { entitled: false } } };
        await act(async () => {
            Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
            document.dispatchEvent(new Event("visibilitychange"));
        });
        expect(await screen.findByText("The chat thread")).toBeInTheDocument();
        expect(screen.getByTestId("probe")).toHaveTextContent("on");
    });
});
