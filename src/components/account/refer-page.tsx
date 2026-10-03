"use client";

import * as React from "react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnPrimary, btnSmall, inputClass, StatusChip } from "@/components/advertiser/bits";
import { FieldBlock, SettingsCard } from "./parts";
import { EMPTY_REFERRALS, referBody, referralsService, referralStanding, referReady, sentLine, shareMessage, totalsLine, type LeadSide, type MyReferrals } from "@/services/referrals";

/**
 * Refer a business — the app's LH3 screen: the person's own link to share,
 * a short form for a business they know (a name, a number, which side), and
 * what they referred with where each stands. A publisher or an advertiser
 * earns the referral credit in their wallet when the business goes live.
 */
export function ReferPage({ defaultSide }: { defaultSide: LeadSide }) {
    const [data, setData] = React.useState<MyReferrals | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [side, setSide] = React.useState<LeadSide>(defaultSide);
    const [form, setForm] = React.useState({ businessName: "", phone: "", contactName: "", city: "" });
    const [busy, setBusy] = React.useState(false);
    const [sent, setSent] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        referralsService
            .mine()
            .then((next) => {
                if (!cancelled) {
                    setData(next);
                    setError(null);
                }
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                setError(messageOf(caught, "Could not read your referrals."));
                setData((current) => current ?? EMPTY_REFERRALS);
            });
        return () => {
            cancelled = true;
        };
    }, [tick]);

    const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
    const ready = referReady(form);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        setSent(null);
        try {
            const answer = await referralsService.refer(referBody({ side, ...form }));
            setSent(sentLine(form.businessName, answer));
            setForm({ businessName: "", phone: "", contactName: "", city: "" });
            setTick((n) => n + 1);
        } catch (caught) {
            setError(messageOf(caught, "That did not go through."));
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!data?.link.url) return;
        try {
            await navigator.clipboard.writeText(shareMessage(data.link, defaultSide));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            setError("Your browser would not copy. Select the link and copy it.");
        }
    };

    const share = async () => {
        if (!data?.link.url || !navigator.share) return;
        try {
            await navigator.share({ text: shareMessage(data.link, defaultSide), url: data.link.url });
        } catch {
            /* The share sheet was dismissed. */
        }
    };

    return (
        <>
            <PageHeading title="Refer a business" subtitle="Know a shop, a building or a brand that should be on ADX? Send them your link, or tell us about them." />
            {!data ? (
                <p className="mt-6 text-sm text-dim">Loading your link…</p>
            ) : (
                <div className="mt-6 grid max-w-[920px] gap-4">
                    {sent && <p className="rounded-md bg-success-soft px-4 py-3 text-sm text-ink">{sent}</p>}
                    {error && (
                        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
                            {error}
                        </p>
                    )}
                    <SettingsCard title="Your link" line="When a business you refer goes live on ADX, the referral credit lands in your wallet.">
                        {data.link.url ? (
                            <>
                                <p className="break-all rounded-md bg-ground px-3 py-2.5 text-sm text-ink">{data.link.url}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button type="button" onClick={() => void copy()} className={btnSmall}>
                                        {copied ? "Copied" : "Copy my link"}
                                    </button>
                                    {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                                        <button type="button" onClick={() => void share()} className={btnSmall}>
                                            Share
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-dim">Your link could not be read. Refresh the page to try again.</p>
                        )}
                    </SettingsCard>

                    <SettingsCard title="Know a business?" line="A name and a number are enough; ADX reaches out and keeps you posted here.">
                        <form onSubmit={(event) => void submit(event)} noValidate>
                            <p className="text-sm font-medium text-ink">They would</p>
                            <div role="radiogroup" aria-label="They would" className="mt-2 inline-flex rounded-md border border-line p-0.5">
                                {(["PUBLISHER", "ADVERTISER"] as const).map((value) => (
                                    <button key={value} type="button" role="radio" aria-checked={side === value} onClick={() => setSide(value)} className={cn("h-8 rounded px-4 text-sm", side === value ? "bg-ink text-white" : "text-ink hover:bg-ground")}>
                                        {value === "PUBLISHER" ? "List a space" : "Advertise"}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 grid gap-x-4 gap-y-5 md:grid-cols-2">
                                <FieldBlock label="Business" htmlFor="refer-business">
                                    <input id="refer-business" value={form.businessName} onChange={set("businessName")} maxLength={160} placeholder="Sharma Sweets" className={inputClass} />
                                </FieldBlock>
                                <FieldBlock label="Phone" htmlFor="refer-phone">
                                    <input id="refer-phone" value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="98765 43210" className={inputClass} />
                                </FieldBlock>
                                <FieldBlock label="Contact (optional)" htmlFor="refer-contact">
                                    <input id="refer-contact" value={form.contactName} onChange={set("contactName")} maxLength={120} placeholder="Who to ask for" className={inputClass} />
                                </FieldBlock>
                                <FieldBlock label="City (optional)" htmlFor="refer-city">
                                    <input id="refer-city" value={form.city} onChange={set("city")} maxLength={80} placeholder="Bengaluru" className={inputClass} />
                                </FieldBlock>
                            </div>
                            <div className="mt-5 flex justify-end">
                                <button type="submit" className={btnPrimary} disabled={!ready || busy}>
                                    {busy ? "Sending…" : "Send to ADX"}
                                </button>
                            </div>
                        </form>
                    </SettingsCard>

                    <SettingsCard title="Referred" actions={<span className="text-sm text-dim">{totalsLine(data.totals)}</span>}>
                        {data.referrals.length === 0 ? (
                            <p className="text-sm text-dim">Nobody yet. Share your link, or add a business above.</p>
                        ) : (
                            <ul className="divide-y divide-line">
                                {data.referrals.map((row) => {
                                    const standing = referralStanding(row);
                                    return (
                                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-ink">{row.lead?.businessName ?? "A business"}</span>
                                                <span className="block text-xs text-dim">{[row.lead?.city, row.lead?.side === "ADVERTISER" ? "advertiser" : "space", row.creditAmount && row.creditedAt ? `₹${row.creditAmount} credited` : null].filter(Boolean).join(" · ")}</span>
                                            </span>
                                            <StatusChip label={standing.label} tone={standing.tone} />
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </SettingsCard>
                </div>
            )}
        </>
    );
}
