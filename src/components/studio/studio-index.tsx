"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Plus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { messageOf } from "@/lib/api-client";
import { useStudioAuth } from "@/lib/studio-auth";
import { cn } from "@/lib/utils";
import { APP_SURFACES, PAGE_KEY_PATTERN, PATH_PATTERN, SYSTEM_PAGE_SEEDS, forbiddenMessage, isAppSurface, keyFromTitle, studioService, surfaceLabel, type NewPageInput, type PageChannel, type SitePageRow, type SurfaceSummary } from "@/services/studio";
import { StudioShell } from "./studio-shell";

/**
 * ST-1: `/studio` — every page Studio lays out. The website's own pages
 * (SYSTEM), the pages made here (CUSTOM), the four app homes, and the way
 * to the forms builder in the console. "New page" makes a CUSTOM page
 * from a template and opens it.
 */

const when = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

function VersionPills({ live, draft, archived }: { live: { number: number; publishedAt: string | null } | null; draft: { number: number; updatedAt: string } | null; archived?: string | null }) {
    return (
        <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {archived ? <span className="rounded-full bg-paper px-2 py-0.5 text-dim">Archived</span> : null}
            {live ? <span className="rounded-full bg-success-soft px-2 py-0.5 text-success">Live v{live.number}{live.publishedAt ? ` · ${when(live.publishedAt)}` : ""}</span> : <span className="rounded-full bg-paper px-2 py-0.5 text-dim">Default order</span>}
            {draft ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">Draft v{draft.number}</span> : null}
        </span>
    );
}

function Row({ href, title, detail, pills, icon }: { href: string; title: string; detail: string; pills: React.ReactNode; icon?: React.ReactNode }) {
    return (
        <li>
            <Link href={href} className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 hover:border-ink" data-testid="studio-page-row">
                {icon}
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{title}</span>
                    <span className="block truncate font-mono text-xs text-dim">{detail}</span>
                </span>
                {pills}
                <span className="text-xs font-medium text-brand">Open</span>
            </Link>
        </li>
    );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-base font-semibold text-ink">{title}</h2>
                {hint && <p className="text-xs text-dim">{hint}</p>}
            </div>
            {children}
        </section>
    );
}

