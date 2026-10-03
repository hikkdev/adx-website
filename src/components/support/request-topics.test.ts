import { describe, expect, it } from "vitest";
import { ALL_REQUEST_TOPICS, requestTopicById, requestTopicForCategory, requestTopicOf } from "./request-topics";
import { requestTags } from "@/services/advertiser-workspace";

describe("the advertiser's request topics", () => {
    it("offers every category the app's Report an issue offers, with Something else last", () => {
        const categories = new Set(ALL_REQUEST_TOPICS.map((t) => t.category));
        for (const category of ["APP_BUG", "ORDER", "PAYMENT", "LISTING", "ACCOUNT", "ACCESS", "OTHER"]) expect(categories.has(category)).toBe(true);
        expect(ALL_REQUEST_TOPICS[ALL_REQUEST_TOPICS.length - 1]!.id).toBe("OTHER");
    });

    it("finds a topic by id, by a ?category= link, and on a ticket", () => {
        expect(requestTopicById("LISTING")?.category).toBe("LISTING");
        expect(requestTopicForCategory("ACCESS")?.id).toBe("ACCESS");
        expect(requestTopicForCategory(null)).toBeNull();
        const listing = requestTopicById("LISTING")!;
        expect(requestTopicOf({ tags: requestTags(listing, null), category: "LISTING" })?.id).toBe("LISTING");
        /* No tag: the first topic filed under the category, never a change or a cancellation. */
        expect(requestTopicOf({ tags: [], category: "ORDER" })?.id).toBe("ARTWORK");
    });
});
