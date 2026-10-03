"use client";

import * as React from "react";
import { Tag } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btnOutline, btnPrimary, inputClass } from "@/components/advertiser/bits";
import { BRAND_SECTORS, brandInput, sectorLabel, type BrandCard, type BrandInput } from "@/services/brands";

/**
 * The brand form, for adding (the app's "Add brand" sheet: the name and the
 * sector, the two facts a new brand needs) and for editing (the same two,
 * plus the website and the logo address the brands route also keeps).
 * Industry and awareness are not asked: they arrive with the first campaign.
 */
export function BrandFormDialog({ open, onClose, brand, onSave }: { open: boolean; onClose: () => void; brand?: Pick<BrandCard, "name" | "sector" | "website" | "logoUrl"> | null; onSave: (input: BrandInput) => Promise<void> }) {
    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-[520px] rounded-lg border-line bg-white p-6">
                {/* Keyed so a name half-typed for one brand is not carried into the next form. */}
                {open && <BrandForm key={brand ? "edit" : "add"} brand={brand ?? null} onClose={onClose} onSave={onSave} />}
            </DialogContent>
        </Dialog>
    );
}

function BrandForm({ brand, onClose, onSave }: { brand: Pick<BrandCard, "name" | "sector" | "website" | "logoUrl"> | null; onClose: () => void; onSave: (input: BrandInput) => Promise<void> }) {
    const editing = brand !== null;
    const [name, setName] = React.useState(brand?.name ?? "");
    const [sector, setSector] = React.useState<string>(brand?.sector ?? "GENERAL");
    const [website, setWebsite] = React.useState(brand?.website ?? "");
    const [logoUrl, setLogoUrl] = React.useState(brand?.logoUrl ?? "");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const checked = brandInput({ name, sector, website: editing ? website : "", logoUrl: editing ? logoUrl : "" });
        if (!checked.ok) {
            setError(checked.message);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await onSave(checked.input);
        } catch (caught) {
            setError(messageOf(caught, editing ? "Could not save the brand." : "Could not add that brand."));
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-ink">{editing ? "Edit brand" : "Add a brand"}</DialogTitle>
                <DialogDescription className="text-sm text-dim">{editing ? "The name you book under, its sector, and where people find it." : "Its industry and awareness are recorded with its first campaign."}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-medium text-ink">
                        Brand name
                        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Anita's Coffee" autoFocus maxLength={120} className={inputClass} />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-ink">
                        Sector
                        <select value={sector} onChange={(event) => setSector(event.target.value)} className={inputClass}>
                            {BRAND_SECTORS.map((value) => (
                                <option key={value} value={value}>
                                    {sectorLabel(value)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                {editing && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="grid gap-1.5 text-sm font-medium text-ink">
                                Website (optional)
                                <input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="anitascoffee.in" inputMode="url" className={inputClass} />
                            </label>
                            <label className="grid gap-1.5 text-sm font-medium text-ink">
                                Logo address (optional)
                                <input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://…/logo.png" inputMode="url" className={inputClass} />
                            </label>
                        </div>
                        <p className="-mt-2 text-xs text-dim">A website or logo address, once saved, can be changed but not cleared from here.</p>
                    </>
                )}
                {error && (
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className={btnOutline}>
                        Cancel
                    </button>
                    <button type="submit" disabled={busy || !name.trim()} className={btnPrimary}>
                        {busy ? (editing ? "Saving…" : "Adding…") : editing ? "Save brand" : "Add brand"}
                    </button>
                </div>
            </form>
        </>
    );
}

/** The brand's logo, or a tag on the ground where there is none. */
export function BrandLogo({ src, name, className }: { src: string | null; name: string; className?: string }) {
    const [failed, setFailed] = React.useState(false);
    if (!src || failed) {
        return (
            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-md bg-ground text-dim", className)} aria-hidden>
                <Tag className="size-5" />
            </span>
        );
    }
    return <img src={src} alt={`${name} logo`} onError={() => setFailed(true)} className={cn("size-12 shrink-0 rounded-md border border-line bg-white object-contain", className)} />;
}
