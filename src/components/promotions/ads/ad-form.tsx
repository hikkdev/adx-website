"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { messageOf } from "@/lib/api-client";
import { btnOutline, btnPrimary } from "@/components/advertiser/bits";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { TextField } from "@/components/booking/fields";
import { DaysCalendar } from "@/components/promotions/days-calendar";
import {
    canEditAd,
    dayLabel,
    dayOf,
    featureOff,
    fullDays,
    fullDaysOf,
    promotionsService,
    type AdBookingView,
    type AdDraftInput,
    type AdSlotInfo,
    type MediaSpec,
    type SlotDay,
} from "@/services/promotions";
import { AdCreative } from "./ad-creative";
import { adFormProblems, adHref, draftProblems, editHref, patchOf, slotSpec, prettySlug, quoteFor, type AdFormState } from "./ad-helpers";
import { AdsClosed } from "./ads-gate";
import { ArtworkField, type PickedArtwork } from "./artwork-field";
import { CityPicker, type PickedCity } from "./city-picker";
import { QuoteBlock } from "./quote-block";
import { SlotCard } from "./slot-preview";

/** The cities an ad already names, by name where the view carries them. */
function initialCities(ad: AdBookingView | null): PickedCity[] {
    if (!ad) return [];
    const named = (ad as AdBookingView & { cities?: { id?: string; slug?: string; name?: string }[] }).cities;
    const names = new Map<string, string>();
    if (Array.isArray(named)) for (const row of named) if (row?.name) names.set(row.id ?? row.slug ?? "", row.name);
    return (ad.cityIds ?? []).map((id) => ({ id, name: names.get(id) ?? prettySlug(id) }));
}

/**
 * LM-1 "Book an ad": the slot, the days on the slot's own calendar, the
 * cities, the words and the link, the artwork checked before it goes up,
 * and the price beside it all. Saving makes (or updates) the draft, uploads
 * the artwork, and — on "Submit and pay" — submits it, which holds the days
 * and opens the pay step on the ad's page. Submitting is an order (29 Sep
 * 2026): the age gate asks a missing date of birth first and holds it for
 * someone under 18; a draft always saves.
 */
