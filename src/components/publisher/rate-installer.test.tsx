import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/* "Rate your installer" behind the `marketplace.reviews` kill switch. */

const off = new Set<string>();
vi.mock("@/lib/flags", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/flags")>()),
    useSwitchedOff: (key: string) => off.has(key),
}));

const get = vi.fn<(path: string) => Promise<unknown>>(async () => ({ askable: true }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import { FLAG_REVIEWS } from "@/lib/flags";
import { RateInstaller } from "./rate-installer";

describe("RateInstaller", () => {
    beforeEach(() => {
        off.clear();
        get.mockClear();
    });

    it("reads nothing and draws nothing while reviews are switched off", async () => {
        off.add(FLAG_REVIEWS);
        const { container } = render(<RateInstaller bookingId="o1" agentName="Ravi" />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(container).toBeEmptyDOMElement();
        expect(get).not.toHaveBeenCalled();
    });

    it("asks once the eligibility read says it may, while reviews are on", async () => {
        render(<RateInstaller bookingId="o1" agentName="Ravi" />);
        expect(await screen.findByText("Rate your installer")).toBeInTheDocument();
        await waitFor(() => expect(get).toHaveBeenCalledWith("/orders/o1/rate-agent/eligibility"));
    });
});
