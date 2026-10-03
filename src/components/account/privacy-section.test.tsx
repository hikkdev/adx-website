import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/* Download my data behind the `users.data-export` kill switch. */

const off = new Set<string>();
vi.mock("@/lib/flags", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/flags")>()),
    useSwitchedOff: (key: string) => off.has(key),
}));

const answers = new Map<string, unknown>();
const get = vi.fn(async (path: string): Promise<unknown> => {
    const value = answers.get(path);
    if (value instanceof Error) throw value;
    return value ?? {};
});
const post = vi.fn<(path: string, body: unknown) => Promise<unknown>>(async () => ({}));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: (path: string, body: unknown) => post(path, body), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import { ApiError } from "@/lib/api-client";
import { FLAG_DATA_EXPORT } from "@/lib/flags";
import { PrivacySection } from "./privacy-section";

const exportCalls = () => [...get.mock.calls, ...post.mock.calls].filter(([path]) => path === "/users/me/data-export").length;

describe("Download my data", () => {
    beforeEach(() => {
        off.clear();
        answers.clear();
        get.mockClear();
        post.mockClear();
        answers.set("/users/me/preferences", {});
    });

    it("switched off: the plain line in the row's place, and the export is never read", async () => {
        off.add(FLAG_DATA_EXPORT);
        render(<PrivacySection party="PUBLISHER" />);
        expect(screen.getByText("Downloading your data is switched off for now.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Ask for my copy" })).not.toBeInTheDocument();
        await waitFor(() => expect(get).toHaveBeenCalledWith("/users/me/preferences"));
        expect(exportCalls()).toBe(0);
    });

    it("switched on: the export door, after reading the latest copy", async () => {
        answers.set("/users/me/data-export", null);
        render(<PrivacySection party="PUBLISHER" />);
        expect(await screen.findByRole("button", { name: "Ask for my copy" })).toBeInTheDocument();
        await waitFor(() => expect(get).toHaveBeenCalledWith("/users/me/data-export"));
        expect(screen.queryByText(/switched off/)).not.toBeInTheDocument();
    });

    it("a 503 FEATURE_OFF on the read still takes the row down", async () => {
        answers.set("/users/me/data-export", new ApiError(503, "FEATURE_OFF", "off", { key: FLAG_DATA_EXPORT }));
        render(<PrivacySection party="PUBLISHER" />);
        expect(await screen.findByText("Downloading your data is switched off for now.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Ask for my copy" })).not.toBeInTheDocument();
    });
});
