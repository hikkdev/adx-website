"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { forbiddenMessage, type VersionView, type versionApi } from "@/services/studio";

const when = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const who = (person: VersionView["publishedBy"]): string | null => (!person ? null : typeof person === "string" ? person : (person.name ?? null));

const TONE: Record<VersionView["status"], string> = { DRAFT: "bg-warning-soft text-warning", PUBLISHED: "bg-success-soft text-success", RETIRED: "bg-paper text-dim" };
const STATUS: Record<VersionView["status"], string> = { DRAFT: "Draft", PUBLISHED: "Live", RETIRED: "Retired" };

type Api = ReturnType<typeof versionApi>;

/**
 * ST-1: every version, newest first. A retired one can be restored — its
 * blocks are published again as the newest version, so the history only
 * ever grows and nothing is overwritten. The list is mounted only while
 * the sheet is open, so every opening reads afresh.
 */
export function HistorySheet({ open, onOpenChange, api, mayRestore, onRestored, dirty }: { open: boolean; onOpenChange: (open: boolean) => void; api: Api; mayRestore: boolean; onRestored: () => void; dirty: boolean }) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="studio-history">
                <SheetHeader>
                    <SheetTitle>Version history</SheetTitle>
                    <SheetDescription>Restoring publishes that version's blocks again as the newest version. Nothing is overwritten.</SheetDescription>
                </SheetHeader>
                {dirty && mayRestore && <p className="mt-3 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">Unsaved edits are still saving. Wait a moment before restoring a version.</p>}
                {open && (
                    <HistoryList
                        api={api}
                        mayRestore={mayRestore}
                        dirty={dirty}
                        onRestored={() => {
                            onOpenChange(false);
                            onRestored();
                        }}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}

function HistoryList({ api, mayRestore, dirty, onRestored }: { api: Api; mayRestore: boolean; dirty: boolean; onRestored: () => void }) {
    const [state, setState] = React.useState<{ rows: VersionView[] | null; error: string | null }>({ rows: null, error: null });
    const [pending, setPending] = React.useState<VersionView | null>(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        let active = true;
        api.versions().then(
            (rows) => active && setState({ rows, error: null }),
            (cause: unknown) => active && setState({ rows: [], error: forbiddenMessage(cause, "The history could not be read.") })
        );
        return () => {
            active = false;
        };
    }, [api]);

    async function restore(version: VersionView) {
        setBusy(true);
        try {
            const restored = await api.restore(version.number);
            toast.success(`Version ${version.number} is live again`, { description: `Published as version ${restored.number}.` });
            setPending(null);
            onRestored();
        } catch (caught) {
            toast.error(forbiddenMessage(caught, "That did not go through."));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-4 space-y-2">
            {state.rows === null ? (
                <p className="flex items-center gap-2 text-sm text-dim">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
                </p>
            ) : state.error ? (
                <p className="text-sm text-danger">{state.error}</p>
            ) : state.rows.length === 0 ? (
                <p className="text-sm text-dim">No versions yet — the page draws its default order.</p>
            ) : (
                state.rows.map((version) => (
                    <div key={version.id} className="rounded-md border border-line bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-ink">v{version.number}</span>
                                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[version.status])}>{STATUS[version.status]}</span>
                            </div>
                            {version.status === "RETIRED" && mayRestore && (
                                <Button size="sm" variant="outline" className="h-7 bg-white" disabled={dirty} onClick={() => setPending(version)}>
                                    Restore
                                </Button>
                            )}
                        </div>
                        <p className="mt-1 text-xs text-dim">
                            {version.blocks.length} {version.blocks.length === 1 ? "block" : "blocks"}
                            {version.publishedAt ? ` · published ${when(version.publishedAt)}` : ` · saved ${when(version.updatedAt ?? version.createdAt)}`}
                            {who(version.publishedBy) ? ` by ${who(version.publishedBy)}` : ""}
                        </p>
                        {version.changeNote && <p className="mt-1 text-sm text-ink">{version.changeNote}</p>}
                    </div>
                ))
            )}
            <Dialog open={pending !== null} onOpenChange={(next) => !next && !busy && setPending(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Restore version {pending?.number}?</DialogTitle>
                        <DialogDescription>It goes live at once as a new version; the version live now retires. Any draft waiting stays a draft.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={() => pending && void restore(pending)} disabled={busy}>
                            {busy ? "Restoring…" : "Restore and publish"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
