"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PATH_PATTERN, forbiddenMessage, studioService, type PageChannel, type PageMeta, type PagePatch, type SitePageRow } from "@/services/studio";
import { MediaField } from "./field-widgets";

/**
 * ST-1: the page's settings — its title, its address, its channels, its
 * SEO. Title and channels take `content.edit`; the address takes
 * `content.addresses` ("Only admins can change the addresses") and the old
 * address redirects to the new one; SEO lives on the version's `meta`, so
 * it saves with the draft and goes live when the draft does. The form is
 * mounted only while the sheet is open, so every opening starts from what
 * is saved now.
 */
interface SettingsProps {
    page: SitePageRow | null;
    meta: PageMeta;
    onMeta: (next: PageMeta) => void;
    onPage: (row: SitePageRow) => void;
    canEdit: boolean;
    canAddresses: boolean;
}

export function PageSettingsSheet({ open, onOpenChange, ...form }: SettingsProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="page-settings">
                <SheetHeader>
                    <SheetTitle>Page settings</SheetTitle>
                    <SheetDescription>{form.page ? "Title and address are the page's; SEO saves with the draft and goes live when it is published." : "SEO saves with the draft."}</SheetDescription>
                </SheetHeader>
                {open && <SettingsForm {...form} onClose={() => onOpenChange(false)} />}
            </SheetContent>
        </Sheet>
    );
}

function SettingsForm({ page, meta, onMeta, onPage, canEdit, canAddresses, onClose }: SettingsProps & { onClose: () => void }) {
    const [title, setTitle] = React.useState(page?.title ?? "");
    const [path, setPath] = React.useState(page?.path ?? "");
    const [channels, setChannels] = React.useState<PageChannel[]>(page?.channels ?? ["WEBSITE"]);
    const [draftMeta, setDraftMeta] = React.useState<PageMeta>(meta);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const custom = page?.kind === "CUSTOM";
    const addressEditable = !!page && canAddresses && !page.addressLocked && canEdit;
    const addressChanged = !!page && path.trim() !== page.path;
    const pathOk = !addressChanged || PATH_PATTERN.test(path.trim());

    async function save() {
        setBusy(true);
        setError(null);
        try {
            if (page) {
                const patch: PagePatch = {};
                if (title.trim() && title.trim() !== page.title) patch.title = title.trim();
                if (custom && channels.join() !== page.channels.join()) patch.channels = channels;
                if (addressChanged) patch.path = path.trim();
                if (Object.keys(patch).length > 0) {
                    const row = await studioService.pages.patch(page.key, patch);
                    onPage({ ...page, ...row, title: row?.title ?? patch.title ?? page.title, path: row?.path ?? patch.path ?? page.path, channels: row?.channels ?? patch.channels ?? page.channels });
                    if (patch.path) toast.success("Address changed", { description: `${page.path} now redirects to ${patch.path}.` });
                }
            }
            if (JSON.stringify(draftMeta) !== JSON.stringify(meta)) onMeta(draftMeta);
            onClose();
        } catch (caught) {
            setError(forbiddenMessage(caught, "The settings did not save."));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-5 space-y-5">
            {page && (
                <>
                    <div className="space-y-1">
                        <Label htmlFor="studio-page-title">Title</Label>
                        <Input id="studio-page-title" value={title} disabled={!canEdit} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="bg-white" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="studio-page-path">Address</Label>
                        <Input id="studio-page-path" value={path} disabled={!addressEditable} onChange={(event) => setPath(event.target.value)} className="bg-white font-mono" placeholder="/my-page" />
                        <p className="text-[11px] text-dim" data-testid="address-hint">
                            {page.addressLocked ? "This page's address cannot change." : !canAddresses ? "Only an admin with content.addresses may change an address." : addressChanged ? `The old address will redirect here: ${page.path} → ${path.trim() || "…"}` : "Lowercase words and hyphens, up to five segments. The old address will redirect here."}
                        </p>
                        {!pathOk && <p className="text-[11px] text-danger">Not a valid address — /words-with-hyphens, up to five segments.</p>}
                    </div>
                    {custom && (
                        <fieldset className="space-y-1.5" disabled={!canEdit}>
                            <legend className="text-sm font-medium text-ink">Channels</legend>
                            {(["WEBSITE", "APPS"] as PageChannel[]).map((channel) => (
                                <label key={channel} className="flex items-center gap-2 text-sm text-ink">
                                    <input type="checkbox" className="size-4 accent-brand" checked={channels.includes(channel)} onChange={() => setChannels(channels.includes(channel) ? channels.filter((item) => item !== channel) : [...channels, channel])} />
                                    {channel === "WEBSITE" ? "Website" : "The apps"}
                                </label>
                            ))}
                        </fieldset>
                    )}
                </>
            )}
            <div className="space-y-4 rounded-lg border border-line bg-ground p-3">
                <p className="text-sm font-semibold text-ink">SEO</p>
                <div className="space-y-1">
                    <Label htmlFor="studio-seo-title">Title tag</Label>
                    <Input id="studio-seo-title" value={draftMeta.seoTitle ?? ""} disabled={!canEdit} onChange={(event) => setDraftMeta({ ...draftMeta, seoTitle: event.target.value })} maxLength={120} className="bg-white" placeholder="Leave empty for the page title" />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="studio-seo-description">Description</Label>
                    <Textarea id="studio-seo-description" value={draftMeta.seoDescription ?? ""} disabled={!canEdit} onChange={(event) => setDraftMeta({ ...draftMeta, seoDescription: event.target.value })} maxLength={300} rows={3} className="bg-white" />
                </div>
                <div className="space-y-1">
                    <Label>Share picture</Label>
                    <MediaField value={draftMeta.seoImageMediaId ?? ""} readOnly={!canEdit} onChange={(id) => setDraftMeta({ ...draftMeta, seoImageMediaId: id || undefined })} spec="PROMO_WIDE" />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm text-ink">Keep out of search engines</p>
                        <p className="text-[11px] text-dim">noindex — the page still opens by its address.</p>
                    </div>
                    <Switch checked={!!draftMeta.noindex} disabled={!canEdit} onCheckedChange={(noindex) => setDraftMeta({ ...draftMeta, noindex: noindex || undefined })} aria-label="noindex" />
                </div>
            </div>
            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={() => void save()} disabled={busy || !canEdit || !pathOk} data-testid="page-settings-save">
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    );
}
