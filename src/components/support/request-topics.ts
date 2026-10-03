import { REQUEST_TOPICS, type RequestTopic, type SupportTicket } from "@/services/advertiser-workspace";

/**
 * The advertiser's Contact support topics, widened to every category the
 * app's Report an issue offers: the frame's topics, and the two the desk
 * also takes that the frame left out — a space's listing, and an agent's
 * access to the account. "Something else" stays last.
 */
const EXTRA: RequestTopic[] = [
    { id: "LISTING", label: "A space's details look wrong", category: "LISTING", next: "ADX Support will check the space's listing with its publisher and reply here." },
    { id: "ACCESS", label: "An ADX agent and my account", category: "ACCESS", next: "ADX Support will look at the access record for your account and reply here. You can see every scan and window of access under Agent access." },
];

export const ALL_REQUEST_TOPICS: RequestTopic[] = [...REQUEST_TOPICS.filter((t) => t.id !== "OTHER"), ...EXTRA, ...REQUEST_TOPICS.filter((t) => t.id === "OTHER")];

export const requestTopicById = (id: string | null | undefined): RequestTopic | null => ALL_REQUEST_TOPICS.find((t) => t.id === id) ?? null;

/** The topic a `?category=` link asks for: the first topic filed under it. */
export const requestTopicForCategory = (category: string | null | undefined): RequestTopic | null => (category ? (ALL_REQUEST_TOPICS.find((t) => t.category === category) ?? null) : null);

/** The topic a ticket was raised under: its `topic:` tag, else the first topic filed under its category (never a change or a cancellation). */
export function requestTopicOf(ticket: Pick<SupportTicket, "tags" | "category">): RequestTopic | null {
    const tag = ticket.tags?.find((t) => t.startsWith("topic:"));
    if (tag) return requestTopicById(tag.slice("topic:".length));
    return ALL_REQUEST_TOPICS.find((t) => t.category === ticket.category && t.id !== "CHANGE" && t.id !== "CANCELLATION") ?? null;
}
