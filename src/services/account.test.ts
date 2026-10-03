import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
    accountService,
    basicsPatch,
    namesPatch,
    clampOffset,
    closureReason,
    contactHint,
    coverScale,
    cropFromView,
    DEFAULT_CLOSURE_REASON,
    defaultEnabled,
    dobInputValue,
    dobProblem,
    downscaledSize,
    enabledSummary,
    exportReady,
    exportRowHint,
    exportRowValue,
    fillPreferences,
    initialsOf,
    isContactTaken,
    isFeatureOff,
    isLocked,
    isMandatory,
    languageName,
    makePrimaryBody,
    matrixRows,
    nameParts,
    openRequestOf,
    quietHoursLabel,
    setAllRows,
    switchableRows,
    unsubscribedSentence,
    type DataExportRequest,
} from "./account";

type Call = { url: string; init: RequestInit };

/** Answers every request with `{ success: true, data }` (or the failure body at an error status) and records it. */
function stubFetch(answer: unknown, status = 200): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            const body = status < 400 ? { success: true, data: answer } : answer;
            return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
        })
    );
    return calls;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("the notification matrix", () => {
    it("locks in-app and the two mandatory SMS rows, and defaults the rest the way the server does", () => {
        expect(isMandatory("SYSTEM", "SMS")).toBe(true);
        expect(isMandatory("ANNOUNCEMENT", "SMS")).toBe(true);
        expect(isMandatory("ORDER", "SMS")).toBe(false);
        expect(defaultEnabled("KYC", "PUSH")).toBe(true);
        expect(defaultEnabled("SYSTEM", "PUSH")).toBe(false);
        expect(defaultEnabled("WEEKLY_SUMMARY", "EMAIL")).toBe(true);
        expect(defaultEnabled("KYC", "EMAIL")).toBe(false);
        expect(defaultEnabled("ORDER", "SMS")).toBe(false);
        expect(isLocked("IN_APP", undefined)).toBe(true);
        expect(isLocked("EMAIL", { mandatory: true })).toBe(true);
        expect(isLocked("EMAIL", { mandatory: false })).toBe(false);
    });

    it("fills every kind on every channel, keeping what was saved", () => {
        const filled = fillPreferences([{ type: "KYC", channel: "EMAIL", enabled: true }, { type: "DISPUTE", enabled: false }]);
        expect(filled).toHaveLength(9 * 4);
        expect(filled.find((r) => r.type === "KYC" && r.channel === "EMAIL")?.enabled).toBe(true);
        /* A row without a channel is the in-app one. */
        expect(filled.find((r) => r.type === "DISPUTE" && r.channel === "IN_APP")?.enabled).toBe(false);
        expect(filled.find((r) => r.type === "WEEKLY_SUMMARY" && r.channel === "EMAIL")?.enabled).toBe(true);
    });

    it("draws a switch on every cell but in-app and the mandatory rows", () => {
        const rows = matrixRows([]);
        expect(rows).toHaveLength(9 * 3 - 2);
        expect(rows.some((r) => r.channel === "IN_APP")).toBe(false);
        expect(rows.some((r) => r.type === "SYSTEM" && r.channel === "SMS")).toBe(false);
        expect(enabledSummary([])).toBe(`${rows.filter((r) => r.enabled).length} of 25 on`);
    });

    it("sets every switch one way and leaves the locked rows alone", () => {
        const off = setAllRows([], false);
        expect(off).toHaveLength(25);
        expect(off.every((r) => r.enabled === false && r.channel !== "IN_APP")).toBe(true);
    });

    it("keeps the app's own switchable subset for the index count", () => {
        const rows = switchableRows([]);
        expect(rows.some((r) => r.type === "SYSTEM" && r.channel === "SMS")).toBe(false);
        expect(rows.find((r) => r.type === "WEEKLY_SUMMARY")?.channel).toBe("EMAIL");
    });

    it("prints the quiet window and the unsubscribe sentence", () => {
        expect(quietHoursLabel("22:00-07:00")).toBe("10:00 PM to 7:00 AM");
        expect(quietHoursLabel("12:30-00:15")).toBe("12:30 PM to 12:15 AM");
        expect(unsubscribedSentence({ emailUnsubscribedAt: "2026-09-04T10:00:00.000Z" })).toBe("You unsubscribed from ADX emails on 4 September 2026.");
        expect(unsubscribedSentence({ emailUnsubscribedAt: null })).toBeNull();
        expect(unsubscribedSentence(null)).toBeNull();
    });
});

