"use client";

import * as React from "react";
import Link from "next/link";
import { Puck, usePuck, type Data } from "@puckeditor/core";
import { ArrowLeft, ExternalLink, History, Monitor, Redo2, Settings2, Smartphone, Tablet, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, messageOf } from "@/lib/api-client";
import { useStudioAuth } from "@/lib/studio-auth";
import { cn } from "@/lib/utils";
import {
    SIDE_LABEL,
    forbiddenMessage,
    fromPuckData,
    hasPathParam,
    issuesByBlock,
    mergeResolved,
    pinnedFor,
    previewPathFor,
    previewUrl,
    sameBlocks,
    seedForKey,
    sidesFor,
    studioService,
    surfaceLabel,
    toPuckData,
    versionApi,
    type BlockIssue,
    type BlockTypeDef,
    type EditorTarget,
    type FormRow,
    type LayoutBlock,
    type MediaAsset,
    type MediaSpec,
    type PageMeta,
    type PreviewToken,
    type PuckPageData,
    type ResolvedBlock,
    type Side,
    type SitePageDetail,
    type SitePageRow,
    type SlotRow,
    type SurfaceDetail,
    type VersionBase,
    type VersionView,
} from "@/services/studio";
import { EnvelopePanel } from "./envelope-panel";
import { CityPick } from "./field-widgets";
import { HistorySheet } from "./history-sheet";
import { CanvasStateProvider, StudioLookupsProvider, useRememberingMap, type CanvasState, type StudioLookups } from "./lookups";
import { PageSettingsSheet } from "./page-settings-sheet";
import { PreviewFrame } from "./preview-frame";
import { buildConfig } from "./puck-config";
import { PublishDialog } from "./publish-dialog";
import { StudioShell } from "./studio-shell";

/**
 * ST-1 (27 Sep 2026): the editor.
 *
 * Puck draws the page with the website's own components; every change is
 * saved as the draft 600 ms later (`PUT …/draft`), the draft is then read
 * back resolved (`GET …/preview?version=draft`) so rails show real
 * listings and pictures are pictures; publishing asks for a note and is
 * never automatic. A SYSTEM page's versions live on `/layouts/:surface`,
 * a CUSTOM page's on `/site/pages/:key`; an app home is a surface in a
 * 390-px frame. Ctrl/Cmd+S saves now.
 */

export const AUTOSAVE_MS = 600;

export interface EditorData {
    target: EditorTarget;
    page: SitePageRow | null;
    surface: string | null;
    base: VersionBase;
    label: string;
    live: VersionView | null;
    draft: VersionView | null;
    defaults: LayoutBlock[];
    types: BlockTypeDef[];
    media: MediaAsset[];
    specs: MediaSpec[];
    slots: SlotRow[];
    forms: FormRow[] | null;
    pages: SitePageRow[];
    notes: string[];
}

const rowOfDetail = (detail: SitePageDetail): SitePageRow => ({
    ...detail,
    live: detail.live ? { number: detail.live.number, publishedAt: detail.live.publishedAt } : null,
    draft: detail.draft ? { number: detail.draft.number, updatedAt: detail.draft.updatedAt ?? detail.draft.createdAt } : null,
});

const syntheticRow = (seed: NonNullable<ReturnType<typeof seedForKey>>): SitePageRow => ({
    id: seed.key,
    key: seed.key,
    kind: "SYSTEM",
    title: seed.title,
    path: seed.path,
    internalPath: seed.path,
    surface: seed.surface,
    channels: ["WEBSITE"],
    addressLocked: seed.key === "home",
    archivedAt: null,
    live: null,
    draft: null,
    updatedAt: "",
    redirectCount: 0,
});

const settled = <T,>(answer: PromiseSettledResult<T>, fallback: T): T => (answer.status === "fulfilled" ? answer.value : fallback);

