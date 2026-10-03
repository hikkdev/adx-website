import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Studio's picture picker asks for ADX's own pictures (28 Sep 2026). The
 * artwork advertisers upload with a display ad lives with their ads on the
 * console's Ads & sponsored › Display ads; an ADX page never picks it.
 * Pinned: the picker's read carries `owner=adx`, beside the field's spec.
 */

const { media } = vi.hoisted(() => ({ media: { list: vi.fn(), specs: vi.fn(), upload: vi.fn() } }));

vi.mock("@/services/studio", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/studio")>();
    return { ...actual, studioService: { ...actual.studioService, media } };
});

import { mediaQuery, type MediaAsset } from "@/services/studio";
import { MediaField } from "./field-widgets";
import { StudioLookupsProvider, type StudioLookups } from "./lookups";

const tile: MediaAsset = {
    id: "med_tile",
    url: "https://cdn.adx.in/media/tile.jpg",
    mime: "image/jpeg",
    width: 600,
    height: 600,
    bytes: 90_000,
    altText: "Malls",
    title: "Malls tile",
    tags: [],
    spec: "TILE",
    archivedAt: null,
    createdAt: "2026-09-27T00:00:00.000Z",
};

const lookups: StudioLookups = {
    types: new Map(),
    surface: "WEB_HOME",
    media: new Map(),
    rememberMedia: vi.fn(),
    specs: [],
    slots: [],
    forms: null,
    pages: [],
    listingNames: new Map(),
    rememberListing: vi.fn(),
    cityNames: new Map(),
    rememberCity: vi.fn(),
    readOnly: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    media.list.mockResolvedValue([tile]);
});

describe("the media query", () => {
    it("names the owner when one is asked, and leaves it off otherwise", () => {
        expect(mediaQuery({ spec: "TILE", owner: "adx", limit: 200 })).toBe("?spec=TILE&owner=adx&limit=200");
        expect(mediaQuery({ limit: 200 })).toBe("?limit=200");
    });
});

describe("the picture picker", () => {
    it("reads ADX's own pictures only, cut to the field's spec", async () => {
        render(
            <StudioLookupsProvider value={lookups}>
                <MediaField value="" onChange={vi.fn()} spec="TILE" />
            </StudioLookupsProvider>
        );
        fireEvent.click(screen.getByRole("button", { name: "Choose" }));
        await waitFor(() => expect(media.list).toHaveBeenCalledTimes(1));
        expect(media.list).toHaveBeenCalledWith({ spec: "TILE", owner: "adx", limit: 200 });
        expect(await screen.findByText("Malls tile")).toBeInTheDocument();
    });
});
