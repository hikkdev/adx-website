"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, messageOf } from "@/lib/api-client";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, ErrorPanel, inputClass, LoadingLine, useAsync } from "@/components/advertiser/bits";
import { advertiserWorkspace, REQUEST_TOPICS, requestTags, topicById, type CampaignRow, type UserProfile } from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 11 · New request (5204:74747): "Contact support" — the
 * campaign, the topic, a subject, the reply address, and the message.
 * `POST /support/tickets` with the topic and campaign as tags the desk and
 * the list both read; the answer lands on the request's own page.
 */
export default function NewRequestPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading…</LoadingLine>}>
            <NewRequest />
        </React.Suspense>
    );
}

function NewRequest() {
    const router = useRouter();
    const params = useSearchParams();
    const presetCampaign = params.get("campaign") ?? "";
    const presetTopic = topicById(params.get("topic")) ? params.get("topic")! : "";

    const state = useAsync(
        "new-request",
        async () => {
            const [campaigns, profile] = await Promise.all([advertiserWorkspace.campaigns({ pageSize: 100 }).catch(() => ({ items: [] as CampaignRow[] })), advertiserWorkspace.profile().catch(() => null as UserProfile | null)]);
            return { campaigns: campaigns.items.filter((c) => c.status !== "DRAFT"), profile };
        },
        "Could not open the request form."
    );

    if (state.kind === "loading") return <LoadingLine>Loading…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Contact support" />
                <ErrorPanel title="Could not open the request form" message={state.message} />
            </>
        );
    }
    return <RequestForm campaigns={state.value.campaigns} profile={state.value.profile} presetCampaign={presetCampaign} presetTopic={presetTopic} onCancel={() => router.back()} onSent={(id) => router.push(`/advertiser/requests/${id}?sent=1`)} />;
}

function RequestForm({ campaigns, profile, presetCampaign, presetTopic, onCancel, onSent }: { campaigns: CampaignRow[]; profile: UserProfile | null; presetCampaign: string; presetTopic: string; onCancel: () => void; onSent: (id: string) => void }) {
    const [campaignId, setCampaignId] = React.useState(campaigns.some((c) => c.id === presetCampaign) ? presetCampaign : "");
    const [topicId, setTopicId] = React.useState(presetTopic);
    const [subject, setSubject] = React.useState("");
    const [message, setMessage] = React.useState("");
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [sending, setSending] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const topic = topicById(topicId);
        const next: Record<string, string> = {};
        if (!topic) next.topic = "Choose what the request is about.";
        if (!subject.trim()) next.subject = "Give the request a subject.";
        if (!message.trim()) next.message = "Say what you need.";
        setErrors(next);
        if (Object.keys(next).length || !topic) return;
        setSending(true);
        setFailure(null);
        try {
            const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
            const ticket = await advertiserWorkspace.createTicket({
                kind: "ISSUE",
                title: subject.trim(),
                description: campaign ? `${message.trim()}\n\nCampaign: ${campaign.name} (${campaign.reference})` : message.trim(),
                category: topic.category,
                ...(campaign ? { relatedCampaignId: campaign.id } : {}),
                tags: requestTags(topic, campaign?.id ?? null),
            });
            onSent(ticket.id);
        } catch (caught) {
            const fields = caught instanceof ApiError ? caught.fieldErrors : {};
            setErrors(Object.fromEntries(Object.entries(fields).map(([key, list]) => [key === "description" ? "message" : key === "title" ? "subject" : key, list[0] ?? "Check this field."])));
            setFailure(messageOf(caught, "Could not send the request."));
            setSending(false);
        }
    };

    return (
        <>
            <PageHeading title="Contact support" subtitle="Send a request for your campaign. Replies stay in My requests." />
            <form onSubmit={(event) => void submit(event)} noValidate>
                <section className="mt-6 rounded-lg border border-line bg-white">
                    <div className="border-b border-line px-4 py-3">
                        <h2 className="text-sm font-semibold text-ink">Request details</h2>
                    </div>
                    <div className="grid gap-x-4 gap-y-5 p-4 md:grid-cols-2">
                        <Field label="Campaign" error={errors.campaign}>
                            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={`${inputClass} max-w-[258px] appearance-none`}>
                                <option value="">Not about one campaign</option>
                                {campaigns.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} · {c.reference}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Topic" error={errors.topic}>
                            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={`${inputClass} max-w-[258px] appearance-none ${topicId ? "" : "text-dim"}`} aria-invalid={!!errors.topic}>
                                <option value="">Choose a topic</option>
                                {REQUEST_TOPICS.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Subject" error={errors.subject}>
                            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} placeholder="Artwork approval for festive launch" className={`${inputClass} max-w-[258px]`} aria-invalid={!!errors.subject} />
                        </Field>
                        <Field label="Reply email">
                            {profile?.email ? (
                                <p className="pt-2.5 text-sm text-dim">{profile.email}</p>
                            ) : (
                                <p className="pt-2.5 text-sm text-dim">
                                    No email on your account —{" "}
                                    <Link href="/advertiser/account" className="text-ink underline">
                                        add one in Account settings
                                    </Link>
                                    . Replies stay in My requests either way.
                                </p>
                            )}
                        </Field>
                    </div>
                </section>

                <section className="mt-4 rounded-lg border border-line bg-white p-4">
                    <label htmlFor="request-message" className="text-[11px] font-semibold uppercase tracking-wide text-dim">
                        Message
                    </label>
                    <textarea
                        id="request-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={4000}
                        rows={5}
                        placeholder="Our festive campaign starts on 12 October. Could you confirm whether both supplied artwork files are ready for approval?"
                        className="mt-3 min-h-[120px] w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                        aria-invalid={!!errors.message}
                    />
                    {errors.message && <p className="mt-1 text-xs text-danger">{errors.message}</p>}
                    {failure && <p className="mt-3 text-sm text-danger">{failure}</p>}
                    <div className="mt-4 flex justify-end gap-2">
                        <button type="button" onClick={onCancel} className={btnOutline}>
                            Cancel
                        </button>
                        <button type="submit" className={btnPrimary} disabled={sending}>
                            {sending ? "Sending…" : "Send request"}
                        </button>
                    </div>
                </section>
            </form>
        </>
    );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-sm font-medium text-ink">{label}</p>
            <div className="mt-2">{children}</div>
            {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
    );
}
