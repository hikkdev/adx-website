"use client";

import * as React from "react";
import { messageOf, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { btnPrimary, inputClass } from "@/components/advertiser/bits";
import { AvatarEditor } from "./avatar-editor";
import { FieldBlock, NoteLine, SettingsCard, type Note } from "./parts";
import { ADX_ID_LABEL, isoToday, isoYearsAgo, ORDER_AGE_HINT } from "@/services/party";
import { accountService, basicsPatch, dobInputValue, dobProblem, GENDERS, nameParts, type AccountProfile } from "@/services/account";

/**
 * Profile basics: the picture, the two names, the date of birth and the
 * gender — the same four facts the app's basics screen and My profile hold,
 * saved with `PATCH /users/me`. Any real date of birth is kept (29 Sep
 * 2026): 18 or over is asked only when an order is placed. The display name is composed by the server
 * from the two names, and the shell re-reads the session so it shows.
 * `names: false` leaves the names to a card beside it that already asks
 * them (the advertiser's designed Profile card), so they are never asked twice.
 */
export function ProfileBasics({
    profile,
    onChanged,
    names = true,
    id = "profile",
    title = "Profile",
    line,
}: {
    profile: AccountProfile;
    onChanged: () => void;
    names?: boolean;
    id?: string;
    title?: string;
    line?: React.ReactNode;
}) {
    const { refresh } = useAuth();
    const initial = React.useMemo(() => {
        const names = nameParts(profile);
        return { ...names, dateOfBirth: dobInputValue(profile.dateOfBirth), gender: profile.gender ?? "" };
    }, [profile]);
    const [form, setForm] = React.useState(initial);
    const [busy, setBusy] = React.useState(false);
    const [note, setNote] = React.useState<Note>(null);
    const [errors, setErrors] = React.useState<Record<string, string>>({});

    const patch = basicsPatch(initial, form);
    const changed = Object.keys(patch).length > 0;
    const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        const next: Record<string, string> = {};
        if (names && !form.firstName.trim()) next.firstName = "Your first name is needed.";
        const dob = dobProblem(form.dateOfBirth);
        if (dob) next.dateOfBirth = dob;
        setErrors(next);
        if (Object.keys(next).length || !changed) return;
        setBusy(true);
        setNote(null);
        try {
            await accountService.updateProfile(patch);
            setNote({ tone: "ok", text: "Saved." });
            onChanged();
            void refresh();
        } catch (caught) {
            const fields = caught instanceof ApiError ? caught.fieldErrors : {};
            setErrors(Object.fromEntries(Object.entries(fields).map(([key, list]) => [key, list[0] ?? "Check this field."])));
            setNote({ tone: "bad", text: messageOf(caught, "Could not save your details.") });
        } finally {
            setBusy(false);
        }
    };

    const firstError = errors.firstName ?? errors.lastName ?? errors.dateOfBirth ?? errors.gender;

    return (
        <SettingsCard id={id} title={title} line={line ?? (profile.displayId ? `${ADX_ID_LABEL} · ${profile.displayId}` : "Who you are on ADX")}>
            <AvatarEditor name={profile.name} avatarUrl={profile.avatarUrl} onChanged={() => {
                onChanged();
                void refresh();
            }} />
            <form onSubmit={(event) => void save(event)} className="mt-5 border-t border-line pt-5" noValidate>
                <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
                    {names && (
                        <>
                            <FieldBlock label="First name" htmlFor="basics-first">
                                <input id="basics-first" value={form.firstName} onChange={set("firstName")} maxLength={60} autoComplete="given-name" className={inputClass} aria-invalid={!!errors.firstName} />
                            </FieldBlock>
                            <FieldBlock label="Last name" htmlFor="basics-last">
                                <input id="basics-last" value={form.lastName} onChange={set("lastName")} maxLength={60} autoComplete="family-name" className={inputClass} aria-invalid={!!errors.lastName} />
                            </FieldBlock>
                        </>
                    )}
                    <FieldBlock label="Date of birth" htmlFor="basics-dob">
                        <input id="basics-dob" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} max={isoToday()} min={isoYearsAgo(120)} autoComplete="bday" className={inputClass} aria-invalid={!!errors.dateOfBirth} />
                    </FieldBlock>
                    <FieldBlock label="Gender" htmlFor="basics-gender">
                        <select id="basics-gender" value={form.gender} onChange={set("gender")} className={`${inputClass} appearance-none ${form.gender ? "" : "text-dim"}`}>
                            <option value="">Not said</option>
                            {GENDERS.map((gender) => (
                                <option key={gender.id} value={gender.id}>
                                    {gender.label}
                                </option>
                            ))}
                        </select>
                    </FieldBlock>
                </div>
                <p className="mt-3 text-xs text-dim">{ORDER_AGE_HINT} Your gender is asked, never required.</p>
                {firstError && (
                    <p role="alert" className="mt-2 text-xs text-danger">
                        {firstError}
                    </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <NoteLine note={note} />
                    <button type="submit" className={`${btnPrimary} ml-auto`} disabled={busy || !changed}>
                        {busy ? "Saving…" : "Save details"}
                    </button>
                </div>
            </form>
        </SettingsCard>
    );
}
