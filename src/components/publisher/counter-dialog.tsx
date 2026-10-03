"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brandButton, Field, outlineButton, textareaClass } from "@/components/publisher/parts";

/**
 * "Suggest another time" as a proper dialog — what suits the publisher,
 * in their words, to the installer. The note is optional; sending none
 * still asks for another time. How many times they have asked already is
 * said, because ADX steps in if it keeps going.
 */
export function CounterDialog({
    open,
    onClose,
    onSend,
    busy,
    installer,
    proposed,
    counters,
    failure,
}: {
    open: boolean;
    onClose: () => void;
    onSend: (note: string) => void;
    busy: boolean;
    installer: string | null;
    proposed: string;
    counters: number;
    failure: string | null;
}) {
    const [note, setNote] = React.useState("");
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        onSend(note.trim());
    };
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !busy) {
                    setNote("");
                    onClose();
                }
            }}
        >
            <DialogContent className="max-w-[480px] rounded-lg border-line bg-white p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">Suggest another time</DialogTitle>
                    <DialogDescription className="text-sm text-dim">
                        {installer ?? "The installer"} proposed {proposed}. Say what suits you better and it goes to them; they will propose a new time.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid gap-4">
                    <Field label="What suits you (optional)" htmlFor="counter-note">
                        <textarea id="counter-note" value={note} onChange={(event) => setNote(event.target.value.slice(0, 300))} rows={3} maxLength={300} className={textareaClass} placeholder="Mornings before 11 are better, or any time Saturday" />
                    </Field>
                    {counters > 0 && (
                        <p className="text-xs text-dim">
                            You have asked for a different time {counters} {counters === 1 ? "time" : "times"} already. ADX steps in if this keeps going.
                        </p>
                    )}
                    {failure && (
                        <p role="alert" className="text-sm text-danger">
                            {failure}
                        </p>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={busy} className={outlineButton}>
                            Keep this time
                        </button>
                        <button type="submit" disabled={busy} className={brandButton}>
                            {busy ? "Sending…" : "Ask for another time"}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