describe("download my data", () => {
    const row = (over: Partial<DataExportRequest> = {}): DataExportRequest => ({ id: "x1", status: "PENDING", requestedAt: "2026-09-20T10:00:00.000Z", readyAt: null, expiresAt: null, fileId: null, error: null, ...over });

    it("reads the state the row prints", () => {
        expect(exportRowValue(null)).toBeNull();
        expect(exportRowValue(row())).toBe("Preparing");
        expect(exportRowValue(row({ status: "READY", fileId: "f1", expiresAt: "2026-09-27T10:00:00.000Z" }))).toBe("Ready until 27 Sep");
        expect(exportRowValue(row({ status: "FAILED" }))).toBe("Failed");
        expect(exportRowValue(row({ status: "EXPIRED" }))).toBeNull();
        expect(exportRowHint(row({ status: "FAILED", error: "The zip was too large." }))).toBe("The zip was too large. Ask again to retry.");
        expect(exportReady(row({ status: "READY", fileId: "f1" }))).toBe(true);
        expect(exportReady(row({ status: "READY", fileId: "" }))).toBe(false);
    });

    it("keeps the open request a 409 names instead of reporting an error", () => {
        const open = row({ status: "READY", fileId: "f9" });
        expect(openRequestOf(new ApiError(409, "DATA_EXPORT_OPEN", "open", { code: "DATA_EXPORT_OPEN", request: open }))).toEqual(open);
        expect(openRequestOf(new ApiError(409, "CONFLICT", "other", { code: "OTHER" }))).toBeNull();
        expect(openRequestOf(new Error("x"))).toBeNull();
    });

    it("answers the open request when the POST is refused with it", async () => {
        const open = row({ status: "PENDING" });
        stubFetch({ success: false, error: { code: "DATA_EXPORT_OPEN", message: "One is open", details: { code: "DATA_EXPORT_OPEN", request: open } } }, 409);
        await expect(accountService.requestExport()).resolves.toEqual(open);
    });

    it("reads a latest answer that is not a request as none", async () => {
        stubFetch(null);
        await expect(accountService.latestExport()).resolves.toBeNull();
    });

    it("knows the feature switch refusal", () => {
        expect(isFeatureOff(new ApiError(503, "FEATURE_OFF", "off"))).toBe(true);
        expect(isFeatureOff(new ApiError(503, "DOWN", "down"))).toBe(false);
    });
});

describe("closing the account", () => {
    it("sends the reason, or the default when it is too short", async () => {
        expect(closureReason("  ")).toBe(DEFAULT_CLOSURE_REASON);
        expect(closureReason("no")).toBe(DEFAULT_CLOSURE_REASON);
        expect(closureReason(" Moving city ")).toBe("Moving city");
        const calls = stubFetch({ case: { id: "c1", ticketId: "t1" }, summary: {} });
        await accountService.requestClosure("");
        expect(calls[0]!.url).toMatch(/\/users\/me\/closure-request$/);
        expect(calls[0]!.init.method).toBe("POST");
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ reason: DEFAULT_CLOSURE_REASON });
    });
});

