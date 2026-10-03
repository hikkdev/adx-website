import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { pageHref, rememberSiteRoutes, type SiteRoutesTable } from "./site-routes";
import { SiteRoutesProvider, usePageHref } from "./site-links";

const table: SiteRoutesTable = {
    version: "v2",
    pages: [
        { key: "help", kind: "SYSTEM", title: "Help", path: "/support", internalPath: "/help", channels: ["WEBSITE"] },
        { key: "diwali", kind: "CUSTOM", title: "Diwali", path: "/diwali", internalPath: null, channels: ["WEBSITE"] },
    ],
    redirects: [],
};

function Links() {
    const href = usePageHref();
    return (
        <ul>
            <li>
                <a href={href("help")}>Help</a>
            </li>
            <li>
                <a href={href("diwali")}>Diwali</a>
            </li>
            <li>
                <a href={href("formats", {}, { hash: "outdoor" })}>Formats</a>
            </li>
        </ul>
    );
}

describe("PB-1: the links provider", () => {
    afterEach(() => rememberSiteRoutes(null));

    it("hands the server's table to every link, and remembers it for the pure helper", () => {
        render(
            <SiteRoutesProvider table={table}>
                <Links />
            </SiteRoutesProvider>
        );
        expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/support");
        expect(screen.getByRole("link", { name: "Diwali" })).toHaveAttribute("href", "/diwali");
        expect(screen.getByRole("link", { name: "Formats" })).toHaveAttribute("href", "/formats#outdoor");
        expect(pageHref("help")).toBe("/support");
    });

    it("links the seeded addresses when there is no table", () => {
        render(
            <SiteRoutesProvider table={null}>
                <Links />
            </SiteRoutesProvider>
        );
        expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
        expect(screen.getByRole("link", { name: "Diwali" })).toHaveAttribute("href", "/pg/diwali");
    });
});