export function StudioIndex() {
    const { can, consoleUrl } = useStudioAuth();
    const [pages, setPages] = React.useState<{ rows: SitePageRow[] | null; error: string | null }>({ rows: null, error: null });
    const [layouts, setLayouts] = React.useState<{ rows: SurfaceSummary[] | null; error: string | null }>({ rows: null, error: null });
    const [newOpen, setNewOpen] = React.useState(false);
    const [nonce, setNonce] = React.useState(0);

    React.useEffect(() => {
        let active = true;
        void Promise.allSettled([studioService.pages.list(), studioService.layouts.list()]).then(([pagesAnswer, layoutsAnswer]) => {
            if (!active) return;
            setPages(pagesAnswer.status === "fulfilled" ? { rows: pagesAnswer.value, error: null } : { rows: [], error: forbiddenMessage(pagesAnswer.reason, "The pages could not be read.") });
            setLayouts(layoutsAnswer.status === "fulfilled" ? { rows: layoutsAnswer.value, error: null } : { rows: [], error: forbiddenMessage(layoutsAnswer.reason, "The app homes could not be read.") });
        });
        return () => {
            active = false;
        };
    }, [nonce]);

    const loading = pages.rows === null || layouts.rows === null;
    const system = (pages.rows ?? []).filter((row) => row.kind === "SYSTEM" && !row.archivedAt);
    const custom = (pages.rows ?? []).filter((row) => row.kind === "CUSTOM").sort((a, b) => (a.archivedAt ? 1 : 0) - (b.archivedAt ? 1 : 0));
    const appHomes = (layouts.rows ?? []).filter((row) => isAppSurface(row.surface));
    const surfaceLiveBySurface = new Map((layouts.rows ?? []).map((row) => [row.surface, row]));

    return (
        <StudioShell crumb="Pages" actions={can("content.edit") ? <Button size="sm" onClick={() => setNewOpen(true)} data-testid="studio-new-page"><Plus className="mr-1 size-4" /> New page</Button> : null}>
            <div className="mx-auto w-full max-w-[960px] space-y-8 px-5 py-8">
                <div>
                    <h1 className="text-[26px] font-semibold tracking-tight text-ink">Pages</h1>
                    <p className="text-sm text-dim">Lay out the website's pages and the app homes, make new pages, and give them addresses. Everything saves as a draft until it is published.</p>
                </div>

                {loading ? (
                    <p className="text-sm text-dim">Loading…</p>
                ) : (
                    <>
                        <Section title="Website pages" hint="The site's own pages — their sections in order, with whatever ADX places around them.">
                            {pages.error && <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">{pages.error} The nine website pages below are Studio's own list; their versions still open.</p>}
                            <ul className="space-y-2">
                                {(system.length ? system : SYSTEM_PAGE_SEEDS.map((seed) => ({ key: seed.key, title: seed.title, path: seed.path, surface: seed.surface }))).map((row) => {
                                    const summary = "surface" in row && row.surface ? surfaceLiveBySurface.get(row.surface) : undefined;
                                    const live = "live" in row ? row.live : (summary?.live ?? null);
                                    const draft = "draft" in row ? row.draft : (summary?.draft ?? null);
                                    return <Row key={row.key} href={`/studio/pages/${encodeURIComponent(row.key)}`} title={row.title} detail={row.path} pills={<VersionPills live={live} draft={draft} />} icon={<FileText className="size-4 shrink-0 text-dim" aria-hidden />} />;
                                })}
                            </ul>
                        </Section>

                        <Section title="Custom pages" hint="Pages made here, at addresses of your own.">
                            {custom.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-line bg-white px-4 py-6 text-center text-sm text-dim">No custom pages yet. {can("content.edit") ? "Make one with New page." : ""}</p>
                            ) : (
                                <ul className="space-y-2">
                                    {custom.map((row) => (
                                        <Row key={row.key} href={`/studio/pages/${encodeURIComponent(row.key)}`} title={row.title} detail={`${row.path} · ${row.channels.map((channel) => (channel === "APPS" ? "apps" : "website")).join(" + ")}`} pills={<VersionPills live={row.live} draft={row.draft} archived={row.archivedAt} />} icon={<FileText className={cn("size-4 shrink-0", row.archivedAt ? "text-dim/50" : "text-dim")} aria-hidden />} />
                                    ))}
                                </ul>
                            )}
                        </Section>

                        <Section title="App homes" hint="The four home screens, in a phone frame. Check on a phone after publishing.">
                            {layouts.error && <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">{layouts.error}</p>}
                            <ul className="space-y-2">
                                {(appHomes.length ? appHomes : APP_SURFACES.map((surface) => ({ surface, label: surfaceLabel(surface), live: null, draft: null }))).map((row) => (
                                    <Row key={row.surface} href={`/studio/app/${row.surface.toLowerCase().replace(/_/g, "-")}`} title={row.label} detail={row.surface} pills={<VersionPills live={row.live} draft={row.draft} />} icon={<Smartphone className="size-4 shrink-0 text-dim" aria-hidden />} />
                                ))}
                            </ul>
                        </Section>

                        <Section title="Forms">
                            <a href={`${consoleUrl}/content/forms`} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 hover:border-ink">
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-ink">Forms are built in the console</span>
                                    <span className="block text-xs text-dim">Content › Forms — then place one on a page with the Form block.</span>
                                </span>
                                <ExternalLink className="size-4 text-dim" aria-hidden />
                            </a>
                        </Section>
                    </>
                )}
            </div>
            <NewPageDialog open={newOpen} onOpenChange={setNewOpen} existing={(pages.rows ?? []).map((row) => row.key)} onCreated={() => setNonce((n) => n + 1)} />
        </StudioShell>
    );
}

const TEMPLATES: { value: NonNullable<NewPageInput["template"]>; label: string; hint: string }[] = [
    { value: "blank", label: "Blank", hint: "Start from nothing." },
    { value: "event", label: "Event", hint: "Hero, columns, a grid of spaces, questions, a call to action." },
    { value: "landing", label: "Landing", hint: "Hero, numbers, steps, a call to action." },
];

export function NewPageDialog({ open, onOpenChange, existing, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; existing: string[]; onCreated: () => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" data-testid="new-page-dialog">
                <DialogHeader>
                    <DialogTitle>New page</DialogTitle>
                    <DialogDescription>A custom page at its own address. It opens in Studio as a draft; nothing is public until it is published.</DialogDescription>
                </DialogHeader>
                {open && <NewPageForm onOpenChange={onOpenChange} existing={existing} onCreated={onCreated} />}
            </DialogContent>
        </Dialog>
    );
}

/** Mounted only while the dialog is open, so every opening starts blank. */
function NewPageForm({ onOpenChange, existing, onCreated }: { onOpenChange: (open: boolean) => void; existing: string[]; onCreated: () => void }) {
    const router = useRouter();
    const [title, setTitle] = React.useState("");
    const [key, setKey] = React.useState("");
    const [keyTouched, setKeyTouched] = React.useState(false);
    const [path, setPath] = React.useState("");
    const [pathTouched, setPathTouched] = React.useState(false);
    const [template, setTemplate] = React.useState<NonNullable<NewPageInput["template"]>>("blank");
    const [channels, setChannels] = React.useState<PageChannel[]>(["WEBSITE"]);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const suggestedKey = keyFromTitle(title);
    const effectiveKey = keyTouched ? key : suggestedKey;
    const effectivePath = pathTouched ? path : effectiveKey ? `/${effectiveKey}` : "";
    const keyOk = PAGE_KEY_PATTERN.test(effectiveKey) && effectiveKey.length <= 64;
    const keyTaken = existing.includes(effectiveKey) || SYSTEM_PAGE_SEEDS.some((seed) => seed.key === effectiveKey);
    const pathOk = PATH_PATTERN.test(effectivePath) && effectivePath !== "/";

    async function create() {
        if (!title.trim() || !keyOk || keyTaken || !pathOk || channels.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            await studioService.pages.create({ key: effectiveKey, title: title.trim(), path: effectivePath, channels, template });
            onCreated();
            onOpenChange(false);
            router.push(`/studio/pages/${encodeURIComponent(effectiveKey)}`);
        } catch (caught) {
            setError(forbiddenMessage(caught, messageOf(caught, "The page was not made.")));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
                <div className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="new-page-title">Title</Label>
                        <Input id="new-page-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Diwali offers" autoFocus />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label htmlFor="new-page-key">Key</Label>
                            <Input
                                id="new-page-key"
                                value={effectiveKey}
                                onChange={(event) => {
                                    setKeyTouched(true);
                                    setKey(keyFromTitle(event.target.value));
                                }}
                                className="font-mono"
                                placeholder="diwali-offers"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="new-page-path">Address</Label>
                            <Input
                                id="new-page-path"
                                value={effectivePath}
                                onChange={(event) => {
                                    setPathTouched(true);
                                    setPath(event.target.value.trim());
                                }}
                                className="font-mono"
                                placeholder="/diwali-offers"
                            />
                        </div>
                    </div>
                    <p className="text-[11px] text-dim">
                        {effectiveKey && !keyOk ? "A key is lowercase words joined by hyphens. " : keyTaken ? "That key is taken. " : ""}
                        {effectivePath && !pathOk ? "An address is /words-with-hyphens, up to five segments." : "The key names the page to blocks that link to it; the address is where visitors find it."}
                    </p>
                    <div className="space-y-1">
                        <Label>Start from</Label>
                        <Select value={template} onValueChange={(next) => setTemplate(next as NonNullable<NewPageInput["template"]>)}>
                            <SelectTrigger aria-label="Template">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TEMPLATES.map((row) => (
                                    <SelectItem key={row.value} value={row.value}>
                                        {row.label} — {row.hint}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <fieldset className="space-y-1.5">
                        <legend className="text-sm font-medium text-ink">Where it shows</legend>
                        {(["WEBSITE", "APPS"] as PageChannel[]).map((channel) => (
                            <label key={channel} className="flex items-center gap-2 text-sm text-ink">
                                <input type="checkbox" className="size-4 accent-brand" checked={channels.includes(channel)} onChange={() => setChannels(channels.includes(channel) ? channels.filter((item) => item !== channel) : [...channels, channel])} />
                                {channel === "WEBSITE" ? "Website" : "The apps"}
                            </label>
                        ))}
                    </fieldset>
                    {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void create()} disabled={busy || !title.trim() || !keyOk || keyTaken || !pathOk || channels.length === 0} data-testid="new-page-create">
                        {busy ? "Making…" : "Make the page"}
                    </Button>
                </DialogFooter>
        </>
    );
}