describe("profile basics", () => {
    it("splits a display name when the two names are not stored", () => {
        expect(nameParts({ name: "Asha Rani Kumar", firstName: null, lastName: null })).toEqual({ firstName: "Asha Rani", lastName: "Kumar" });
        expect(nameParts({ name: "Asha", firstName: null, lastName: null })).toEqual({ firstName: "Asha", lastName: "" });
        expect(nameParts({ name: "x", firstName: "Asha", lastName: "K" })).toEqual({ firstName: "Asha", lastName: "K" });
    });

    it("sends only what changed, and never empties a name", () => {
        const before = { firstName: "Asha", lastName: "K", dateOfBirth: "", gender: "" };
        expect(basicsPatch(before, before)).toEqual({});
        /* The two names travel together, so the display name the server composes from them never drifts. */
        expect(basicsPatch(before, { ...before, lastName: " Kumar ", gender: "FEMALE", dateOfBirth: "1990-05-01" })).toEqual({ firstName: "Asha", lastName: "Kumar", gender: "FEMALE", dateOfBirth: "1990-05-01" });
        expect(basicsPatch(before, { ...before, gender: "FEMALE" })).toEqual({ gender: "FEMALE" });
        expect(namesPatch({ firstName: "Meera", lastName: "" }, { firstName: "Meera", lastName: "" })).toEqual({});
        expect(namesPatch({ firstName: "Meera", lastName: "" }, { firstName: "Meera", lastName: "Sharma" })).toEqual({ firstName: "Meera", lastName: "Sharma" });
        expect(namesPatch({ firstName: "Meera", lastName: "Sharma" }, { firstName: "Meera ", lastName: "  " })).toEqual({ firstName: "Meera" });
        expect(namesPatch({ firstName: "Meera", lastName: "Sharma" }, { firstName: " ", lastName: "Rao" })).toEqual({});
        expect(basicsPatch(before, { ...before, firstName: "  " })).toEqual({});
        expect(basicsPatch(before, { ...before, gender: "ROBOT" })).toEqual({});
    });

    it("checks the date of birth the way the server does — any age, never the future", () => {
        const now = new Date(2026, 8, 26, 9);
        expect(dobProblem("", now)).toBeNull();
        expect(dobProblem("1990-05-01", now)).toBeNull();
        /* 29 Sep 2026: under 18 is kept — only an order asks for 18 or over. */
        expect(dobProblem("2015-01-01", now)).toBeNull();
        expect(dobProblem("2026-09-27", now)).toBe("That date is in the future.");
        expect(dobProblem("1850-01-01", now)).toMatch(/year/);
        expect(dobProblem("01/05/1990", now)).toMatch(/YYYY-MM-DD/);
        /* Calendar days, the server's rule — today is the latest birthday there is. */
        const today = new Date(2026, 8, 29, 9);
        expect(dobProblem("2008-09-29", today)).toBeNull();
        expect(dobProblem("2008-09-30", today)).toBeNull();
        expect(dobProblem("2026-09-29", today)).toBeNull();
        expect(dobProblem("1906-09-29", today)).toBeNull();
        expect(dobProblem("1906-09-28", today)).toBe("Check the year.");
        expect(dobProblem("1990-02-30", today)).toBe("That is not a date.");
        expect(dobInputValue("1990-05-01T00:00:00.000Z")).toBe("1990-05-01");
        expect(dobInputValue(null)).toBe("");
    });

    it("patches the person and uploads the picture with its crop", async () => {
        const calls = stubFetch({ id: "u1" });
        await accountService.updateProfile({ firstName: "Asha", avatarUrl: null });
        expect(calls[0]!.url).toMatch(/\/users\/me$/);
        expect(calls[0]!.init.method).toBe("PATCH");
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ firstName: "Asha", avatarUrl: null });

        await accountService.uploadAvatar(new Blob(["x"], { type: "image/jpeg" }), "avatar.jpg", { x: 0.1, y: 0, width: 0.5, height: 0.5 });
        const form = calls[1]!.init.body as FormData;
        expect(calls[1]!.url).toMatch(/\/upload$/);
        expect(form.get("purpose")).toBe("AVATAR");
        expect(JSON.parse(String(form.get("crop")))).toEqual({ x: 0.1, y: 0, width: 0.5, height: 0.5 });
        expect(form.get("file")).toBeInstanceOf(Blob);
    });

    it("names people and languages", () => {
        expect(initialsOf("asha rani kumar")).toBe("AR");
        expect(initialsOf("", "?")).toBe("?");
        expect(languageName("kn")).toBe("Kannada");
        expect(languageName("xx")).toBe("English");
    });
});

