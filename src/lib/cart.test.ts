import { beforeEach, describe, expect, it } from "vitest";
import { cart } from "./cart";

const line = (listingId: string) => ({ listingId, title: `Space ${listingId}`, photo: null, chip: "BILLBOARD", area: "Whitefield", ratePerDay: "1000" });

/**
 * The campaign cart before it is a campaign: a browser-side list a visitor
 * fills before signing in, turned into a campaign on the backend later.
 */
describe("the cart", () => {
    beforeEach(() => cart.clear());

    it("adds a space once, and says whether it did", () => {
        expect(cart.add(line("a"))).toBe(true);
        expect(cart.add(line("a"))).toBe(false);
        expect(cart.get().lines.map((l) => l.listingId)).toEqual(["a"]);
    });

    it("removes, keeps dates, and survives a reload through localStorage", () => {
        cart.add(line("a"));
        cart.add(line("b"));
        cart.remove("a");
        cart.setDates({ from: "2026-10-12", to: "2026-10-25" });
        const stored = JSON.parse(window.localStorage.getItem("adx.web.cart") ?? "{}") as { lines: { listingId: string }[]; dates: { from: string } };
        expect(stored.lines.map((l) => l.listingId)).toEqual(["b"]);
        expect(stored.dates.from).toBe("2026-10-12");
    });

    it("tells its subscribers on every change", () => {
        let calls = 0;
        const stop = cart.subscribe(() => {
            calls += 1;
        });
        cart.add(line("a"));
        cart.setDates({ from: null, to: null });
        stop();
        cart.clear();
        expect(calls).toBe(2);
    });

    it("prints for the advertiser unless told otherwise, and remembers the choice", () => {
        expect(cart.get().printing).toBe(true);
        cart.setPrinting(false);
        expect(cart.get().printing).toBe(false);
        const stored = JSON.parse(window.localStorage.getItem("adx.web.cart") ?? "{}") as { printing: boolean };
        expect(stored.printing).toBe(false);
        cart.clear();
        expect(cart.get().printing).toBe(true);
    });
});
