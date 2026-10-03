import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The order age gate (29 Sep 2026, the owner: "You don't need to be over 18
 * to use ADX, but you do need to be over 18 to place orders"): what it does
 * before an order is sent, with the 403 `AGE_REQUIRED` an order door answers,
 * and with the date of birth it saves.
 */

/* The session the gate reads: null is "no AuthProvider" (the date is then unknown and the server decides). */
const session = vi.hoisted(() => ({ value: null as { user: Record<string, unknown> | null; refresh: () => Promise<unknown> } | null }));
vi.mock("@/lib/auth", () => ({ useOptionalAuth: () => session.value }));

const patch = vi.hoisted(() => vi.fn(async (_path: string, body?: unknown) => body));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { ...actual.api, patch: (path: string, body?: unknown) => patch(path, body) } };
});

import { ageRefusalOf, ApiError, isAgeRequired } from "@/lib/api-client";
import { isoYearsAgo } from "@/services/party";
import { AgeGate, birthDateOnFile, UNDER_18_LINE, useAgeGate } from "./age-gate";

const MISSING = () => new ApiError(403, "AGE_REQUIRED", "Add your date of birth to place an order — you need to be 18 or over.", { reason: "MISSING", self: true });
const UNDER_18 = () => new ApiError(403, "AGE_REQUIRED", "You need to be 18 or over to place an order.", { reason: "UNDER_18", self: true });
const FOR_SOMEONE_ELSE = () => new ApiError(403, "AGE_REQUIRED", "Add the account holder's date of birth to place this order — they need to be 18 or over.", { reason: "MISSING", self: false });

/** A checkout the way every screen wires the gate: `ready` first, `caught` in the catch, the gate beside the button. */
function Checkout({ order, upfront }: { order: () => Promise<void>; upfront?: boolean }) {
    const age = useAgeGate({ upfront });
    const [done, setDone] = React.useState(false);
    const pay = async () => {
        if (!age.ready(() => void pay())) return;
        try {
            await order();
            setDone(true);
        } catch (caught) {
            if (!age.caught(caught, () => void pay())) throw caught;
        }
    };
    return (
        <>
            <AgeGate gate={age} />
            <button type="button" disabled={age.blocked} onClick={() => void pay()}>
                Pay now
            </button>
            {done && <p>Order placed</p>}
        </>
    );
}

const signedIn = (dateOfBirth: string | null | undefined) => {
    const refresh = vi.fn(async () => null);
    session.value = { user: { id: "u1", mobile: "+919876543210", roles: ["ADVERTISER"], ...(dateOfBirth === undefined ? {} : { dateOfBirth }) }, refresh };
    return refresh;
};

beforeEach(() => {
    session.value = null;
    patch.mockClear();
});

describe("reading AGE_REQUIRED", () => {
    it("reads the reason and whose order it is, and nothing else as the age rule", () => {
        expect(ageRefusalOf(MISSING())).toEqual({ reason: "MISSING", self: true, message: "Add your date of birth to place an order — you need to be 18 or over." });
        expect(ageRefusalOf(UNDER_18())).toMatchObject({ reason: "UNDER_18", self: true });
        expect(ageRefusalOf(FOR_SOMEONE_ELSE())).toMatchObject({ reason: "MISSING", self: false });
        /* A reason the server did not name is read as missing; a missing `self` as the person themselves. */
        expect(ageRefusalOf(new ApiError(403, "AGE_REQUIRED", "Too young"))).toEqual({ reason: "MISSING", self: true, message: "Too young" });
        expect(ageRefusalOf(new ApiError(403, "FORBIDDEN", "No"))).toBeNull();
        expect(ageRefusalOf(new Error("AGE_REQUIRED"))).toBeNull();
        expect(isAgeRequired(UNDER_18())).toBe(true);
        expect(isAgeRequired(new ApiError(409, "INSUFFICIENT_FUNDS", "Short"))).toBe(false);
    });

    it("knows the date on file: a day, none, or not known", () => {
        expect(birthDateOnFile({ dateOfBirth: "1990-04-12" })).toBe("1990-04-12");
        expect(birthDateOnFile({ dateOfBirth: "1990-04-12T00:00:00.000Z" })).toBe("1990-04-12");
        expect(birthDateOnFile({ dateOfBirth: null })).toBeNull();
        expect(birthDateOnFile({})).toBeUndefined();
        expect(birthDateOnFile(null)).toBeUndefined();
    });
});