/** Everything the editor needs, read once: the page, its versions, the registry, the lookups (each soft — a missing list degrades a field, never the editor). */
export async function loadEditor(target: EditorTarget): Promise<EditorData> {
    const notes: string[] = [];
    const types = await studioService.layouts.blockTypes();
    let page: SitePageRow | null = null;
    let surface: string | null = null;
    let base: VersionBase;
    let label: string;
    let versions: { live: VersionView | null; draft: VersionView | null; defaults: LayoutBlock[] } | null = null;

    if (target.kind === "surface") {
        surface = target.surface;
        base = { kind: "surface", surface };
        label = surfaceLabel(surface);
    } else {
        let detail: SitePageDetail | null = null;
        try {
            detail = await studioService.pages.get(target.key);
        } catch (caught) {
            const seed = seedForKey(target.key);
            if (!seed || (caught instanceof ApiError && caught.status === 403)) throw caught;
            page = syntheticRow(seed);
            notes.push(`The page record could not be read (${messageOf(caught, "no answer")}) — its title and address are Studio's own until it can.`);
        }
        if (detail) {
            page = rowOfDetail(detail);
            if (detail.kind === "CUSTOM") versions = { live: detail.live, draft: detail.draft, defaults: detail.defaults ?? [] };
        }
        const row = page!;
        if (row.kind === "SYSTEM" && row.surface) {
            surface = row.surface;
            base = { kind: "surface", surface };
        } else {
            base = { kind: "custom", key: target.key };
        }
        label = row.title;
    }

    if (!versions) {
        const detail = (await versionApi(base).get()) as SurfaceDetail;
        versions = { live: detail.live, draft: detail.draft, defaults: detail.defaults ?? [] };
        if (target.kind === "surface" && detail.label) label = detail.label;
    }

    const [media, specs, slots, forms, pages] = await Promise.allSettled([/* ADX pages name ADX's own pictures; ad artwork is resolved into ad slots server-side, so it never needs a thumbnail here. */ studioService.media.list({ limit: 200, owner: "adx" }), studioService.media.specs(), studioService.slots(), studioService.forms(), studioService.pages.list()]);
    if (pages.status === "rejected" && target.kind === "page") notes.push("The pages list could not be read — PAGE targets take a key typed by hand.");

    return {
        target,
        page,
        surface,
        base,
        label,
        live: versions.live,
        draft: versions.draft,
        defaults: versions.defaults,
        types,
        media: settled(media, []),
        specs: settled(specs, []),
        slots: settled(slots, []),
        forms: forms.status === "fulfilled" ? forms.value : null,
        pages: settled(pages, []),
        notes,
    };
}

/* ------------------------------------------------------------------ */
/* The loader                                                          */
/* ------------------------------------------------------------------ */

type LoadResult = { status: "error"; message: string } | { status: "ready"; data: EditorData };
type LoadState = { status: "loading" } | LoadResult;

export function StudioEditor({ target }: { target: EditorTarget }) {
    const kind = target.kind;
    const ident = target.kind === "page" ? target.key : target.surface;
    const [attempt, setAttempt] = React.useState(0);
    const key = `${kind}:${ident}:${attempt}`;
    /* The answer carries the key it answers; one for another page or an earlier attempt reads as "loading". */
    const [answer, setAnswer] = React.useState<{ key: string; result: LoadResult } | null>(null);

    React.useEffect(() => {
        let active = true;
        const wanted: EditorTarget = kind === "page" ? { kind, key: ident } : { kind, surface: ident };
        loadEditor(wanted).then(
            (data) => active && setAnswer({ key, result: { status: "ready", data } }),
            (caught: unknown) => active && setAnswer({ key, result: { status: "error", message: forbiddenMessage(caught, messageOf(caught, "The page could not be read.")) } })
        );
        return () => {
            active = false;
        };
    }, [kind, ident, key]);

    const state: LoadState = answer?.key === key ? answer.result : { status: "loading" };
    const load = () => setAttempt((n) => n + 1);

    if (state.status === "loading") {
        return (
            <StudioShell crumb="Loading…">
                <p className="p-8 text-sm text-dim">Reading the page…</p>
            </StudioShell>
        );
    }
    if (state.status === "error") {
        return (
            <StudioShell crumb="Page">
                <div className="mx-auto max-w-[520px] p-8 text-center">
                    <p className="text-sm text-danger" data-testid="editor-error">
                        {state.message}
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                        <Button variant="outline" onClick={() => load()}>
                            Try again
                        </Button>
                        <Button variant="outline" asChild>
                            <Link href="/studio">All pages</Link>
                        </Button>
                    </div>
                </div>
            </StudioShell>
        );
    }
    return <EditorReady key={key} data={state.data} onReload={() => load()} />;
}

