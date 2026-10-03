"use client";

import * as React from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { apiConfig } from "@/lib/api-config";
import { cn } from "@/lib/utils";
import { btnOutline, btnPrimary, btnSmall, inputClass } from "@/components/advertiser/bits";
import {
    blocksFrom,
    campaignsService,
    draftFrom,
    draftProblems,
    GALLERY_MAX_IMAGES,
    landingBlock,
    landingPageError,
    landingPageOrNull,
    landingPageUrl,
    type CtaAction,
    type LandingBlock,
    type LandingDraft,
    type LandingPage,
} from "@/services/campaigns";

/**
 * The campaign's ADX page, read once: the page, or null when none has been
 * drafted (404); and the draft door (`POST …/landing-page/generate`).
 */
export function useLandingPage(campaignId: string, enabled = true) {
    const [state, setState] = React.useState<{ key: string; page: LandingPage | null; loading: boolean; error: string | null }>({ key: "", page: null, loading: enabled, error: null });
    const [drafting, setDrafting] = React.useState(false);
    const [draftError, setDraftError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        landingPageOrNull(campaignId)
            .then((page) => {
                if (!cancelled) setState({ key: campaignId, page, loading: false, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setState({ key: campaignId, page: null, loading: false, error: landingPageError(caught, "Could not read the page.") });
            });
        return () => {
            cancelled = true;
        };
    }, [campaignId, enabled]);

    const current = state.key === campaignId ? state : { key: campaignId, page: null, loading: enabled, error: null };
    const setPage = React.useCallback((page: LandingPage) => setState({ key: campaignId, page, loading: false, error: null }), [campaignId]);

    const draft = React.useCallback(async () => {
        setDrafting(true);
        setDraftError(null);
        try {
            setPage(await campaignsService.generateLandingPage(campaignId));
        } catch (caught) {
            setDraftError(landingPageError(caught, "Could not draft the page. Check your connection."));
        } finally {
            setDrafting(false);
        }
    }, [campaignId, setPage]);

    return { page: current.page, loading: current.loading, error: current.error, setPage, draft, drafting, draftError };
}

const CTA_ACTIONS: { id: CtaAction; title: string }[] = [
    { id: "LINK", title: "Open a link" },
    { id: "CALL", title: "Call" },
    { id: "WHATSAPP", title: "WhatsApp" },
    { id: "FORM", title: "Enquiry form" },
];

/**
 * Lot E (Q7/Q106): the page an ADX QR lands on when the advertiser has no
 * website of their own — drafted from the brief, edited here, published at
 * `/p/:slug`. The five blocks the backend renders and nothing more, sent
 * back whole on every save (an edit is the next version of the page). The
 * preview beside the form is the blocks drawn the way the public page lays
 * them out; once published, the real page opens in a new tab.
 *
 * "Call" is the contact block's phone (only http(s) links survive the
 * schema); gallery frames stay empty here, because an upload is private to
 * the account and would be a broken image on a stranger's phone.
 */
export function LandingPageEditor({ campaignId, page, advertiserPhone, onChanged }: { campaignId: string; page: LandingPage; advertiserPhone: string | null; onChanged: (page: LandingPage) => void }) {
    const [draft, setDraft] = React.useState<LandingDraft>(() => draftFrom(page.blocks, advertiserPhone));
    const [version, setVersion] = React.useState(page.version);
    const [dirty, setDirty] = React.useState(false);
    const [busy, setBusy] = React.useState<"SAVE" | "PUBLISH" | "REGENERATE" | null>(null);
    const [confirmRedraft, setConfirmRedraft] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    /* A redraft (a new version from the server) replaces the words on screen; our own edits do not. */
    if (page.version !== version) {
        setVersion(page.version);
        setDraft(draftFrom(page.blocks, advertiserPhone));
        setDirty(false);
    }

    const set = <K extends keyof LandingDraft>(key: K, value: LandingDraft[K]) => {
        setDraft((current) => ({ ...current, [key]: value }));
        setDirty(true);
    };

    const published = page.status === "PUBLISHED";
    const url = landingPageUrl(apiConfig.baseUrl, page);
    const problems = draftProblems(draft);
    const blocks = blocksFrom(draft, advertiserPhone);

    const save = async (): Promise<LandingPage | null> => {
        if (problems.length > 0) {
            setError(problems[0]!);
            return null;
        }
        setError(null);
        try {
            const next = await campaignsService.patchLandingPage(campaignId, { blocks });
            onChanged(next);
            setVersion(next.version);
            setDirty(false);
            return next;
        } catch (caught) {
            setError(landingPageError(caught, "Could not save the page. Check your connection."));
            return null;
        }
    };

    const onSave = async () => {
        setBusy("SAVE");
        try {
            if (await save()) toast.success(published ? "Saved — the live page shows it now." : "Page saved.");
        } finally {
            setBusy(null);
        }
    };

    const onPublish = async () => {
        setBusy("PUBLISH");
        try {
            if (dirty && !(await save())) return;
            const live = await campaignsService.publishLandingPage(campaignId);
            onChanged({ ...page, ...live });
            toast.success("Your page is live.");
        } catch (caught) {
            setError(landingPageError(caught, "Could not publish the page. Check your connection."));
        } finally {
            setBusy(null);
        }
    };

    const onRedraft = async () => {
        setConfirmRedraft(false);
        setBusy("REGENERATE");
        setError(null);
        try {
            onChanged(await campaignsService.generateLandingPage(campaignId));
        } catch (caught) {
            setError(landingPageError(caught, "Could not draft the page again. Check your connection."));
        } finally {
            setBusy(null);
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied.");
        } catch {
            toast.message(url);
        }
    };

    const imagesLeft = Math.max(GALLERY_MAX_IMAGES - draft.images.length, 0);
    const frames = Math.min(draft.placeholders, imagesLeft);

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" data-testid="landing-page-editor">
            <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Your ADX page</p>
                    <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium", published ? "bg-success-soft text-success" : "bg-ground text-ink")}>{published ? "Published" : "Draft"}</span>
                </div>

                {published && (
                    <Card title="Your page is live">
                        <p className="break-all font-mono text-sm text-ink">{url}</p>
                        <p className="mt-2 text-xs text-dim">Every code without a destination of its own lands here. Edits go live the moment you save them; a printed code keeps pointing at this address.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => void copy()} className={btnSmall}>
                                <Copy className="mr-1.5 size-3.5" aria-hidden />
                                Copy the link
                            </button>
                            <a href={url} target="_blank" rel="noreferrer" className={btnSmall}>
                                <ExternalLink className="mr-1.5 size-3.5" aria-hidden />
                                Open the live page
                            </a>
                        </div>
                    </Card>
                )}

                <Card title="Hero">
                    <div className="grid gap-3">
                        <Input label="Headline" value={draft.headline} onChange={(v) => set("headline", v)} maxLength={120} />
                        <Input label="Subline" value={draft.subheadline} onChange={(v) => set("subheadline", v)} maxLength={240} />
                    </div>
                </Card>

                <Card title="The offer" line="Optional — leave the title and details empty and the page has no offer block.">
                    <div className="grid gap-3">
                        <Input label="Title" value={draft.offerTitle} onChange={(v) => set("offerTitle", v)} maxLength={120} />
                        <Area label="Details" value={draft.offerBody} onChange={(v) => set("offerBody", v)} maxLength={800} />
                        <Input label="Highlight" value={draft.offerHighlight} onChange={(v) => set("offerHighlight", v)} placeholder="20% off this month" maxLength={80} />
                    </div>
                </Card>

                <Card title="The button">
                    <div className="grid gap-3">
                        <Input label="Label" value={draft.ctaLabel} onChange={(v) => set("ctaLabel", v)} maxLength={60} />
                        <div>
                            <p className="text-sm font-medium text-ink">When pressed</p>
                            <div role="radiogroup" aria-label="When pressed" className="mt-2 flex flex-wrap gap-2">
                                {CTA_ACTIONS.map((action) => (
                                    <button key={action.id} type="button" role="radio" aria-checked={draft.ctaAction === action.id} onClick={() => set("ctaAction", action.id)} className={cn("h-9 rounded-full border px-4 text-sm font-medium", draft.ctaAction === action.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink")}>
                                        {action.title}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {draft.ctaAction === "LINK" && <Input label="Link (starts with https://)" value={draft.ctaHref} onChange={(v) => set("ctaHref", v)} placeholder="https://" />}
                        {(draft.ctaAction === "CALL" || draft.ctaAction === "WHATSAPP") && <Input label={draft.ctaAction === "CALL" ? "Number to call" : "WhatsApp number"} value={draft.phone} onChange={(v) => set("phone", v)} placeholder="98450 12345" maxLength={20} />}
                        {draft.ctaAction === "CALL" && <p className="text-xs text-dim">The page shows the number as a tap-to-call link; the button opens the form beneath it.</p>}
                        {draft.ctaAction === "FORM" && <p className="text-xs text-dim">The button scrolls to the name-and-phone form below.</p>}
                    </div>
                </Card>

                <Card title="Contact">
                    <div className="grid gap-3 md:grid-cols-2">
                        {draft.ctaAction !== "CALL" && draft.ctaAction !== "WHATSAPP" ? <Input label="Phone" value={draft.phone} onChange={(v) => set("phone", v)} maxLength={20} /> : null}
                        <Input label="Email" value={draft.email} onChange={(v) => set("email", v)} maxLength={160} />
                        <Input label="Address" value={draft.address} onChange={(v) => set("address", v)} maxLength={240} />
                        <Input label="Hours" value={draft.hours} onChange={(v) => set("hours", v)} placeholder="Mon–Sat, 9am to 9pm" maxLength={120} />
                        <div className="md:col-span-2">
                            <Input label="A line under the details" value={draft.note} onChange={(v) => set("note", v)} maxLength={240} />
                        </div>
                    </div>
                    <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
                        <input type="checkbox" checked={draft.formEnabled} onChange={(e) => set("formEnabled", e.target.checked)} className="mt-0.5 size-4 accent-[#bd2020]" />
                        <span>
                            <span className="block font-medium text-ink">Show the enquiry form</span>
                            <span className="block text-xs text-dim">Name and phone. ADX counts each submission; it does not keep what was typed.</span>
                        </span>
                    </label>
                </Card>

                <Card title="Gallery" line={imagesLeft === 0 ? "The gallery is full." : `Room for ${imagesLeft} image${imagesLeft === 1 ? "" : "s"}.`}>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {draft.images.map((image) => (
                            <div key={image.url} className="flex aspect-square items-center justify-center rounded-md border border-line bg-white p-1 text-center text-[10px] text-dim">
                                {image.alt ?? image.url}
                            </div>
                        ))}
                        {Array.from({ length: frames }, (_, index) => (
                            <div key={`frame-${index}`} className="flex aspect-square items-center justify-center rounded-md border border-dashed border-line bg-ground text-[10px] text-dim">
                                Image {draft.images.length + index + 1}
                            </div>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-dim">A picture on the page needs a public address a stranger&apos;s phone can open. What you upload to ADX is private to your account, so these frames stay empty until ADX places your approved artwork on the page with you.</p>
                </Card>

                {error && <p role="alert" className="rounded-md border border-[#f3c1c1] bg-[#fdf2f2] px-3 py-2 text-sm text-[#b42318]">{error}</p>}
                {!error && dirty && problems.length > 0 && <p className="text-sm text-dim">{problems[0]}</p>}

                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void onSave()} disabled={!dirty || busy !== null} className={btnOutline}>
                        {busy === "SAVE" ? "Saving…" : dirty ? "Save page" : "Saved"}
                    </button>
                    {!published && (
                        <button type="button" onClick={() => void onPublish()} disabled={busy !== null || problems.length > 0} className={btnPrimary}>
                            {busy === "PUBLISH" ? "Publishing…" : "Publish page"}
                        </button>
                    )}
                    {!published && !confirmRedraft && (
                        <button type="button" onClick={() => setConfirmRedraft(true)} disabled={busy !== null} className="ml-auto text-sm font-medium text-brand underline underline-offset-2 disabled:opacity-50">
                            {busy === "REGENERATE" ? "Drafting again…" : "Draft this page again"}
                        </button>
                    )}
                </div>
                {confirmRedraft && (
                    <div className="rounded-lg border border-[#f3c1c1] bg-[#fdf2f2] p-4">
                        <p className="text-sm font-semibold text-ink">Draft this page again?</p>
                        <p className="mt-1 text-sm text-ink">Replaces your edits with a fresh draft from the brief. Drafts per campaign are limited.</p>
                        <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => void onRedraft()} className={btnPrimary}>
                                Draft again
                            </button>
                            <button type="button" onClick={() => setConfirmRedraft(false)} className={btnOutline}>
                                Keep my edits
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="xl:sticky xl:top-4 xl:self-start">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Preview</p>
                <LandingPreview blocks={blocks} theme={page.theme} className="mt-2" />
                <p className="mt-2 text-xs text-dim">Drawn from your edits as you type. The published page adds ADX&apos;s tracking and the images you place.</p>
            </div>
        </div>
    );
}

/** The blocks drawn the way the public page lays them out, in a phone-width frame. */
export function LandingPreview({ blocks, theme, className }: { blocks: readonly LandingBlock[]; theme: LandingPage["theme"]; className?: string }) {
    const primary = theme?.primaryColor ?? "#141518";
    const accent = theme?.accentColor ?? "#bd2020";
    const hero = landingBlock(blocks, "hero");
    const offer = landingBlock(blocks, "offer");
    const cta = landingBlock(blocks, "cta");
    const contact = landingBlock(blocks, "contact");
    const gallery = landingBlock(blocks, "gallery");
    return (
        <div className={cn("overflow-hidden rounded-xl border border-line bg-white shadow-card", theme?.font === "serif" && "font-serif", className)} data-testid="landing-preview">
            <div className="space-y-4 p-4">
                {hero && (
                    <div className="rounded-lg p-4" style={{ background: primary }}>
                        <p className="text-lg font-semibold leading-snug text-white">{hero.headline || "Your headline"}</p>
                        {hero.subheadline && <p className="mt-1 text-sm text-white/85">{hero.subheadline}</p>}
                    </div>
                )}
                {offer && (
                    <div>
                        {offer.highlight && (
                            <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold text-white" style={{ background: accent }}>
                                {offer.highlight}
                            </span>
                        )}
                        <p className="mt-2 text-base font-semibold text-ink">{offer.title}</p>
                        <p className="mt-1 whitespace-pre-line text-sm text-dim">{offer.body}</p>
                    </div>
                )}
                {cta && (
                    <div className="rounded-md py-2.5 text-center text-sm font-semibold text-white" style={{ background: accent }}>
                        {cta.label}
                    </div>
                )}
                {gallery && (gallery.images.length > 0 || (gallery.placeholders ?? 0) > 0) && (
                    <div className="grid grid-cols-3 gap-1.5">
                        {gallery.images.map((image) => (
                            <div key={image.url} className="aspect-square rounded bg-ground" />
                        ))}
                        {Array.from({ length: gallery.placeholders ?? 0 }, (_, index) => (
                            <div key={index} className="aspect-square rounded border border-dashed border-line bg-ground" />
                        ))}
                    </div>
                )}
                {contact && (
                    <div className="space-y-1 text-sm">
                        <p className="text-base font-semibold text-ink">Get in touch</p>
                        {contact.phone && (
                            <p className="underline" style={{ color: accent }}>
                                {contact.phone}
                            </p>
                        )}
                        {contact.email && (
                            <p className="underline" style={{ color: accent }}>
                                {contact.email}
                            </p>
                        )}
                        {contact.address && <p className="text-dim">{contact.address}</p>}
                        {contact.hours && <p className="text-dim">{contact.hours}</p>}
                        {contact.note && <p className="text-dim">{contact.note}</p>}
                        {contact.formEnabled !== false && (
                            <div className="space-y-1.5 pt-2">
                                <div className="rounded-md border border-line bg-ground px-3 py-2 text-dim">Your name</div>
                                <div className="rounded-md border border-line bg-ground px-3 py-2 text-dim">Phone number</div>
                                <div className="rounded-md py-2 text-center font-semibold text-white" style={{ background: accent }}>
                                    Send
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Card({ title, line, children }: { title: string; line?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-line bg-white p-5">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {line && <p className="mt-1 text-xs text-dim">{line}</p>}
            <div className="mt-3">{children}</div>
        </section>
    );
}

function Input({ label, value, onChange, placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number }) {
    const id = React.useId();
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} className={cn(inputClass, "mt-1.5")} />
        </div>
    );
}

function Area({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number }) {
    const id = React.useId();
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} className="mt-1.5 min-h-[88px] w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
        </div>
    );
}

export type LandingPageState = ReturnType<typeof useLandingPage>;

/**
 * The page section as the editor route and the planner's tracking step
 * both draw it: looking for the page, the draft door when there is none,
 * the editor once there is one. The state is the caller's (`useLandingPage`)
 * so a step can read whether a page exists.
 */
export function LandingPageBody({ lp, campaignId, advertiserPhone, autoDraft = false }: { lp: LandingPageState; campaignId: string; advertiserPhone: string | null; autoDraft?: boolean }) {
    const { page, loading, error, setPage, draft, drafting, draftError } = lp;
    const asked = React.useRef(false);

    /* The planner's "Use an ADX page" drafts at once, as the app does on choosing it. */
    React.useEffect(() => {
        if (!autoDraft || loading || page || error || asked.current) return;
        asked.current = true;
        void draft();
    }, [autoDraft, loading, page, error, draft]);

    if (loading) return <p className="text-sm text-dim">Looking for your page…</p>;
    if (error) return <p className="rounded-md bg-ground px-4 py-3 text-sm text-dim">{error}</p>;
    if (!page) {
        return (
            <div className="rounded-lg border border-line bg-white p-5">
                <p className="text-base font-semibold text-ink">{drafting ? "Drafting your page from the brief…" : "Draft a page from your brief"}</p>
                <p className="mt-1 text-sm text-dim">ADX writes a headline, the offer, a button and your contact details from what the brief says. You edit it here, then publish it for the codes to land on.</p>
                {draftError && <p className="mt-3 text-sm text-[#b42318]">{draftError}</p>}
                <button type="button" onClick={() => void draft()} disabled={drafting} className={cn(btnPrimary, "mt-4")}>
                    {drafting ? "Drafting…" : draftError ? "Try drafting again" : "Draft my page"}
                </button>
            </div>
        );
    }
    return <LandingPageEditor campaignId={campaignId} page={page} advertiserPhone={advertiserPhone} onChanged={setPage} />;
}

/** The section with its own read — the editor route's. */
export function LandingPageSection({ campaignId, advertiserPhone }: { campaignId: string; advertiserPhone: string | null }) {
    const lp = useLandingPage(campaignId);
    return <LandingPageBody lp={lp} campaignId={campaignId} advertiserPhone={advertiserPhone} />;
}
