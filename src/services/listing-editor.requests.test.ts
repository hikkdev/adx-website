import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(async () => ({})), post: vi.fn(async () => ({})), put: vi.fn(async () => ({})), patch: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) } };
});

import { api } from "@/lib/api-client";
import { cityStageNote, descriptionDraftKey, listingEditorService, type CityResolution } from "./listing-editor";
import { publisherWorkspace } from "./publisher-workspace";

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;
const del = api.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
    get.mockClear();
    post.mockClear();
    del.mockClear();
});

describe("the listing page's reads", () => {
    it("asks the rate gate and the verifications by listing", async () => {
        await listingEditorService.rateGate("l1");
        expect(get).toHaveBeenLastCalledWith("/rate-cards/gate/l1");
        await listingEditorService.verifications("l1");
        expect(get).toHaveBeenLastCalledWith("/supply/listings/l1/verifications");
    });

    it("throws a draft away by its id", async () => {
        await listingEditorService.deleteDraft("d1");
        expect(del).toHaveBeenLastCalledWith("/listings/drafts/d1");
    });

    it("resolves the typed city", async () => {
        await listingEditorService.resolveCity(" Navi Mumbai ");
        expect(get).toHaveBeenLastCalledWith("/app/geo/resolve?name=Navi%20Mumbai");
    });
});

describe("the AI description draft", () => {
    it("reads the allowance by the wizard's key, or by the listing", async () => {
        await listingEditorService.descriptionQuota({ draftKey: "cmu5tney600124kvvo64jo8cf" });
        expect(get).toHaveBeenLastCalledWith("/ai/listing-description/quota?draftKey=cmu5tney600124kvvo64jo8cf");
        await listingEditorService.descriptionQuota({ listingId: "l1" });
        expect(get).toHaveBeenLastCalledWith("/ai/listing-description/quota?listingId=l1");
    });

    it("sends what is in the box, so the server can refuse to write over it", async () => {
        await listingEditorService.generateDescription({ listingId: "l1" }, "", { title: "Atrium wall", city: "Bengaluru" });
        expect(post).toHaveBeenLastCalledWith("/ai/listing-description", { listingId: "l1", current: "", context: { title: "Atrium wall", city: "Bengaluru" } });
    });

    it("keeps a saved draft's id as the key, and makes one the server accepts otherwise", () => {
        expect(descriptionDraftKey("cmu5tney600124kvvo64jo8cf")).toBe("cmu5tney600124kvvo64jo8cf");
        const made = descriptionDraftKey(null, () => "abc");
        expect(made).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
        expect(descriptionDraftKey("short")).toMatch(/^w/);
    });
});

describe("Lot V: what a city's stage means for a new listing", () => {
    const resolution = (over: Partial<CityResolution>): CityResolution => ({ name: "Pune", resolved: true, slug: "pune", city: "Pune", state: "Maharashtra", stage: "LAUNCHED", switches: { supplyIntake: true }, comingSoon: false, ...over });

    it("says nothing for a launched city, an unknown town, or a failed read", () => {
        expect(cityStageNote(resolution({}), "Pune")).toBeNull();
        expect(cityStageNote(resolution({ resolved: false, stage: null }), "Hosur")).toBeNull();
        expect(cityStageNote(null, "Pune")).toBeNull();
    });

    it("warns when ADX takes no new listings there, and explains a seeding city", () => {
        expect(cityStageNote(resolution({ stage: "PAUSED", switches: { supplyIntake: false } }), "Pune")).toEqual({ tone: "warning", text: "ADX is not taking new listings in Pune right now." });
        expect(cityStageNote(resolution({ stage: "SEEDING" }), "Pune")).toMatchObject({ tone: "info", text: expect.stringContaining("published the day the city opens") });
    });
});

describe("the inventory read", () => {
    it("sends the shelf, the trimmed search and the page", async () => {
        await publisherWorkspace.listings({ q: "  atrium ", shelf: "OCCUPIED", page: 2, pageSize: 20 });
        expect(get).toHaveBeenLastCalledWith("/publishers/me/listings?q=atrium&shelf=OCCUPIED&page=2&pageSize=20");
        await publisherWorkspace.listings({ q: "   " });
        expect(get).toHaveBeenLastCalledWith("/publishers/me/listings?pageSize=100");
    });

    it("reads the dashboard", async () => {
        await publisherWorkspace.dashboard();
        expect(get).toHaveBeenLastCalledWith("/publishers/me/dashboard");
    });
});