/* ------------------------------------------------------------------ */
/* The editor proper                                                   */
/* ------------------------------------------------------------------ */

type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

const WIDTHS: { width: number; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { width: 1280, label: "Desktop", icon: Monitor },
    { width: 834, label: "Tablet", icon: Tablet },
    { width: 390, label: "Phone", icon: Smartphone },
];

function EditorReady({ data, onReload }: { data: EditorData; onReload: () => void }) {
    const { can } = useStudioAuth();
    const mayEdit = can("content.edit");
    const mayPublish = can("content.approve");
    const mayDiscard = can("content.delete");
    const mayAddress = can("content.addresses");
    const phone = data.target.kind === "surface";
    const custom = data.page?.kind === "CUSTOM";
    const pinned = React.useMemo(() => pinnedFor(data.surface), [data.surface]);
    const api = React.useMemo(() => versionApi(data.base), [data.base]);

    /* The blocks as Puck will hand them back — normalised once, so opening the editor never saves a draft by itself. */
    const initialBlocks = React.useMemo(() => fromPuckData(toPuckData(data.draft?.blocks ?? data.live?.blocks ?? data.defaults), pinned), [data.draft, data.live, data.defaults, pinned]);
    const initialData = React.useMemo(() => toPuckData(initialBlocks) as unknown as Data, [initialBlocks]);

    const [blocks, setBlocks] = React.useState<LayoutBlock[]>(initialBlocks);
    const blocksRef = React.useRef(initialBlocks);
    const [meta, setMetaState] = React.useState<PageMeta>(data.draft?.meta ?? data.live?.meta ?? {});
    const metaRef = React.useRef(meta);
    const [draft, setDraft] = React.useState(data.draft);
    const draftRef = React.useRef(data.draft);
    const [live, setLive] = React.useState(data.live);
    const [page, setPage] = React.useState(data.page);
    const [saveState, setSaveState] = React.useState<SaveState>("clean");
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const [locked, setLocked] = React.useState(!mayEdit);
    const [issues, setIssues] = React.useState<Map<string, BlockIssue[]>>(new Map());
    const [resolved, setResolved] = React.useState<ResolvedBlock[] | null>(null);
    const [resolvedOnce, setResolvedOnce] = React.useState(false);
    const [side, setSide] = React.useState<Side>(sidesFor(data.surface)[0]!);
    const [cityIds, setCityIds] = React.useState<string[]>([]);
    const [mode, setMode] = React.useState<"edit" | "preview">("edit");
    const [width, setWidth] = React.useState<number>(phone ? 390 : 1280);
    const [token, setToken] = React.useState<PreviewToken | null>(null);
    const [previewStamp, setPreviewStamp] = React.useState(0);
    const [publishOpen, setPublishOpen] = React.useState(false);
    const [note, setNote] = React.useState(data.draft?.changeNote ?? "");
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [discardOpen, setDiscardOpen] = React.useState(false);
    const [busy, setBusy] = React.useState<null | "publish" | "discard">(null);

    const pendingRef = React.useRef(false);
    const savingRef = React.useRef(false);
    const timerRef = React.useRef<number | null>(null);
    const flushRef = React.useRef<() => Promise<boolean>>(async () => true);
    const cityId = cityIds[0] ?? null;

    /* ---- resolution: the draft (or the live version, or the defaults) as this viewer would get it ---- */
    const fetchResolved = React.useCallback(async () => {
        const version: "draft" | number = draftRef.current ? "draft" : live ? live.number : 0;
        if (version === 0 && data.base.kind === "custom") {
            setResolved([]);
            setResolvedOnce(true);
            return;
        }
        try {
            const answer = await api.preview({ version, side, cityId });
            setResolved(Array.isArray(answer.blocks) ? answer.blocks : []);
            setResolvedOnce(true);
        } catch {
            /* The canvas keeps drawing raw props; the next save asks again. */
        }
    }, [api, live, side, cityId, data.base.kind]);

    React.useEffect(() => {
        void fetchResolved();
    }, [fetchResolved]);

    /* ---- autosave ---- */
    const schedule = React.useCallback(() => {
        pendingRef.current = true;
        setSaveState("dirty");
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            void flushRef.current();
        }, AUTOSAVE_MS);
    }, []);

    const flush = React.useCallback(async (): Promise<boolean> => {
        if (savingRef.current) return false;
        if (!pendingRef.current) return true;
        pendingRef.current = false;
        savingRef.current = true;
        setSaveState("saving");
        const snapshot = blocksRef.current;
        try {
            const view = await api.saveDraft({ blocks: snapshot, meta: metaRef.current });
            draftRef.current = view;
            setDraft(view);
            setIssues(new Map());
            setSaveError(null);
            setSaveState("saved");
            setPreviewStamp((n) => n + 1);
            void fetchResolved();
            return true;
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 400) {
                setIssues(issuesByBlock(caught.details));
                setSaveError(caught.message);
            } else if (caught instanceof ApiError && caught.status === 403) {
                setSaveError(forbiddenMessage(caught, "Saving was refused."));
                setLocked(true);
            } else {
                setSaveError(messageOf(caught, "The draft did not save."));
            }
            setSaveState("error");
            return false;
        } finally {
            savingRef.current = false;
            if (pendingRef.current) schedule();
        }
    }, [api, fetchResolved, schedule]);

    React.useEffect(() => {
        flushRef.current = flush;
    }, [flush]);

    /** Waits for a save in flight, then saves whatever is pending. */
    const settle = React.useCallback(async (): Promise<boolean> => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        while (savingRef.current) await new Promise((resolve) => window.setTimeout(resolve, 80));
        return flushRef.current();
    }, []);

    const onChange = React.useCallback(
        (next: Data) => {
            const blocksNext = fromPuckData(next as unknown as PuckPageData, pinned);
            if (sameBlocks(blocksNext, blocksRef.current)) return;
            blocksRef.current = blocksNext;
            setBlocks(blocksNext);
            if (!locked) schedule();
        },
        [pinned, locked, schedule]
    );

    const setMeta = React.useCallback(
        (next: PageMeta) => {
            metaRef.current = next;
            setMetaState(next);
            if (!locked) schedule();
        },
        [locked, schedule]
    );

    React.useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
            event.preventDefault();
            if (!pendingRef.current && !savingRef.current) {
                toast.message("Nothing to save — the draft is up to date.");
                return;
            }
            void settle().then((ok) => ok && toast.success("Draft saved"));
        };
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (pendingRef.current || savingRef.current) event.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("beforeunload", onBeforeUnload);
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
    }, [settle]);

    /* ---- publish, discard ---- */
    async function publish() {
        setBusy("publish");
        try {
            if (pendingRef.current || savingRef.current) {
                const ok = await settle();
                if (!ok) {
                    toast.error("The draft has problems — fix them before publishing.");
                    return;
                }
            }
            const view = await api.publish(note.trim() || undefined);
            setLive(view);
            draftRef.current = null;
            setDraft(null);
            setIssues(new Map());
            setSaveState("clean");
            setPublishOpen(false);
            setPreviewStamp((n) => n + 1);
            toast.success(`Version ${view.number} is live`, { description: "Viewers pick it up within a minute." });
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 400) setIssues(issuesByBlock(caught.details));
            toast.error(forbiddenMessage(caught, "The page did not publish."));
        } finally {
            setBusy(null);
        }
    }

    async function discard() {
        setBusy("discard");
        try {
            if (timerRef.current) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            pendingRef.current = false;
            if (draftRef.current) await api.discardDraft();
            toast.success("Draft discarded");
            setDiscardOpen(false);
            onReload();
        } catch (caught) {
            toast.error(forbiddenMessage(caught, "That did not go through."));
        } finally {
            setBusy(null);
        }
    }

    /* ---- the real page's preview ---- */
    const previewable = !phone && !!page?.path && !hasPathParam(page.path);
    /* A token lasts 24 h: one is fetched when the preview opens, and again after a save once the old one is within a minute of expiring. */
    React.useEffect(() => {
        if (mode !== "preview" || !previewable) return;
        if (token && Date.parse(token.expiresAt) - Date.now() > 60_000) return;
        let active = true;
        api.previewToken().then(
            (next) => active && setToken(next),
            (caught: unknown) => active && toast.error(forbiddenMessage(caught, "No preview token — the live page is shown instead."))
        );
        return () => {
            active = false;
        };
    }, [mode, previewable, previewStamp, token, api]);

    /* A custom page previews at /pg/<key> (its address is routed only once published); a system page at its address. */
    const previewSrc = previewable && page ? previewUrl(previewPathFor(page), token?.token ?? null) : null;

    /* ---- what the canvas and the fields draw with ---- */
    const types = React.useMemo(() => new Map(data.types.map((def) => [def.type, def])), [data.types]);
    const [media, rememberMediaRaw] = useRememberingMap<MediaAsset>(() => data.media.map((asset) => [asset.id, asset]));
    const [listingNames, rememberListing] = useRememberingMap<string>(() => []);
    const [cityNames, rememberCity] = useRememberingMap<string>(() => []);
    const lookups = React.useMemo<StudioLookups>(
        () => ({
            types,
            surface: data.surface,
            media,
            rememberMedia: (asset) => rememberMediaRaw(asset.id, asset),
            specs: data.specs,
            slots: data.slots,
            forms: data.forms,
            pages: data.pages,
            listingNames,
            rememberListing,
            cityNames,
            rememberCity,
            readOnly: locked,
        }),
        [types, data.surface, data.specs, data.slots, data.forms, data.pages, media, rememberMediaRaw, listingNames, rememberListing, cityNames, rememberCity, locked]
    );
    const canvas = React.useMemo(() => mergeResolved(blocks, resolved), [blocks, resolved]);
    const canvasState = React.useMemo<CanvasState>(() => ({ canvas, issues, resolvedOnce, phone }), [canvas, issues, resolvedOnce, phone]);

    const extraTypes = React.useMemo(() => [...new Set(initialBlocks.map((block) => block.type).filter((type) => !types.has(type)))], [initialBlocks, types]);
    const config = React.useMemo(() => buildConfig({ types: data.types, surface: data.surface, custom, extraTypes, phone }), [data.types, data.surface, custom, extraTypes, phone]);
    const viewports = React.useMemo(
        () =>
            phone
                ? [{ width: 390, height: "auto" as const, label: "Phone", icon: "Smartphone" as const }]
                : [
                      { width: 1280, height: "auto" as const, label: "Desktop", icon: "Monitor" as const },
                      { width: 834, height: "auto" as const, label: "Tablet", icon: "Tablet" as const },
                      { width: 390, height: "auto" as const, label: "Phone", icon: "Smartphone" as const },
                  ],
        [phone]
    );
    const ui = React.useMemo(() => ({ viewports: { current: { width: phone ? 390 : 1280, height: "auto" as const }, controlsVisible: false, options: viewports } }), [phone, viewports]);
    const permissions = React.useMemo(() => (locked ? { edit: false, insert: false, delete: false, drag: false, duplicate: false } : undefined), [locked]);

    const listIssues = issues.get("") ?? [];
    const dirty = saveState === "dirty" || saveState === "saving";
    const label = page?.title ?? data.label;

    return (
        <StudioLookupsProvider value={lookups}>
            <CanvasStateProvider value={canvasState}>
                <Puck config={config} data={initialData} onChange={onChange} permissions={permissions} viewports={viewports} ui={ui} iframe={{ enabled: false }} dictionary={{ "plugin-components": "Blocks" }}>
                    <EditorFrame
                        data={data}
                        page={page}
                        label={label}
                        phone={phone}
                        live={live}
                        draft={draft}
                        saveState={saveState}
                        saveError={saveError}
                        locked={locked}
                        listIssues={listIssues}
                        mode={mode}
                        onMode={setMode}
                        width={width}
                        onWidth={setWidth}
                        side={side}
                        onSide={setSide}
                        cityIds={cityIds}
                        onCityIds={setCityIds}
                        previewSrc={previewSrc}
                        previewable={previewable}
                        previewStamp={previewStamp}
                        busy={busy}
                        mayPublish={mayPublish}
                        mayDiscard={mayDiscard}
                        dirty={dirty}
                        onHistory={() => setHistoryOpen(true)}
                        onSettings={() => setSettingsOpen(true)}
                        onDiscard={() => setDiscardOpen(true)}
                        onPublish={() => setPublishOpen(true)}
                    />
                </Puck>
                <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} busy={busy === "publish"} note={note} onNoteChange={setNote} onConfirm={() => void publish()} label={label} liveNumber={live?.number ?? null} unsaved={dirty} />
                <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} api={api} mayRestore={mayPublish} onRestored={onReload} dirty={dirty} />
                <PageSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} page={page} meta={meta} onMeta={setMeta} onPage={setPage} canEdit={mayEdit && !locked} canAddresses={mayAddress} />
                <Dialog open={discardOpen} onOpenChange={(next) => busy === null && setDiscardOpen(next)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>{draft ? `Discard draft v${draft.number}?` : "Undo your changes?"}</DialogTitle>
                            <DialogDescription>{draft ? `The draft goes; ${live ? `version ${live.number} stays live` : "the page keeps its default order"}. This cannot be undone.` : "The editor goes back to what is live."}</DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDiscardOpen(false)} disabled={busy !== null}>
                                Cancel
                            </Button>
                            <Button variant="destructive" onClick={() => void discard()} disabled={busy !== null} data-testid="discard-confirm">
                                {busy === "discard" ? "Discarding…" : draft ? "Discard" : "Undo"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CanvasStateProvider>
        </StudioLookupsProvider>
    );
}