describe("contacts and the number change", () => {
    const contact = { id: "c1", kind: "PHONE" as const, value: "+919876543210", label: null, verifiedAt: null, addedBy: { id: "desk", name: "Priya" }, createdAt: "" };

    it("words a contact's line and the make-primary confirm", () => {
        expect(contactHint(contact, "me")).toBe("Phone number · not verified · added by Priya");
        expect(contactHint({ ...contact, label: "Office", verifiedAt: "x", addedBy: { id: "me", name: "Me" } }, "me")).toBe("Office");
        expect(makePrimaryBody(contact, { mobile: "+919000000000", mobileVerifiedAt: null, email: null, emailVerified: false })).toMatch(/becomes your sign-in number. Every device is signed out/);
        expect(makePrimaryBody({ kind: "EMAIL", value: "a@b.in" }, { mobile: "+91", mobileVerifiedAt: null, email: "old@b.in", emailVerified: true })).toMatch(/old@b.in stays on your account/);
        expect(isContactTaken(new ApiError(409, "CONTACT_TAKEN", "taken"))).toBe(true);
    });

    it("walks the three calls of the two-code change", async () => {
        const calls = stubFetch({ sentTo: "CURRENT" });
        await accountService.startMobileChange("+919876543210");
        await accountService.confirmOldMobile("+919876543210", "123456");
        await accountService.verifyMobileChange("+919876543210", "654321");
        expect(calls.map((c) => c.url.replace(/^.*\/api\/v1/, ""))).toEqual(["/auth/change-mobile/start", "/auth/change-mobile/confirm-old", "/auth/change-mobile/verify"]);
        expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ newMobile: "+919876543210", code: "123456" });
    });

    it("adds a contact and asks for its code", async () => {
        const calls = stubFetch({ id: "c9" });
        await accountService.addContact({ kind: "EMAIL", value: "work@b.in", label: "Work" });
        await accountService.sendContactCode("c9");
        await accountService.verifyContact("c9", "ABCDEFGH");
        await accountService.makeContactPrimary("c9");
        expect(calls.map((c) => `${c.init.method} ${c.url.replace(/^.*\/api\/v1/, "")}`)).toEqual([
            "POST /users/me/contacts",
            "POST /users/me/contacts/c9/send-code",
            "POST /users/me/contacts/c9/verify",
            "POST /users/me/contacts/c9/make-primary",
        ]);
        expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ code: "ABCDEFGH" });
    });
});

describe("the avatar crop", () => {
    it("covers the window and keeps the picture over it", () => {
        expect(coverScale(280, 1000, 500)).toBeCloseTo(0.56);
        expect(clampOffset(10, 280, 1000, 0.56)).toBe(0);
        expect(clampOffset(-1000, 280, 1000, 0.56)).toBe(280 - 560);
    });

    it("answers the window as fractions of the picture", () => {
        const crop = cropFromView({ window: 280, imageWidth: 1000, imageHeight: 500, scale: 0.56, offsetX: -140, offsetY: 0 });
        expect(crop.x).toBeCloseTo(0.25);
        expect(crop.y).toBe(0);
        expect(crop.width).toBeCloseTo(0.5);
        expect(crop.height).toBeCloseTo(1);
    });

    it("downscales a large picture and never enlarges a small one", () => {
        expect(downscaledSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
        expect(downscaledSize(800, 600)).toEqual({ width: 800, height: 600 });
    });
});
