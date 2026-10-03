"use client";

import * as React from "react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { btnOutline, btnPrimary, btnSmall, inputClass, StatusChip } from "@/components/advertiser/bits";
import { accessService, GRANT_REASON_MIN, liveGrants, qrImageUrl, timeLabel, type AccessGrant, type GrantTicket, type IssuedGrant } from "@/services/access";

/**
 * Letting an ADX agent help, for a while — the app's access grants. The
 * order is the mechanism: the publisher raises a request; ADX decides who
 * handles it; only then can a code be made, and it is bound to whoever ADX
 * chose. The publisher never sees or types an agent's id. They say what
 * they want changed before the code appears — the only record of what they
 * agreed to, and what the agent sees on the scan — and the warning under
 * the code is the server's own text.
 */
export function AccessGrantsPanel({ publisherId }: { publisherId: string }) {
    const [grants, setGrants] = React.useState<AccessGrant[] | null>(null);
    const [tickets, setTickets] = React.useState<GrantTicket[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [ticketId, setTicketId] = React.useState<string | null>(null);
    const [reason, setReason] = React.useState("");
    const [scope, setScope] = React.useState<"LISTINGS" | "PROFILE">("LISTINGS");
    const [issued, setIssued] = React.useState<IssuedGrant | null>(null);
    const [raising, setRaising] = React.useState(false);
    const [title, setTitle] = React.useState("");
    const [detail, setDetail] = React.useState("");
    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        Promise.all([accessService.grants(publisherId), accessService.openTickets()])
            .then(([grantRows, ticketRows]) => {
                if (cancelled) return;
                setGrants(grantRows);
                setTickets(ticketRows);
                setError(null);
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                setError(messageOf(caught, "Could not reach ADX."));
                setGrants((current) => current ?? []);
            });
        return () => {
            cancelled = true;
        };
    }, [publisherId, tick]);

    const refresh = () => setTick((n) => n + 1);
    const live = liveGrants(grants ?? []);
    /* Only requests somebody is already on can produce a code; the rest are shown as waiting rather than hidden. */
    const assigned = tickets.filter((ticket) => ticket.assignedAgentId !== null);
    const waiting = tickets.filter((ticket) => ticket.assignedAgentId === null);

    const raise = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy("raise");
        setError(null);
        try {
            await accessService.raiseTicket({ title: title.trim(), description: detail.trim() });
            setTitle("");
            setDetail("");
            setRaising(false);
            refresh();
        } catch (caught) {
            setError(messageOf(caught, "Could not send that request."));
        } finally {
            setBusy(null);
        }
    };

    const issue = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ticketId) return;
        setBusy("issue");
        setError(null);
        try {
            const result = await accessService.issueGrant({ publisherId, reason: reason.trim(), scope, supportTicketId: ticketId });
            setIssued(result);
            setReason("");
            refresh();
        } catch (caught) {
            setError(messageOf(caught, "Could not create that code."));
        } finally {
            setBusy(null);
        }
    };

    const withdraw = async (grantId: string) => {
        setBusy(grantId);
        setError(null);
        try {
            await accessService.revokeGrant(grantId);
            if (issued?.grant.id === grantId) setIssued(null);
            refresh();
        } catch (caught) {
            setError(messageOf(caught, "Could not withdraw that."));
        } finally {
            setBusy(null);
        }
    };

    if (grants === null) return <p className="text-sm text-dim">Loading…</p>;

    return (
        <div className="space-y-4">
            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}

            {issued ? (
                <div className="rounded-lg border border-line bg-white p-5">
                    <p className="text-sm font-semibold text-ink">Show this to your agent</p>
                    {issued.grant.qrId && (
                        <div className="mt-4 flex justify-center">
                            <img src={qrImageUrl(issued.grant.qrId)} alt="Access code" className="size-[220px]" />
                        </div>
                    )}
                    <p className="mt-4 rounded-md bg-warning-soft px-3 py-2.5 text-sm text-ink">{issued.warning}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void withdraw(issued.grant.id)} className={btnOutline} disabled={busy !== null}>
                            {busy === issued.grant.id ? "Withdrawing…" : "Withdraw this code"}
                        </button>
                        <button type="button" onClick={() => setIssued(null)} className={btnOutline}>
                            Done
                        </button>
                    </div>
                </div>
            ) : assigned.length > 0 ? (
                <form onSubmit={(event) => void issue(event)} className="rounded-lg border border-line bg-white p-5">
                    <p className="text-sm font-semibold text-ink">Create an access code</p>
                    <p className="mt-3 text-sm font-medium text-ink">Which request is this for?</p>
                    <div className="mt-2 grid gap-2">
                        {assigned.map((ticket) => (
                            <label key={ticket.id} className={cn("flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5", ticketId === ticket.id ? "border-brand-bright bg-[#fff7f7]" : "border-line hover:border-dim")}>
                                <input type="radio" name="grant-ticket" checked={ticketId === ticket.id} onChange={() => setTicketId(ticket.id)} className="accent-[#bd2020]" />
                                <span>
                                    <span className="block text-sm text-ink">{ticket.title}</span>
                                    <span className="block text-xs text-dim">ADX has put an agent on this</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    <label htmlFor="grant-reason" className="mt-4 block text-sm font-medium text-ink">
                        What do you need changed? · In your own words; your agent and ADX see it
                    </label>
                    <textarea
                        id="grant-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="The rate on my gym decal is wrong and I cannot change it"
                        className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                    />
                    <p className="mt-4 text-sm font-medium text-ink">What should they be able to touch?</p>
                    <div role="radiogroup" className="mt-2 inline-flex rounded-md border border-line p-0.5">
                        {(["LISTINGS", "PROFILE"] as const).map((value) => (
                            <button key={value} type="button" role="radio" aria-checked={scope === value} onClick={() => setScope(value)} className={cn("h-8 rounded px-4 text-sm", scope === value ? "bg-ink text-white" : "text-ink hover:bg-ground")}>
                                {value === "LISTINGS" ? "My listings" : "My profile"}
                            </button>
                        ))}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button type="submit" className={btnPrimary} disabled={busy !== null || ticketId === null || reason.trim().length < GRANT_REASON_MIN}>
                            {busy === "issue" ? "Creating…" : "Create the code"}
                        </button>
                        <p className="text-xs text-dim">The code does nothing until the agent ADX assigned scans it, and then it lasts an hour. You can withdraw it at any time.</p>
                    </div>
                </form>
            ) : null}

            {waiting.length > 0 && (
                <div className="rounded-lg border border-line bg-white p-5">
                    <p className="text-sm font-semibold text-ink">Waiting on ADX</p>
                    <ul className="mt-2 divide-y divide-line">
                        {waiting.map((ticket) => (
                            <li key={ticket.id} className="flex items-center justify-between gap-3 py-2.5">
                                <span className="min-w-0">
                                    <span className="block truncate text-sm text-ink">{ticket.title}</span>
                                    <span className="block text-xs text-dim">Nobody assigned yet</span>
                                </span>
                                <StatusChip label="Open" />
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-xs text-dim">You can create an access code once ADX puts someone on the request.</p>
                </div>
            )}

            {raising ? (
                <form onSubmit={(event) => void raise(event)} className="rounded-lg border border-line bg-white p-5">
                    <p className="text-sm font-semibold text-ink">Ask ADX for help</p>
                    <label htmlFor="grant-title" className="mt-3 block text-sm font-medium text-ink">
                        What is it about?
                    </label>
                    <input id="grant-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Wrong rate on my gym decal" className={`${inputClass} mt-2`} />
                    <label htmlFor="grant-detail" className="mt-4 block text-sm font-medium text-ink">
                        Tell them a bit more
                    </label>
                    <textarea
                        id="grant-detail"
                        value={detail}
                        onChange={(event) => setDetail(event.target.value)}
                        rows={3}
                        maxLength={4000}
                        placeholder="I listed it at the wrong price and cannot see how to change it."
                        className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button type="submit" className={btnPrimary} disabled={busy !== null || title.trim().length < 3 || detail.trim().length < 10}>
                            {busy === "raise" ? "Sending…" : "Send to ADX"}
                        </button>
                        <button type="button" onClick={() => setRaising(false)} className={btnOutline}>
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-5">
                    <div>
                        <p className="text-sm font-semibold text-ink">{assigned.length || waiting.length ? "Something else?" : "Need an agent to help with your account?"}</p>
                        <p className="mt-1 text-sm text-dim">Raise a request and ADX will put an agent on it. They can only reach your account if you then let them in.</p>
                    </div>
                    <button type="button" onClick={() => setRaising(true)} className={btnSmall}>
                        Ask ADX for help
                    </button>
                </div>
            )}

            {live.length > 0 && (
                <div className="rounded-lg border border-line bg-white p-5">
                    <p className="text-sm font-semibold text-ink">Access you have given</p>
                    <ul className="mt-2 divide-y divide-line">
                        {live.map((grant) => (
                            <li key={grant.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                <span className="min-w-0">
                                    <span className="block text-sm text-ink">{grant.reason}</span>
                                    <span className="block text-xs text-dim">
                                        {grant.scope === "LISTINGS" ? "Listings" : "Profile"}
                                        {grant.expiresAt ? ` · until ${timeLabel(grant.expiresAt)}` : ""}
                                    </span>
                                </span>
                                <span className="flex items-center gap-2">
                                    <StatusChip label={grant.status === "ACTIVE" ? "In use" : "Not scanned yet"} tone={grant.status === "ACTIVE" ? "warning" : "neutral"} />
                                    <button type="button" onClick={() => void withdraw(grant.id)} className={btnSmall} disabled={busy !== null}>
                                        {busy === grant.id ? "Withdrawing…" : "Withdraw"}
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