/* ------------------------------------------------------------------ */
/* Inside Puck: the toolbar, the three columns                         */
/* ------------------------------------------------------------------ */

interface FrameProps {
    data: EditorData;
    page: SitePageRow | null;
    label: string;
    phone: boolean;
    live: VersionView | null;
    draft: VersionView | null;
    saveState: SaveState;
    saveError: string | null;
    locked: boolean;
    listIssues: BlockIssue[];
    mode: "edit" | "preview";
    onMode: (mode: "edit" | "preview") => void;
    width: number;
    onWidth: (width: number) => void;
    side: Side;
    onSide: (side: Side) => void;
    cityIds: string[];
    onCityIds: (ids: string[]) => void;
    previewSrc: string | null;
    previewable: boolean;
    previewStamp: number;
    busy: null | "publish" | "discard";
    mayPublish: boolean;
    mayDiscard: boolean;
    dirty: boolean;
    onHistory: () => void;
    onSettings: () => void;
    onDiscard: () => void;
    onPublish: () => void;
}

function SaveBadge({ saveState, saveError, locked, live, draft }: Pick<FrameProps, "saveState" | "saveError" | "locked" | "live" | "draft">) {
    let text: string;
    let tone = "bg-paper text-dim";
    if (locked) text = "Read only — editing needs content.edit";
    else if (saveState === "saving") text = "Saving…";
    else if (saveState === "dirty") text = "Unsaved changes";
    else if (saveState === "error") {
        text = "Not saved";
        tone = "bg-danger-soft text-danger";
    } else if (draft) {
        text = `Saved · v${draft.number} draft`;
        tone = "bg-warning-soft text-warning";
    } else if (live) {
        text = `Live v${live.number} · no draft`;
        tone = "bg-success-soft text-success";
    } else text = "Default order · no draft";
    return (
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", tone)} title={saveError ?? undefined} data-testid="save-state">
            {text}
        </span>
    );
}

