"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { btnPrimary } from "@/components/advertiser/bits";
import { NoteLine, SettingsCard, type Note } from "./parts";
import { accountService, LANGUAGES } from "@/services/account";

/**
 * The app's Language: five languages, each in its own script over its
 * English name, stored on the account (`PATCH /users/me { language }`) so
 * the choice follows the person to any device. It does not translate
 * anything yet, and the section says so rather than let a choice look like
 * it changed something it did not.
 */
export function LanguageSection({ saved, onChanged }: { saved: string; onChanged: () => void }) {
    const [choice, setChoice] = React.useState(saved || "en");
    const [busy, setBusy] = React.useState(false);
    const [note, setNote] = React.useState<Note>(null);

    const apply = async () => {
        if (choice === saved) return;
        setBusy(true);
        setNote(null);
        try {
            await accountService.updateProfile({ language: choice });
            setNote({ tone: "ok", text: "Saved to your account." });
            onChanged();
        } catch (caught) {
            setNote({ tone: "bad", text: messageOf(caught, "Could not save that.") });
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsCard id="language" title="Language" line="Stored on your account. ADX's own pages — here and in the app — are in English for now.">
            <div role="radiogroup" aria-label="Language" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {LANGUAGES.map((entry) => {
                    const on = entry.code === choice;
                    return (
                        <button
                            key={entry.code}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setChoice(entry.code)}
                            className={cn("flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors", on ? "border-brand-bright bg-[#fff7f7]" : "border-line bg-white hover:border-dim")}
                        >
                            <span>
                                <span className={cn("block text-sm", on ? "font-semibold text-brand" : "text-ink")}>{entry.native}</span>
                                <span className="block text-xs text-dim">{entry.english}</span>
                            </span>
                            {on && <Check className="size-4 text-brand" aria-hidden />}
                        </button>
                    );
                })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <NoteLine note={note} />
                <button type="button" onClick={() => void apply()} className={`${btnPrimary} ml-auto`} disabled={busy || choice === saved}>
                    {busy ? "Saving…" : "Apply"}
                </button>
            </div>
        </SettingsCard>
    );
}
