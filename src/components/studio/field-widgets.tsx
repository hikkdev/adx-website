"use client";

import * as React from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { LISTING_CATEGORIES, TARGET_KINDS, TARGET_KIND_META, forbiddenMessage, studioService, type MediaAsset, type TargetKind } from "@/services/studio";
import { useStudioLookups } from "./lookups";

/**
 * ST-1: the inputs Puck's built-in fields do not have — a picture from the
 * library, a target, a list of listings, a slot, a form, a checklist, a
 * city. Each is a plain `value`/`onChange` control; `puck-fields.tsx` wraps
 * them as Puck custom fields.
 */

const NONE = "__none__";

const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/* ------------------------------------------------------------------ */
/* Search + chips                                                      */
/* ------------------------------------------------------------------ */

interface SearchHit {
    id: string;
    label: string;
    detail?: string;
}

function AsyncSearch({ placeholder, search, onPick, disabled, ariaLabel }: { placeholder: string; search: (q: string) => Promise<SearchHit[]>; onPick: (hit: SearchHit) => void; disabled?: boolean; ariaLabel: string }) {
    const [q, setQ] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [term, setTerm] = React.useState("");
    const [result, setResult] = React.useState<{ term: string; hits: SearchHit[] | null; error: string | null } | null>(null);
    const searchRef = React.useRef(search);
    React.useEffect(() => {
        searchRef.current = search;
    });
    React.useEffect(() => {
        const timer = window.setTimeout(() => setTerm(q.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [q]);
    React.useEffect(() => {
        if (!open || term.length < 2) return;
        let active = true;
        searchRef.current(term).then(
            (found) => active && setResult({ term, hits: found, error: null }),
            (cause: unknown) => active && setResult({ term, hits: [], error: forbiddenMessage(cause, "The search failed.") })
        );
        return () => {
            active = false;
        };
    }, [term, open]);

    const hits = result?.term === term ? result.hits : null;
    const error = result?.term === term ? result.error : null;

    return (
        <div className="relative">
            <Input
                value={q}
                disabled={disabled}
                onChange={(event) => {
                    setQ(event.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                placeholder={placeholder}
                aria-label={ariaLabel}
                className="h-9 bg-white"
            />
            {open && term.length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-line bg-white p-1 shadow-card">
                    {error ? (
                        <p className="px-2 py-1.5 text-xs text-danger">{error}</p>
                    ) : hits === null ? (
                        <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-dim">
                            <Loader2 className="size-3 animate-spin" aria-hidden /> Searching…
                        </p>
                    ) : hits.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-dim">Nothing matches.</p>
                    ) : (
                        hits.map((hit) => (
                            <button
                                key={hit.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    onPick(hit);
                                    setQ("");
                                    setOpen(false);
                                }}
                                className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm hover:bg-ground"
                            >
                                <span className="text-ink">{hit.label}</span>
                                {hit.detail && <span className="text-[11px] text-dim">{hit.detail}</span>}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function Chips({ items, onRemove, disabled }: { items: { id: string; label: string }[]; onRemove: (id: string) => void; disabled?: boolean }) {
    if (items.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
                <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-xs text-ink">
                    {item.label}
                    {!disabled && (
                        <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.label}`} className="text-dim hover:text-ink">
                            <X className="size-3" />
                        </button>
                    )}
                </span>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Checklist (multiselect)                                             */
/* ------------------------------------------------------------------ */

export function ChecklistField({ options, value, onChange, readOnly }: { options: { value: string; label: string }[]; value: unknown; onChange: (next: string[]) => void; readOnly?: boolean }) {
    const chosen = asStrings(value);
    return (
        <div className="space-y-1.5">
            {options.map((option) => {
                const on = chosen.includes(option.value);
                return (
                    <label key={option.value} className="flex items-center gap-2 text-sm text-ink">
                        <input
                            type="checkbox"
                            checked={on}
                            disabled={readOnly}
                            onChange={() => onChange(on ? chosen.filter((item) => item !== option.value) : [...chosen, option.value])}
                            className="size-4 rounded border-line accent-brand"
                        />
                        {option.label}
                    </label>
                );
            })}
            {options.length === 0 && <p className="text-xs text-dim">No options.</p>}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

async function searchListings(q: string): Promise<SearchHit[]> {
    const hits = await studioService.listings(q);
    return hits.map((listing) => ({ id: listing.id, label: listing.displayId ? `${listing.title} · ${listing.displayId}` : listing.title, detail: [listing.category, listing.city].filter(Boolean).join(" · ") }));
}

export function ListingIdsField({ value, onChange, max, single, readOnly }: { value: unknown; onChange: (next: string[]) => void; max?: number; single?: boolean; readOnly?: boolean }) {
    const { listingNames, rememberListing } = useStudioLookups();
    const ids = asStrings(value);
    const full = single ? ids.length >= 1 : max !== undefined && ids.length >= max;
    return (
        <div className="space-y-2">
            <Chips items={ids.map((id) => ({ id, label: listingNames.get(id) ?? id }))} onRemove={(id) => onChange(ids.filter((item) => item !== id))} disabled={readOnly} />
            {!full && !readOnly && (
                <AsyncSearch
                    ariaLabel="Search listings"
                    placeholder="Search listings by title, id or city"
                    search={searchListings}
                    onPick={(hit) => {
                        rememberListing(hit.id, hit.label);
                        if (!ids.includes(hit.id)) onChange(single ? [hit.id] : [...ids, hit.id]);
                    }}
                />
            )}
            {max !== undefined && !single && <p className="text-[11px] text-dim">{ids.length} of at most {max}</p>}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Cities — the catalogue's ids, which is what the envelope names      */
/* ------------------------------------------------------------------ */

export function CityPick({ value, onChange, single, readOnly, placeholder = "Search cities" }: { value: string[]; onChange: (next: string[]) => void; single?: boolean; readOnly?: boolean; placeholder?: string }) {
    const { cityNames, rememberCity } = useStudioLookups();
    const search = React.useCallback(async (q: string): Promise<SearchHit[]> => {
        try {
            const items = await studioService.cities(q);
            return items.map((city) => ({ id: city.id, label: city.name, detail: [city.state, city.stage?.toLowerCase()].filter(Boolean).join(" · ") }));
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 403) throw new Error("Picking a city by name needs marketplace.view; ask a super admin, or paste a city id.");
            throw caught;
        }
    }, []);
    return (
        <div className="space-y-2">
            <Chips items={value.map((id) => ({ id, label: cityNames.get(id) ?? `City ${id.slice(0, 8)}…` }))} onRemove={(id) => onChange(value.filter((item) => item !== id))} disabled={readOnly} />
            {!(single && value.length >= 1) && !readOnly && (
                <AsyncSearch
                    ariaLabel={placeholder}
                    placeholder={placeholder}
                    search={search}
                    onPick={(hit) => {
                        rememberCity(hit.id, hit.label);
                        if (!value.includes(hit.id)) onChange(single ? [hit.id] : [...value, hit.id]);
                    }}
                />
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

const formatBytes = (bytes: number | null): string => (bytes === null ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

function MediaPickerDialog({ open, onOpenChange, spec, selectedId, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; spec?: string; selectedId?: string; onPick: (asset: MediaAsset) => void }) {
    const { specs, rememberMedia } = useStudioLookups();
    const wanted = React.useMemo(() => (spec ? spec.split(/[,|]/).map((part) => part.trim().toUpperCase()).filter(Boolean) : []), [spec]);
    const [q, setQ] = React.useState("");
    const [answer, setAnswer] = React.useState<{ key: string; items: MediaAsset[] | null; error: string | null } | null>(null);
    const [file, setFile] = React.useState<File | null>(null);
    const [altText, setAltText] = React.useState("");
    const [title, setTitle] = React.useState("");
    const [uploadSpec, setUploadSpec] = React.useState<string>(wanted[0] ?? "");
    const [uploading, setUploading] = React.useState(false);
    const [uploadError, setUploadError] = React.useState<string | null>(null);
    const [nonce, setNonce] = React.useState(0);

    /* The answer carries the key it answers, so a stale one reads as "still loading" (the site's use-layout pattern). */
    const requestKey = `${wanted.join(",")}|${nonce}`;
    React.useEffect(() => {
        if (!open) return;
        let active = true;
        /* ADX's own pictures only (28 Sep 2026): an ADX page never picks an advertiser's ad artwork — that lives with the ad. */
        studioService.media.list({ spec: wanted.join(",") || undefined, owner: "adx", limit: 200 }).then(
            (rows) => active && setAnswer({ key: requestKey, items: rows.filter((asset) => !asset.archivedAt), error: null }),
            (cause: unknown) => active && setAnswer({ key: requestKey, items: [], error: forbiddenMessage(cause, "The library could not be read.") })
        );
        return () => {
            active = false;
        };
    }, [open, wanted, requestKey]);
    const items = answer?.key === requestKey ? answer.items : null;
    const error = answer?.key === requestKey ? answer.error : null;

    const term = q.trim().toLowerCase();
    const shown = (items ?? []).filter((asset) => !term || [asset.title, asset.altText, ...asset.tags].some((text) => text?.toLowerCase().includes(term)));
    const specRows = specs.filter((row) => wanted.length === 0 || wanted.includes(row.key));

    async function upload(event: React.FormEvent) {
        event.preventDefault();
        if (!file) return setUploadError("Choose a picture first.");
        if (!altText.trim()) return setUploadError("Alt text is required — it is read aloud and shown when the image cannot be.");
        setUploading(true);
        setUploadError(null);
        try {
            const asset = await studioService.media.upload({ file, spec: uploadSpec || undefined, altText: altText.trim(), title: title.trim() || undefined });
            rememberMedia(asset);
            onPick(asset);
            onOpenChange(false);
            setFile(null);
            setAltText("");
            setTitle("");
            setNonce((n) => n + 1);
        } catch (caught) {
            setUploadError(forbiddenMessage(caught, "The upload failed."));
        } finally {
            setUploading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Pick a picture</DialogTitle>
                    <DialogDescription>
                        {specRows.length ? `This place takes ${specRows.map((row) => `${row.label} (${row.width}×${row.height})`).join(" or ")}.` : "Any picture from the library."} Every picture needs alt text.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-5 md:grid-cols-[1fr_260px]">
                    <div className="space-y-3">
                        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search the library" aria-label="Search the library" className="h-9" />
                        {error ? (
                            <p className="text-sm text-danger">{error}</p>
                        ) : items === null ? (
                            <p className="flex items-center gap-2 py-6 text-sm text-dim">
                                <Loader2 className="size-4 animate-spin" aria-hidden /> Reading the library…
                            </p>
                        ) : shown.length === 0 ? (
                            <p className="py-6 text-sm text-dim">{items.length === 0 ? "Nothing in the library yet for this shape — upload one." : "Nothing matches."}</p>
                        ) : (
                            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="media-grid">
                                {shown.map((asset) => (
                                    <li key={asset.id}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                rememberMedia(asset);
                                                onPick(asset);
                                                onOpenChange(false);
                                            }}
                                            className={cn("flex w-full flex-col overflow-hidden rounded-lg border bg-white text-left hover:border-ink", selectedId === asset.id ? "border-brand ring-1 ring-brand" : "border-line")}
                                        >
                                            <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-ground">
                                                <img src={asset.url} alt={asset.altText ?? ""} className="max-h-full max-w-full object-contain" loading="lazy" />
                                            </span>
                                            <span className="truncate px-2 pt-1.5 text-xs font-medium text-ink">{asset.title || "Untitled"}</span>
                                            <span className="truncate px-2 pb-1.5 text-[11px] text-dim">
                                                {asset.width}×{asset.height}
                                                {asset.spec ? ` · ${asset.spec}` : ""}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <form onSubmit={(event) => void upload(event)} className="space-y-3 rounded-lg border border-line bg-ground p-3">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                            <Upload className="size-4" aria-hidden /> Upload a picture
                        </p>
                        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Picture file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-xs text-dim file:mr-2 file:rounded file:border-0 file:bg-white file:px-2 file:py-1 file:text-xs file:text-ink" />
                        {specRows.length > 1 && (
                            <Select value={uploadSpec || NONE} onValueChange={(next) => setUploadSpec(next === NONE ? "" : next)}>
                                <SelectTrigger className="h-9 bg-white" aria-label="Size spec">
                                    <SelectValue placeholder="Size spec" />
                                </SelectTrigger>
                                <SelectContent>
                                    {specRows.map((row) => (
                                        <SelectItem key={row.key} value={row.key}>
                                            {row.label} · {row.width}×{row.height}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <div className="space-y-1">
                            <Label htmlFor="studio-media-alt" className="text-xs">
                                Alt text (required)
                            </Label>
                            <Input id="studio-media-alt" value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={300} placeholder="What the picture shows" className="h-9 bg-white" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="studio-media-title" className="text-xs">
                                Title
                            </Label>
                            <Input id="studio-media-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="For the library" className="h-9 bg-white" />
                        </div>
                        {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
                        <Button type="submit" size="sm" disabled={uploading} className="w-full">
                            {uploading ? "Uploading…" : "Upload and use"}
                        </Button>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function MediaField({ value, onChange, spec, readOnly }: { value: unknown; onChange: (next: string) => void; spec?: string; readOnly?: boolean }) {
    const { media } = useStudioLookups();
    const [open, setOpen] = React.useState(false);
    const id = typeof value === "string" ? value : "";
    const asset = id ? media.get(id) : undefined;
    return (
        <div className="flex items-center gap-3 rounded-md border border-line bg-white p-2">
            <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-ground">
                {asset ? <img src={asset.url} alt={asset.altText ?? ""} className="max-h-full max-w-full object-contain" /> : <ImageIcon className="size-5 text-dim" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1 text-xs">
                {asset ? (
                    <>
                        <p className="truncate font-medium text-ink">{asset.title || "Untitled"}</p>
                        <p className="truncate text-dim">
                            {asset.width}×{asset.height}
                            {asset.bytes ? ` · ${formatBytes(asset.bytes)}` : ""} · {asset.altText ?? "no alt text"}
                        </p>
                    </>
                ) : id ? (
                    <p className="text-dim">Picture {id.slice(0, 10)}… (not in the library list)</p>
                ) : (
                    <p className="text-dim">No picture chosen</p>
                )}
            </div>
            {!readOnly && (
                <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-7 bg-white" onClick={() => setOpen(true)}>
                        {id ? "Change" : "Choose"}
                    </Button>
                    {id && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onChange("")} aria-label="Clear picture">
                            <X className="size-3.5" />
                        </Button>
                    )}
                </div>
            )}
            {open && <MediaPickerDialog open={open} onOpenChange={setOpen} spec={spec} selectedId={id} onPick={(picked) => onChange(picked.id)} />}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Target                                                              */
/* ------------------------------------------------------------------ */

export type TargetValue = { kind?: string; value?: string } | undefined;

export function TargetField({ value, onChange, readOnly }: { value: TargetValue; onChange: (next: TargetValue) => void; readOnly?: boolean }) {
    const { pages, listingNames } = useStudioLookups();
    const kind = value?.kind && (TARGET_KINDS as readonly string[]).includes(value.kind) ? (value.kind as TargetKind) : "";
    const text = value?.value ?? "";
    const meta = kind ? TARGET_KIND_META[kind] : null;
    const livePages = pages.filter((page) => !page.archivedAt);
    return (
        <div className="grid gap-2">
            <Select value={kind || NONE} disabled={readOnly} onValueChange={(next) => onChange(next === NONE ? undefined : { kind: next })}>
                <SelectTrigger className="h-9 bg-white" aria-label="Opens">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>Nothing</SelectItem>
                    {TARGET_KINDS.map((item) => (
                        <SelectItem key={item} value={item}>
                            {TARGET_KIND_META[item].label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {meta?.needsValue ? (
                kind === "PAGE" && livePages.length > 0 ? (
                    <Select value={text || NONE} disabled={readOnly} onValueChange={(next) => onChange({ kind, value: next === NONE ? "" : next })}>
                        <SelectTrigger className="h-9 bg-white" aria-label="Page">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Pick a page</SelectItem>
                            {!livePages.some((page) => page.key === text) && text && <SelectItem value={text}>{text} (unknown)</SelectItem>}
                            {livePages.map((page) => (
                                <SelectItem key={page.key} value={page.key}>
                                    {page.title} · {page.path}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : kind === "CATEGORY" ? (
                    <Select value={text || NONE} disabled={readOnly} onValueChange={(next) => onChange({ kind, value: next === NONE ? "" : next })}>
                        <SelectTrigger className="h-9 bg-white" aria-label="Category">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Pick a category</SelectItem>
                            {LISTING_CATEGORIES.map((category) => (
                                <SelectItem key={category} value={category}>
                                    {category}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : kind === "LISTING" ? (
                    text ? (
                        <Chips items={[{ id: text, label: listingNames.get(text) ?? text }]} onRemove={() => onChange({ kind, value: "" })} disabled={readOnly} />
                    ) : (
                        <ListingIdsField value={[]} single readOnly={readOnly} onChange={(ids) => onChange({ kind, value: ids[0] ?? "" })} />
                    )
                ) : (
                    <Input value={text} disabled={readOnly} onChange={(event) => onChange({ kind, value: event.target.value })} placeholder={meta.placeholder} className="h-9 bg-white" aria-label="Where it goes" />
                )
            ) : (
                <p className="text-xs text-dim">{kind ? "Each client opens its own screen for this." : "A tap does nothing."}</p>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Slot, form, JSON                                                    */
/* ------------------------------------------------------------------ */

export function SlotKeyField({ value, onChange, readOnly }: { value: unknown; onChange: (next: string) => void; readOnly?: boolean }) {
    const { slots } = useStudioLookups();
    const key = typeof value === "string" ? value : "";
    if (slots.length === 0) {
        return (
            <div className="space-y-1">
                <Input value={key} disabled={readOnly} onChange={(event) => onChange(event.target.value.toUpperCase())} placeholder="WEB_LISTING_SIDEBAR" className="h-9 bg-white font-mono" aria-label="Slot key" />
                <p className="text-[11px] text-dim">The slot list could not be read — type the key as Ads & sponsored › Slots & pricing names it.</p>
            </div>
        );
    }
    const known = slots.some((slot) => slot.key === key);
    return (
        <Select value={key || NONE} disabled={readOnly} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
            <SelectTrigger className="h-9 bg-white" aria-label="Slot">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NONE}>Pick a slot</SelectItem>
                {!known && key && <SelectItem value={key}>{key} (unknown)</SelectItem>}
                {slots.map((slot) => (
                    <SelectItem key={slot.key} value={slot.key}>
                        {slot.label} · {slot.key}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function FormKeyField({ value, onChange, readOnly }: { value: unknown; onChange: (next: string) => void; readOnly?: boolean }) {
    const { forms } = useStudioLookups();
    const key = typeof value === "string" ? value : "";
    if (!forms) {
        return (
            <div className="space-y-1">
                <Input value={key} disabled={readOnly} onChange={(event) => onChange(event.target.value)} placeholder="form-key" className="h-9 bg-white font-mono" aria-label="Form key" />
                <p className="text-[11px] text-dim">The forms list could not be read — type the form's key as Content › Forms shows it.</p>
            </div>
        );
    }
    const known = forms.some((form) => form.key === key);
    return (
        <Select value={key || NONE} disabled={readOnly} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
            <SelectTrigger className="h-9 bg-white" aria-label="Form">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NONE}>{forms.length ? "Pick a form" : "No forms yet"}</SelectItem>
                {!known && key && <SelectItem value={key}>{key} (unknown)</SelectItem>}
                {forms.map((form) => (
                    <SelectItem key={form.key} value={form.key}>
                        {form.title} · {form.key}
                        {form.live ? "" : " (not published)"}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/** An input this build does not know: edited as JSON, saved when it parses. */
export function JsonField({ value, onChange, readOnly }: { value: unknown; onChange: (next: unknown) => void; readOnly?: boolean }) {
    const [text, setText] = React.useState(() => (value === undefined ? "" : JSON.stringify(value, null, 2)));
    const [bad, setBad] = React.useState(false);
    return (
        <div className="space-y-1">
            <Textarea
                value={text}
                disabled={readOnly}
                rows={4}
                className="bg-white font-mono text-xs"
                aria-label="Value as JSON"
                onChange={(event) => {
                    const next = event.target.value;
                    setText(next);
                    if (!next.trim()) {
                        setBad(false);
                        onChange(undefined);
                        return;
                    }
                    try {
                        onChange(JSON.parse(next));
                        setBad(false);
                    } catch {
                        setBad(true);
                    }
                }}
            />
            <p className={cn("text-[11px]", bad ? "text-danger" : "text-dim")}>{bad ? "Not valid JSON — the last good value is kept." : "Studio does not know this input yet; it is edited as JSON."}</p>
        </div>
    );
}