describe("before an order is sent", () => {
    it("lets the order go for someone 18 or over, and draws nothing", async () => {
        signedIn("1990-04-12");
        const order = vi.fn(async () => undefined);
        render(<Checkout order={order} />);
        expect(screen.queryByTestId("age-gate")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
        expect(await screen.findByText("Order placed")).toBeInTheDocument();
        expect(order).toHaveBeenCalledTimes(1);
    });

    it("asks for a missing date of birth right there, saves it, re-reads the session and places the order", async () => {
        const refresh = signedIn(null);
        const order = vi.fn(async () => undefined);
        render(<Checkout order={order} />);
        /* Nothing is asked until an order is tried. */
        expect(screen.queryByTestId("age-gate")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
        const field = await screen.findByLabelText("Date of birth");
        expect(order).not.toHaveBeenCalled();
        expect(screen.getByText("Add your date of birth")).toBeInTheDocument();
        expect(screen.getByText("You need to be 18 or over to place orders.")).toBeInTheDocument();
        expect(field).toHaveAttribute("max", isoYearsAgo(0));
        expect(field).toHaveAttribute("min", isoYearsAgo(120));
        fireEvent.change(field, { target: { value: "1990-04-12" } });
        fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
        expect(await screen.findByText("Order placed")).toBeInTheDocument();
        expect(patch).toHaveBeenCalledWith("/users/me", { dateOfBirth: "1990-04-12" });
        expect(refresh).toHaveBeenCalled();
        expect(order).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId("age-gate")).not.toBeInTheDocument();
    });

    it("refuses a date in the future without saving it", async () => {
        signedIn(null);
        const order = vi.fn(async () => undefined);
        render(<Checkout order={order} />);
        fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
        fireEvent.change(await screen.findByLabelText("Date of birth"), { target: { value: isoYearsAgo(-1) } });
        fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("That date is in the future.");
        expect(patch).not.toHaveBeenCalled();
        expect(order).not.toHaveBeenCalled();
    });

    it("keeps an under-18 date — the account may hold it — but holds the order", async () => {
        signedIn(null);
        const order = vi.fn(async () => undefined);
        render(<Checkout order={order} />);
        fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
        fireEvent.change(await screen.findByLabelText("Date of birth"), { target: { value: isoYearsAgo(15) } });
        fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
        expect(await screen.findByText(UNDER_18_LINE)).toBeInTheDocument();
        expect(patch).toHaveBeenCalledWith("/users/me", { dateOfBirth: isoYearsAgo(15) });
        expect(order).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Pay now" })).toBeDisabled();
    });

    it("says so and holds the button for someone on file as under 18", () => {
        signedIn(isoYearsAgo(17));
        render(<Checkout order={vi.fn()} />);
        expect(screen.getByText("You need to be 18 or over to place an order.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pay now" })).toBeDisabled();
    });

    it("keeps the under-18 line back until tried when asked to (a switch that also turns auto-renew off)", async () => {
        signedIn(isoYearsAgo(17));
        const order = vi.fn(async () => undefined);
        render(<Checkout order={order} upfront={false} />);
        expect(screen.queryByText(UNDER_18_LINE)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
        expect(await screen.findByText(UNDER_18_LINE)).toBeInTheDocument();
        expect(order).not.toHaveBeenCalled();
    });
});

describe("when the order door answers AGE_REQUIRED", () => {
    it("asks for the missing date, then sends the same order again", async () => {
        /* No session read here: the date is not known, so the server decides. */
        const order = vi.fn(async () => undefined).mockRejectedValueOnce(MISSING());
        render(<Checkout order={order} />);
        fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
        const field = await screen.findByLabelText("Date of birth");
        expect(order).toHaveBeenCalledTimes(1);
        fireEvent.change(field, { target: { value: "1988-01-02" } });
        fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
        expect(await screen.findByText("Order placed")).toBeInTheDocument();
        expect(patch).toHaveBeenCalledWith("/users/me", { dateOfBirth: "1988-01-02" });
        expect(order).toHaveBeenCalledTimes(2);
    });

    it("asks even when the session thought a date was on file", async () => {
        signedIn("1990-04-12");
        const order = vi.fn(async () => undefined).mockRejectedValueOnce(MISSING());
        render(<Checkout order={order} />);
        fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
        fireEvent.change(await screen.findByLabelText("Date of birth"), { target: { value: "1990-04-12" } });
        fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
        await waitFor(() => expect(order).toHaveBeenCalledTimes(2));
    });

    it("says under 18 plainly and holds the button", async () => {
        const order = vi.fn(async () => undefined).mockRejectedValueOnce(UNDER_18());
        render(<Checkout order={order} />);
        fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
        expect(await screen.findByText(UNDER_18_LINE)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pay now" })).toBeDisabled();
        expect(screen.queryByLabelText("Date of birth")).not.toBeInTheDocument();
    });

    it("prints the server's own sentence when someone acts for the account", async () => {
        const order = vi.fn(async () => undefined).mockRejectedValueOnce(FOR_SOMEONE_ELSE());
        render(<Checkout order={order} />);
        fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Add the account holder's date of birth to place this order — they need to be 18 or over.");
        expect(screen.queryByLabelText("Date of birth")).not.toBeInTheDocument();
        expect(patch).not.toHaveBeenCalled();
    });
});
