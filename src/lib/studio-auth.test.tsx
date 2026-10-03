import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api-client";
import { studioService, studioTokens } from "@/services/studio";
import { RequireStudio, StudioAuthProvider, resetHandoffCheck, useStudioAuth } from "./studio-auth";

vi.mock("@/services/studio", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/studio")>();
    return { ...actual, studioService: { ...actual.studioService, me: vi.fn() } };
});

const me = studioService.me as unknown as ReturnType<typeof vi.fn>;

/** An unsigned JWT with the claims Studio reads — the backend, not the browser, checks signatures. */
function fakeJwt(claims: Record<string, unknown>): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.sig`;
}

function Probe() {
    const { status, can, permissions } = useStudioAuth();
    return (
        <p data-testid="probe">
            {status} · {String(can("content.edit"))} · {permissions.join(",")}
        </p>
    );
}

function mount() {
    return render(
        <StudioAuthProvider>
            <Probe />
            <RequireStudio>
                <p>The tool</p>
            </RequireStudio>
        </StudioAuthProvider>
    );
}

beforeEach(() => {
    resetHandoffCheck();
    studioTokens.clear();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/studio/pages/home");
    me.mockReset();
});

describe("ST-1: Studio's sign-in hand-off", () => {
    it("reads the fragment, keeps the pair under Studio's own keys, clears the address and opens the tool for an admin", async () => {
        const token = fakeJwt({ sub: "u1", roles: ["ADMIN"], perms: ["content.view", "content.edit"] });
        window.location.hash = `#token=${token}&refresh=ref-1`;
        me.mockResolvedValue({ id: "u1", name: "Ops", email: "ops@adx.in", roles: ["ADMIN"] });

        mount();
        expect(screen.getByText("Checking your session…")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("signed-in · true · content.view,content.edit"));
        expect(screen.getByText("The tool")).toBeInTheDocument();
        expect(window.location.hash).toBe("");
        expect(window.location.pathname).toBe("/studio/pages/home");
        expect(window.sessionStorage.getItem("adx.studio.accessToken")).toBe(token);
        expect(window.sessionStorage.getItem("adx.studio.refreshToken")).toBe("ref-1");
        expect(window.localStorage.getItem("adx.web.accessToken")).toBeNull();
        expect(me).toHaveBeenCalledTimes(1);
    });

    it("with no session says to open Studio from the console, linking to Content", async () => {
        mount();
        await waitFor(() => expect(screen.getByText("Open Studio from the console")).toBeInTheDocument());
        expect(screen.getByTestId("studio-open-console")).toHaveAttribute("href", expect.stringMatching(/\/content$/));
        expect(screen.queryByText("The tool")).toBeNull();
        expect(me).not.toHaveBeenCalled();
    });

    it("refuses an account without the ADMIN role", async () => {
        studioTokens.set({ accessToken: fakeJwt({ roles: ["PUBLISHER"] }), refreshToken: "r" });
        me.mockResolvedValue({ id: "u2", name: "Pub", email: "pub@example.com", roles: ["PUBLISHER"] });
        mount();
        await waitFor(() => expect(screen.getByText("This account is not an admin")).toBeInTheDocument());
        expect(screen.getByTestId("probe")).toHaveTextContent("not-admin · false");
    });

    it("forgets a session the backend no longer knows", async () => {
        studioTokens.set({ accessToken: "stale", refreshToken: "r" });
        me.mockRejectedValue(new ApiError(401, "UNAUTHENTICATED", "expired"));
        mount();
        await waitFor(() => expect(screen.getByText("Open Studio from the console")).toBeInTheDocument());
        expect(window.sessionStorage.getItem("adx.studio.accessToken")).toBeNull();
    });
});