function EditorFrame(props: FrameProps) {
    const { data, page, label, phone, live, draft, saveState, saveError, locked, listIssues, mode, onMode, width, onWidth, side, onSide, cityIds, onCityIds, previewSrc, previewable, previewStamp, busy, mayPublish, mayDiscard, dirty, onHistory, onSettings, onDiscard, onPublish } = props;
    const { dispatch, history } = usePuck();
    const sides = sidesFor(data.surface);

    const setCanvasWidth = (next: number) => {
        onWidth(next);
        dispatch({ type: "setUi", ui: (previous) => ({ viewports: { ...previous.viewports, current: { width: next, height: "auto" } } }) });
    };

    const canPublish = mayPublish && busy === null && !locked && (!!draft || dirty);

    return (
        <StudioShell
            crumb={
                <span className="flex items-center gap-2">
                    <Link href="/studio" className="inline-flex items-center gap-1 hover:text-ink">
                        <ArrowLeft className="size-3" aria-hidden /> Pages
                    </Link>
                    <span aria-hidden>/</span>
                    <span className="font-medium text-ink" data-testid="editor-title">
                        {label}
                    </span>
                    {page?.path && <span className="font-mono text-xs">{page.path}</span>}
                </span>
            }
            actions={
                <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => history.back()} disabled={!history.hasPast || locked} aria-label="Undo" title="Undo">
                        <Undo2 className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => history.forward()} disabled={!history.hasFuture || locked} aria-label="Redo" title="Redo">
                        <Redo2 className="size-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 bg-white" onClick={onHistory} data-testid="open-history">
                        <History className="mr-1 size-3.5" aria-hidden /> History
                    </Button>
                    {!phone && (
                        <Button variant="outline" size="sm" className="h-8 bg-white" onClick={onSettings} data-testid="open-settings">
                            <Settings2 className="mr-1 size-3.5" aria-hidden /> Settings
                        </Button>
                    )}
                    {((draft && mayDiscard) || (!draft && dirty && !locked)) && (
                        <Button variant="outline" size="sm" className="h-8 bg-white text-danger hover:text-danger" onClick={onDiscard} disabled={busy !== null} data-testid="discard-draft">
                            {draft ? "Discard draft" : "Undo changes"}
                        </Button>
                    )}
                    <Button size="sm" className="h-8" onClick={onPublish} disabled={!canPublish} title={!mayPublish ? "Publishing needs content.approve" : !draft && !dirty ? "Nothing to publish — change something first" : undefined} data-testid="publish">
                        Publish
                    </Button>
                    {page?.path && !hasPathParam(page.path) && (
                        <a href={page.path} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1 px-2 text-xs text-dim hover:text-ink" data-testid="open-live">
                            Open live <ExternalLink className="size-3" aria-hidden />
                        </a>
                    )}
                </div>
            }
        >
            <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2" data-testid="editor-toolbar">
                <SaveBadge saveState={saveState} saveError={saveError} locked={locked} live={live} draft={draft} />
                {!phone && (
                    <div className="flex items-center rounded-md border border-line p-0.5" role="group" aria-label="Width">
                        {WIDTHS.map((row) => (
                            <button key={row.width} type="button" onClick={() => setCanvasWidth(row.width)} className={cn("inline-flex h-7 items-center gap-1 rounded px-2 text-xs", width === row.width ? "bg-ink text-white" : "text-dim hover:text-ink")} aria-pressed={width === row.width} title={`${row.label} · ${row.width}px`}>
                                <row.icon className="size-3.5" />
                                <span className="hidden md:inline">{row.label}</span>
                            </button>
                        ))}
                    </div>
                )}
                {!phone && (
                    <div className="flex items-center rounded-md border border-line p-0.5" role="group" aria-label="Mode">
                        <button type="button" onClick={() => onMode("edit")} className={cn("h-7 rounded px-2.5 text-xs", mode === "edit" ? "bg-ink text-white" : "text-dim hover:text-ink")} aria-pressed={mode === "edit"}>
                            Edit
                        </button>
                        <button type="button" onClick={() => onMode("preview")} disabled={!previewable} className={cn("h-7 rounded px-2.5 text-xs disabled:opacity-40", mode === "preview" ? "bg-ink text-white" : "text-dim hover:text-ink")} aria-pressed={mode === "preview"} title={previewable ? "The real page, with the draft" : "This page takes a parameter in its address — there is no one page to preview"} data-testid="mode-preview">
                            Preview
                        </button>
                    </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-dim">Viewing as</span>
                    <Select value={side} onValueChange={(next) => onSide(next as Side)}>
                        <SelectTrigger className="h-8 w-[170px] bg-white text-xs" aria-label="Viewing as">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {sides.map((item) => (
                                <SelectItem key={item} value={item}>
                                    {SIDE_LABEL[item]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="w-[200px]">
                        <CityPick value={cityIds} onChange={onCityIds} single placeholder="In a city (optional)" />
                    </div>
                </div>
            </div>

            {(saveError || listIssues.length > 0 || data.notes.length > 0) && (
                <div className="space-y-1 border-b border-line bg-white px-4 py-2 text-xs">
                    {saveError && (
                        <p className="text-danger" data-testid="save-error">
                            {saveError}
                        </p>
                    )}
                    {listIssues.map((issue, index) => (
                        <p key={index} className="text-danger">
                            {issue.message}
                        </p>
                    ))}
                    {data.notes.map((noteText, index) => (
                        <p key={index} className="text-warning">
                            {noteText}
                        </p>
                    ))}
                </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_340px]" style={{ height: "calc(100vh - 96px)" }}>
                <aside className="min-h-0 overflow-y-auto border-r border-line bg-white" data-testid="editor-blocks">
                    <Puck.Components />
                    <div className="border-t border-line">
                        <Puck.Outline />
                    </div>
                </aside>
                <main className={cn("adx-studio-canvas min-h-0 overflow-auto bg-paper/60", phone && "py-8")} data-testid="editor-canvas">
                    {mode === "preview" && previewable ? (
                        <div className="h-full p-4">
                            <PreviewFrame src={previewSrc} width={width} stamp={previewStamp} title={`${label} — preview`} />
                        </div>
                    ) : phone ? (
                        <div className="adx-studio-phone">
                            <Puck.Preview />
                        </div>
                    ) : (
                        <Puck.Preview />
                    )}
                    {phone && <p className="mt-4 text-center text-xs text-dim">Content blocks are drawn with the web components; the app's own sections are placeholders. Check on a phone after publishing.</p>}
                </main>
                <aside className="min-h-0 overflow-y-auto border-l border-line bg-white" data-testid="editor-fields">
                    <Tabs defaultValue="fields">
                        <TabsList className="px-2">
                            <TabsTrigger value="fields">Fields</TabsTrigger>
                            <TabsTrigger value="audience" data-testid="tab-audience">
                                Who sees this
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="fields" className="mt-0">
                            <Puck.Fields />
                        </TabsContent>
                        <TabsContent value="audience" className="mt-0">
                            <EnvelopePanel />
                        </TabsContent>
                    </Tabs>
                </aside>
            </div>
        </StudioShell>
    );
}