export function AdForm({ slots, specs, initial }: { slots: AdSlotInfo[]; specs: MediaSpec[] | null; initial: AdBookingView | null }) {
    const router = useRouter();
    const initialSlot = initial?.slot?.key ?? initial?.slotKey ?? (slots.length === 1 ? slots[0].key : "");
    const [slotKey, setSlotKey] = React.useState(initialSlot);
    const [run, setRun] = React.useState<{ from: string; to: string } | null>(initial ? { from: dayOf(initial.startDate), to: dayOf(initial.endDate) } : null);
    const [cities, setCities] = React.useState<PickedCity[]>(() => initialCities(initial));
    const [title, setTitle] = React.useState(initial?.title ?? "");
    const [headline, setHeadline] = React.useState(initial?.headline ?? "");
    const [ctaLabel, setCtaLabel] = React.useState(initial?.ctaLabel ?? "");
    const [targetUrl, setTargetUrl] = React.useState(initial?.targetUrl ?? "https://");
    const [picked, setPicked] = React.useState<PickedArtwork | null>(null);
    const [draft, setDraft] = React.useState<AdBookingView | null>(initial);
    const [avail, setAvail] = React.useState<{ key: string; days: SlotDay[] }>({ key: "", days: [] });
    const [refused, setRefused] = React.useState<string[] | null>(null);
    const [busy, setBusy] = React.useState<"save" | "submit" | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [closed, setClosed] = React.useState(false);
    const [tried, setTried] = React.useState(false);
    const age = useAgeGate();

    const slot = slots.find((row) => row.key === slotKey) ?? null;
    const spec = slot ? slotSpec(slot, specs) : null;
    const from = run?.from ?? "";
    const to = run?.to ?? "";
    const full = slot && avail.key === slot.key && run ? fullDays(avail.days, from, to) : [];
    const hasArtwork = !!picked || !!draft?.mediaId || !!draft?.media;
    const form: AdFormState = { slotKey, from, to, title, headline, ctaLabel, targetUrl, hasArtwork, artworkProblems: picked?.problems ?? [] };
    const problems = adFormProblems(form, slot, full);
    const quote = quoteFor(slot, from, to, draft);

    const load = React.useCallback(
        async (a: string, b: string) => {
            if (!slotKey) return [];
            const answer = await promotionsService.slotAvailability(slotKey, a, b);
            const days = Array.isArray(answer?.days) ? answer.days.map((day) => ({ ...day, date: dayOf(day.date) })) : [];
            setAvail({ key: slotKey, days });
            return days;
        },
        [slotKey]
    );

    if (closed) return <AdsClosed />;
    if (draft && !canEditAd(draft.status)) {
        return (
            <div className="mt-6 rounded-lg border border-line bg-white p-6">
                <p className="text-sm font-medium text-ink">This ad can no longer be changed</p>
                <p className="mt-1 text-sm text-dim">Only a draft, or an ad ADX turned down, can be edited.</p>
                <Link href={adHref(draft.id)} className={`${btnOutline} mt-4`}>
                    Open the ad
                </Link>
            </div>
        );
    }

    const save = async (submit: boolean) => {
        setTried(true);
        setError(null);
        setRefused(null);
        const blocking = submit ? problems : draftProblems(form, slot);
        if (blocking.length > 0 || !slot || !run) return;
        if (submit && !age.ready(() => void save(true))) return;
        setBusy(submit ? "submit" : "save");
        const body: AdDraftInput = {
            slotKey: slot.key,
            title: title.trim(),
            targetUrl: targetUrl.trim(),
            cityIds: cities.map((city) => city.id),
            startDate: run.from,
            endDate: run.to,
            ...(headline.trim() ? { headline: headline.trim() } : {}),
            ...(ctaLabel.trim() ? { ctaLabel: ctaLabel.trim() } : {}),
        };
        let current = draft;
        try {
            current = current ? await promotionsService.updateAd(current.id, patchOf(body)) : await promotionsService.createAd(body);
            if (!draft) router.replace(editHref(current.id), { scroll: false });
            setDraft(current);
            if (picked && picked.problems.length === 0) {
                const answer: unknown = await promotionsService.uploadArtwork(current.id, picked.file, headline.trim() || title.trim());
                current = answer && typeof answer === "object" && "status" in answer ? (answer as AdBookingView) : await promotionsService.ad(current.id);
                setDraft(current);
                URL.revokeObjectURL(picked.url);
                setPicked(null);
            }
            if (submit) {
                const submitted = await promotionsService.submitAd(current.id);
                toast.success("Submitted — pay to hold your days.");
                router.push(adHref(submitted?.id ?? current.id));
            } else {
                toast.success("Draft saved.");
                router.push(adHref(current.id));
            }
        } catch (caught) {
            /* The draft is saved by now: once the date of birth is in, only the submit is sent again. */
            const saved = current;
            if (submit && saved && age.caught(caught, () => void submitSaved(saved.id))) return;
            const days = fullDaysOf(caught);
            if (days) setRefused(days);
            else if (featureOff(caught)) setClosed(true);
            else setError(messageOf(caught, "Could not save the ad."));
        } finally {
            setBusy(null);
        }
    };

    /** The submit alone, for a draft already saved — what the age gate sends again after the date of birth. */
    const submitSaved = async (id: string) => {
        if (!age.ready(() => void submitSaved(id))) return;
        setBusy("submit");
        setError(null);
        try {
            const submitted = await promotionsService.submitAd(id);
            toast.success("Submitted — pay to hold your days.");
            router.push(adHref(submitted?.id ?? id));
        } catch (caught) {
            if (age.caught(caught, () => void submitSaved(id))) return;
            const days = fullDaysOf(caught);
            if (days) setRefused(days);
            else if (featureOff(caught)) setClosed(true);
            else setError(messageOf(caught, "Could not submit the ad."));
        } finally {
            setBusy(null);
        }
    };

    const showProblems = tried && problems.length > 0;

    return (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
                <Step n={1} title="Where it shows" line="Each slot is a place on ADX's own pages. Ads in a slot take turns.">
                    {draft ? (
                        <div className="max-w-[360px]">
                            {slot ? <SlotCard slot={slot} specs={specs} checked onSelect={() => {}} /> : <p className="text-sm text-danger">The slot this ad was booked in is no longer on sale. Cancel it and book another.</p>}
                            <p className="mt-3 text-xs text-dim">The slot is fixed once an ad is saved. For another slot, book a new ad.</p>
                        </div>
                    ) : slots.length === 0 ? (
                        <p className="text-sm text-dim">ADX has no ad slots on sale right now.</p>
                    ) : (
                        <div role="radiogroup" aria-label="Ad slot" className="grid gap-4 sm:grid-cols-2">
                            {slots.map((row) => (
                                <SlotCard key={row.key} slot={row} specs={specs} checked={row.key === slotKey} onSelect={() => setSlotKey(row.key)} />
                            ))}
                        </div>
                    )}
                </Step>

                <Step n={2} title="Your days" line={slot ? `Each day shows how many places are left. The shortest run in this slot is ${Math.max(1, slot.minDays)} day${Math.max(1, slot.minDays) === 1 ? "" : "s"}.` : "Choose a slot first."}>
                    {slot ? <DaysCalendar load={load} loadKey={slot.key} capacity={slot.maxConcurrent} value={run} onChange={(next) => (setRun(next), setRefused(null))} minDays={Math.max(1, slot.minDays)} /> : <p className="text-sm text-dim">The calendar opens once a slot is chosen.</p>}
                    {refused && (
                        <p role="alert" className="mt-3 text-sm text-danger" data-testid="slot-full">
                            {refused.length > 0 ? `These days filled up before you submitted: ${refused.map(dayLabel).join(", ")}. Pick a run around them — your draft is kept.` : "Some of your days filled up before you submitted. Pick another run — your draft is kept."}
                        </p>
                    )}
                </Step>

                <Step n={3} title="Cities" line="Show it everywhere, or only to people looking at pages in chosen cities.">
                    <CityPicker value={cities} onChange={setCities} />
                </Step>

                <Step n={4} title="The ad" line="The name is only for you and ADX. The headline and the button sit under the artwork; both are optional.">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <TextField label="Name (only you see it)" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Diwali sale — sidebar" />
                        <TextField label="Link a tap opens" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} maxLength={500} placeholder="https://your-site.com/offer" inputMode="url" />
                        <TextField label="Headline (optional)" value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={90} placeholder="Festive offers, this week only" />
                        <TextField label="Button label (optional)" value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} maxLength={24} placeholder="Shop now" />
                    </div>
                </Step>

                <Step n={5} title="Artwork" line="Checked here before it goes up, and checked again by ADX before it runs.">
                    <ArtworkField spec={spec} picked={picked} onPick={setPicked} hasExisting={!!draft?.mediaId || !!draft?.media} />
                </Step>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                <div className="rounded-lg border border-line bg-white p-4">
                    <p className="text-sm font-semibold text-ink">How it will appear</p>
                    <div className="mt-3 flex justify-center">
                        <AdCreative src={picked?.url ?? draft?.media?.url ?? null} spec={spec} headline={headline} ctaLabel={ctaLabel} targetUrl={targetUrl} />
                    </div>
                </div>
                <QuoteBlock quote={quote} fromServer={quote?.fromServer} />
                {showProblems && (
                    <ul role="alert" className="space-y-1 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning" data-testid="form-problems">
                        {problems.map((problem) => (
                            <li key={problem}>{problem}</li>
                        ))}
                    </ul>
                )}
                <AgeGate gate={age} />
                {error && (
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => void save(true)} disabled={busy !== null || slots.length === 0 || age.blocked} className={btnPrimary}>
                        {busy === "submit" ? "Submitting…" : draft?.status === "REJECTED" ? "Resubmit and pay" : "Submit and pay"}
                    </button>
                    <button type="button" onClick={() => void save(false)} disabled={busy !== null || slots.length === 0} className={btnOutline}>
                        {busy === "save" ? "Saving…" : "Save draft"}
                    </button>
                </div>
                <p className="text-xs text-dim">Submitting holds your days for 60 minutes while you pay. ADX then checks the artwork; if it is turned down, the full amount comes back to your wallet.</p>
            </aside>
        </div>
    );
}

function Step({ n, title, line, children }: { n: number; title: string; line: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-line bg-white p-6" aria-labelledby={`ad-step-${n}`}>
            <div className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white" aria-hidden>
                    {n}
                </span>
                <div>
                    <h2 id={`ad-step-${n}`} className="text-base font-semibold text-ink">
                        {title}
                    </h2>
                    <p className="mt-0.5 text-sm text-dim">{line}</p>
                </div>
            </div>
            <div className="mt-5">{children}</div>
        </section>
    );
}
