import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/* The live-chat kill switch (`support.live-chat`): the tile, the three chat pages, and a live chat opened as a ticket. */

const off = new Set<string>();
vi.mock("@/lib/flags", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/flags")>()),
    useSwitchedOff: (key: string) => off.has(key),
}));
vi.mock("next/navigation", () => ({
    useParams: () => ({}),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/publisher/help",
    useSearchParams: () => new URLSearchParams(),
}));
/* The chat itself is the section behind the gate: a stub proves whether it is mounted. */
vi.mock("@/components/support/live-chat", () => ({ LiveChat: ({ party }: { party: string }) => <div data-testid="live-chat">{party}</div> }));

const answers = new Map<string, unknown>();
const get = vi.fn(async (path: string): Promise<unknown> => {
    for (const [prefix, value] of answers) if (path.startsWith(prefix)) return value;
    return {};
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import { HelpExtras } from "./help-extras";
import { TicketThreadView } from "./ticket-thread";
import AdvertiserChatPage from "@/app/advertiser/help/chat/page";
import PublisherChatPage from "@/app/publisher/help/chat/page";
import PartnerChatPage from "@/app/partner/help/chat/page";
import { FLAG_LIVE_CHAT, FLAG_PUBLISHER_PLANS } from "@/lib/flags";

const entitled = { entitled: true, reason: "PUBLISHER_SUBSCRIPTION", plan: { name: "Pro", tier: "PRO" }, upsell: { title: "Get Pro", href: "" }, online: true, expectedWaitSec: 60, withinHours: true, nextOpening: null, nextOpeningLabel: null, firstResponseTargetSec: 120 };
const upsold = { ...entitled, entitled: false, reason: "NOT_SUBSCRIBED", plan: { name: "Pro", tier: "PRO" } };

const chatTicket = {
    id: "t1",
    userId: "u1",
    kind: "ISSUE",
    displayId: "TKT-0001",
    title: "Live chat",
    description: "Hello",
    category: "OTHER",
    status: "OPEN",
    relatedOrderId: null,
    attachmentUrls: [],
    createdAt: "2026-09-27T10:00:00.000Z",
    updatedAt: "2026-09-27T10:05:00.000Z",
    messages: [],
    channel: "LIVE_CHAT",
};

const liveStatusReads = () => get.mock.calls.filter(([path]) => path === "/support/live/status").length;

describe("live chat switched off", () => {
    beforeEach(() => {
        off.clear();
        answers.clear();
        get.mockClear();
    });

    it("the Chat with us tile offers the request form, says so, and asks nothing of the desk", async () => {
        off.add(FLAG_LIVE_CHAT);
        answers.set("/support/live/status", entitled);
        render(<HelpExtras party="PUBLISHER" />);
        expect(screen.getByText("Live chat is switched off for now. Send a request and ADX Support replies on its thread.")).toBeInTheDocument();
        const request = screen.getByRole("link", { name: "Send a request" });
        expect(request).toHaveAttribute("href", "/publisher/help/new");
        expect(screen.queryByRole("link", { name: "Open live chat" })).not.toBeInTheDocument();
        expect(document.querySelector('a[href="/publisher/help/chat"]')).toBeNull();
        expect(liveStatusReads()).toBe(0);
    });

    it("with the switch on, an entitled person gets the chat link", async () => {
        answers.set("/support/live/status", entitled);
        render(<HelpExtras party="PUBLISHER" />);
        const open = await screen.findByRole("link", { name: "Open live chat" });
        expect(open).toHaveAttribute("href", "/publisher/help/chat");
        expect(screen.queryByText(/switched off/)).not.toBeInTheDocument();
    });

    it("drops the publisher's See plans link while publisher plans are switched off", async () => {
        answers.set("/support/live/status", upsold);
        const { unmount } = render(<HelpExtras party="PUBLISHER" />);
        expect(await screen.findByRole("link", { name: "See plans" })).toHaveAttribute("href", "/publisher/subscription");
        unmount();

        off.add(FLAG_PUBLISHER_PLANS);
        render(<HelpExtras party="PUBLISHER" />);
        expect(await screen.findByText("Send a request and ADX Support replies on its thread.")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "See plans" })).not.toBeInTheDocument();
    });

    it.each([
        ["ADVERTISER", AdvertiserChatPage, "/advertiser/requests/new"],
        ["PUBLISHER", PublisherChatPage, "/publisher/help/new"],
        ["PRINT_PARTNER", PartnerChatPage, "/partner/help/new"],
    ] as const)("the %s chat page draws the line and the request form, and never mounts the chat", async (_party, Page, requestHref) => {
        off.add(FLAG_LIVE_CHAT);
        render(<Page />);
        expect(await screen.findByText("Live chat is switched off for now.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Send a request" })).toHaveAttribute("href", requestHref);
        expect(screen.getByRole("heading", { name: "Chat with us" })).toBeInTheDocument();
        expect(screen.queryByTestId("live-chat")).not.toBeInTheDocument();
    });

    it("with the switch on, the chat page mounts the chat", async () => {
        render(<PublisherChatPage />);
        expect(await screen.findByTestId("live-chat")).toHaveTextContent("PUBLISHER");
        expect(screen.queryByText(/switched off/)).not.toBeInTheDocument();
    });

    it("a live chat opened as a ticket is read as a ticket under the line, with its reply box", async () => {
        off.add(FLAG_LIVE_CHAT);
        answers.set("/support/tickets/t1", chatTicket);
        render(<TicketThreadView party="PRINT_PARTNER" ticketId="t1" />);
        expect(await screen.findByText("Live chat is switched off for now.")).toBeInTheDocument();
        expect(screen.getByLabelText("Reply to ADX Support")).toBeInTheDocument();
        expect(screen.queryByTestId("live-chat")).not.toBeInTheDocument();
    });

    it("with the switch on, a live chat opened as a ticket hands over to the chat", async () => {
        answers.set("/support/tickets/t1", chatTicket);
        render(<TicketThreadView party="PRINT_PARTNER" ticketId="t1" />);
        expect(await screen.findByTestId("live-chat")).toBeInTheDocument();
        expect(screen.queryByText(/switched off/)).not.toBeInTheDocument();
    });
});
