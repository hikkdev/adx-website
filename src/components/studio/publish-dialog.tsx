"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** ST-1: publishing asks for a note — autosave never publishes. */
export function PublishDialog({
    open,
    onOpenChange,
    busy,
    note,
    onNoteChange,
    onConfirm,
    label,
    liveNumber,
    unsaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    busy: boolean;
    note: string;
    onNoteChange: (note: string) => void;
    onConfirm: () => void;
    label: string;
    liveNumber: number | null;
    unsaved: boolean;
}) {
    return (
        <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <DialogContent className="sm:max-w-md" data-testid="publish-dialog">
                <DialogHeader>
                    <DialogTitle>Publish {label}?</DialogTitle>
                    <DialogDescription>
                        {unsaved ? "The draft is saved first. " : ""}
                        It becomes what every viewer gets{liveNumber !== null ? `, and version ${liveNumber} retires` : ""}. Viewers pick it up within a minute.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                    <Label htmlFor="studio-publish-note">What changed</Label>
                    <Textarea id="studio-publish-note" value={note} onChange={(event) => onNoteChange(event.target.value)} rows={3} maxLength={300} placeholder="Diwali banner on top; steps rewritten" />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={onConfirm} disabled={busy} data-testid="publish-confirm">
                        {busy ? "Publishing…" : "Publish"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
