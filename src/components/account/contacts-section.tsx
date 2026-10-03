"use client";

import * as React from "react";
import { Mail, Plus, Smartphone } from "lucide-react";
import { messageOf, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { btnSmall, inputClass, StatusChip } from "@/components/advertiser/bits";
import { EMAIL_CODE_LENGTH, normaliseCode } from "@/services/auth";
import { codeInputClass, ConfirmDialog, FieldBlock, NoteLine, SettingsCard, type Note } from "./parts";
import { accountService, contactHint, digitsOf, e164, isContactTaken, isEmail, makePrimaryBody, type ContactKind, type ContactsView, type UserContact } from "@/services/account";

/**
 * K-M on the web — Emails & phone numbers (`GET /users/me/contacts`). The
 * primary pair on top: the number is the sign-in identity and changes only
 * through the two-code change below; the email is where notices go and, on
 * the web, changes only through its 8-letter code. Under them every other
 * number or address the account answers to: verify with a code sent to it,
 * make a verified one the primary (a number swap signs every device out),
 * or remove it. One value belongs to one account (409 CONTACT_TAKEN).
 */
export function ContactsSection({ onChanged, onChangePhone }: { onChanged: () => void; onChangePhone: () => void }) {
    const { user, signOut } = useAuth();
    const [view, setView] = React.useState<ContactsView | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [note, setNote] = React.useState<Note>(null);
    const [adding, setAdding] = React.useState<ContactKind | null>(null);
    /** The contact just added: its code field opens at once, pre-filled outside production. */
    const [fresh, setFresh] = React.useState<{ id: string; devOtp: string } | null>(null);
    const [confirm, setConfirm] = React.useState<{ kind: "PRIMARY" | "REMOVE"; contact: UserContact } | null>(null);
    const [confirmError, setConfirmError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const load = React.useCallback(async () => {
        try {
            setView(await accountService.contacts());
            setError(null);
        } catch (caught) {
            setError(messageOf(caught, "Could not read your contacts."));
        }
    }, []);

    React.useEffect(() => {
        let cancelled = false;
        accountService
            .contacts()
            .then((next) => {
                if (!cancelled) setView(next);
            })
            .catch((caught: unknown) => {
                if (!cancelled) setError(messageOf(caught, "Could not read your contacts."));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const act = async () => {
        if (!confirm) return;
        setBusy(true);
        setConfirmError(null);
        try {
            if (confirm.kind === "REMOVE") {
                await accountService.removeContact(confirm.contact.id);
                setNote({ tone: "ok", text: `${confirm.contact.value} was removed.` });
            } else {
                const change = await accountService.makeContactPrimary(confirm.contact.id);
                if (change.sessionsRevoked) {
                    /* A number swap ended every session, this one included: signing in with the new number is the proof it took. */
                    await signOut();
                    return;
                }
                setNote({ tone: "ok", text: `${change.after} is now your primary ${confirm.contact.kind === "EMAIL" ? "email" : "number"}.` });
                onChanged();
            }
            setConfirm(null);
            await load();
        } catch (caught) {
            setConfirmError(isContactTaken(caught) ? "That one is already on another ADX account." : messageOf(caught, "That did not go through."));
        } finally {
            setBusy(false);
        }
    };

    if (!view) {
        return (
            <SettingsCard id="contacts" title="Email & contacts">
                <p className="text-sm text-dim">{error ?? "Loading your contacts…"}</p>
            </SettingsCard>
        );
    }

    const { primary, contacts } = view;

    return (
        <SettingsCard id="contacts" title="Email & contacts" line="Your sign-in number, your email, and the others you answer to">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Primary</p>
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                <li className="flex items-center gap-3 px-3 py-3">
                    <Smartphone className="size-4 shrink-0 text-dim" aria-hidden />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{primary.mobile || "—"}</p>
                        <p className="text-xs text-dim">Sign-in number · {primary.mobileVerifiedAt ? "verified" : "not verified"}</p>
                    </div>
                    <button type="button" onClick={onChangePhone} className={btnSmall}>
                        Change
                    </button>
                </li>
                <PrimaryEmailRow
                    email={primary.email}
                    verified={primary.emailVerified}
                    onProved={() => {
                        setNote({ tone: "ok", text: "Email verified. Notices and receipts go there now." });
                        onChanged();
                        void load();
                    }}
                />
            </ul>

            <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-dim">Other contacts</p>
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                {contacts.length === 0 && <li className="px-3 py-3 text-sm text-dim">No other numbers or addresses yet.</li>}
                {contacts.map((contact) => (
                    <ContactRow
                        key={contact.id}
                        contact={contact}
                        selfId={user?.id}
                        startOpen={fresh?.id === contact.id}
                        initialCode={fresh?.id === contact.id ? fresh.devOtp : ""}
                        onVerified={(row) => {
                            setView((current) => (current ? { ...current, contacts: current.contacts.map((c) => (c.id === row.id ? { ...c, ...row } : c)) } : current));
                            setNote({ tone: "ok", text: `${contact.value} is verified.` });
                        }}
                        onPrimary={() => {
                            setConfirmError(null);
                            setConfirm({ kind: "PRIMARY", contact });
                        }}
                        onRemove={() => {
                            setConfirmError(null);
                            setConfirm({ kind: "REMOVE", contact });
                        }}
                    />
                ))}
                {adding ? (
                    <li className="px-3 py-3">
                        <AddContactForm
                            kind={adding}
                            onCancel={() => setAdding(null)}
                            onAdded={(row, devOtp) => {
                                setAdding(null);
                                setFresh({ id: row.id, devOtp });
                                setView((current) => (current ? { ...current, contacts: [...current.contacts, row] } : current));
                                setNote({ tone: "info", text: `Added. Enter the code sent to ${row.value} to verify it.` });
                            }}
                        />
                    </li>
                ) : (
                    <li className="flex flex-wrap gap-2 px-3 py-3">
                        <button type="button" onClick={() => setAdding("EMAIL")} className={`${btnSmall} gap-1.5`}>
                            <Plus className="size-4" aria-hidden /> Add email
                        </button>
                        <button type="button" onClick={() => setAdding("PHONE")} className={`${btnSmall} gap-1.5`}>
                            <Plus className="size-4" aria-hidden /> Add phone number
                        </button>
                    </li>
                )}
            </ul>

            <p className="mt-4 text-xs text-dim">Your sign-in number and your email are the primary pair. A number or address here is verified with a code sent to it, and a verified one can be made the primary. One number or address belongs to one ADX account.</p>
            <NoteLine note={note} className="mt-2" />
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}

            <ConfirmDialog
                open={confirm !== null}
                title={confirm?.kind === "REMOVE" ? "Remove this contact?" : confirm?.contact.kind === "PHONE" ? "Make this your sign-in number?" : "Make this your primary email?"}
                body={confirm ? (confirm.kind === "REMOVE" ? `${confirm.contact.value} is taken off your account. It can be added and verified again any time.` : makePrimaryBody(confirm.contact, primary)) : undefined}
                confirmLabel={confirm?.kind === "REMOVE" ? "Remove" : confirm?.contact.kind === "PHONE" ? "Make primary and sign out" : "Make primary"}
                cancelLabel={confirm?.kind === "REMOVE" ? "Keep it" : "Cancel"}
                tone={confirm?.kind === "REMOVE" || confirm?.contact.kind === "PHONE" ? "danger" : undefined}
                busy={busy}
                error={confirmError}
                onConfirm={() => void act()}
                onClose={() => setConfirm(null)}
            />
        </SettingsCard>
    );
}

/** The primary email: shown with its state, changed only through a code sent to the new address. */
function PrimaryEmailRow({ email, verified, onProved }: { email: string | null; verified: boolean; onProved: () => void }) {
    const [open, setOpen] = React.useState(false);
    const [value, setValue] = React.useState(email ?? "");
    const [sent, setSent] = React.useState<string | null>(null);
    const [code, setCode] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const send = async () => {
        if (!isEmail(value)) return setError("Enter the whole email address.");
        setBusy(true);
        setError(null);
        try {
            const answer = await accountService.sendEmailCode(value.trim().toLowerCase());
            setSent(answer.email ?? value.trim().toLowerCase());
            setCode(answer.devOtp ?? "");
        } catch (caught) {
            setError(isContactTaken(caught) ? "That address is already on another ADX account." : caught instanceof ApiError && caught.code === "ALREADY_VERIFIED" ? "That address is already your verified email." : messageOf(caught, "Could not send the code."));
        } finally {
            setBusy(false);
        }
    };

    const verify = async () => {
        if (!sent) return;
        setBusy(true);
        setError(null);
        try {
            await accountService.verifyEmail(sent, code.trim());
            setOpen(false);
            setSent(null);
            setCode("");
            onProved();
        } catch (caught) {
            setError(messageOf(caught, "That code did not match."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <li className="px-3 py-3">
            <div className="flex items-center gap-3">
                <Mail className="size-4 shrink-0 text-dim" aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{email ?? "No email yet"}</p>
                    <p className="text-xs text-dim">{email ? `Where notices go · ${verified ? "verified" : "not verified"}` : "Where notices and receipts would go"}</p>
                </div>
                {email && verified && <StatusChip label="Verified" tone="success" />}
                {!open && (
                    <button type="button" onClick={() => setOpen(true)} className={btnSmall}>
                        {email ? (verified ? "Change" : "Verify") : "Add"}
                    </button>
                )}
            </div>
            {open && (
                <div className="mt-3 grid gap-3 border-t border-line pt-3">
                    {!sent ? (
                        <>
                            <FieldBlock label="Email address" htmlFor="primary-email">
                                <input id="primary-email" type="email" value={value} onChange={(event) => setValue(event.target.value)} placeholder="name@example.in" autoComplete="email" className={inputClass} />
                            </FieldBlock>
                            <p className="text-xs text-dim">We send an {EMAIL_CODE_LENGTH}-letter code to it; the address changes only once the code comes back.</p>
                        </>
                    ) : (
                        <FieldBlock label={`The ${EMAIL_CODE_LENGTH}-letter code sent to ${sent}`} htmlFor="primary-email-code">
                            <input
                                id="primary-email-code"
                                value={code}
                                onChange={(event) => setCode(normaliseCode(event.target.value, "email").slice(0, EMAIL_CODE_LENGTH))}
                                autoComplete="one-time-code"
                                autoCapitalize="characters"
                                spellCheck={false}
                                placeholder={`${EMAIL_CODE_LENGTH} letters`}
                                className={codeInputClass}
                            />
                        </FieldBlock>
                    )}
                    {error && (
                        <p role="alert" className="text-xs text-danger">
                            {error}
                        </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                setSent(null);
                                setError(null);
                            }}
                            className={btnSmall}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                        {sent && (
                            <button type="button" onClick={() => void send()} className={btnSmall} disabled={busy}>
                                Send again
                            </button>
                        )}
                        {sent ? (
                            <button type="button" onClick={() => void verify()} className={`${btnSmall} border-brand bg-brand text-white hover:border-brand hover:bg-[#a51b1b]`} disabled={busy || code.length !== EMAIL_CODE_LENGTH}>
                                {busy ? "Checking…" : "Confirm"}
                            </button>
                        ) : (
                            <button type="button" onClick={() => void send()} className={`${btnSmall} border-brand bg-brand text-white hover:border-brand hover:bg-[#a51b1b]`} disabled={busy || !isEmail(value)}>
                                {busy ? "Sending…" : "Send code"}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </li>
    );
}

/** One other contact: verify it with a code, make it the primary once verified, or remove it. */
function ContactRow({
    contact,
    selfId,
    startOpen,
    initialCode,
    onVerified,
    onPrimary,
    onRemove,
}: {
    contact: UserContact;
    selfId: string | undefined;
    startOpen: boolean;
    initialCode: string;
    onVerified: (row: UserContact) => void;
    onPrimary: () => void;
    onRemove: () => void;
}) {
    const [codeOpen, setCodeOpen] = React.useState(startOpen && !contact.verifiedAt);
    const [code, setCode] = React.useState(initialCode);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const channel = contact.kind === "EMAIL" ? "email" : "mobile";
    const length = contact.kind === "EMAIL" ? EMAIL_CODE_LENGTH : 6;

    const send = async () => {
        setBusy(true);
        setError(null);
        try {
            const answer = await accountService.sendContactCode(contact.id);
            setCode(answer.devOtp ?? "");
            setCodeOpen(true);
        } catch (caught) {
            setError(caught instanceof ApiError && caught.code === "ALREADY_VERIFIED" ? "It is already verified." : messageOf(caught, "Could not send the code."));
        } finally {
            setBusy(false);
        }
    };

    const verify = async () => {
        if (code.length < 4) return setError(`Enter the code sent to ${contact.value}.`);
        setBusy(true);
        setError(null);
        try {
            const row = await accountService.verifyContact(contact.id, code);
            setCodeOpen(false);
            setCode("");
            onVerified(row);
        } catch (caught) {
            setError(messageOf(caught, "That code did not work."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <li className="px-3 py-3">
            <div className="flex flex-wrap items-center gap-3">
                {contact.kind === "EMAIL" ? <Mail className="size-4 shrink-0 text-dim" aria-hidden /> : <Smartphone className="size-4 shrink-0 text-dim" aria-hidden />}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{contact.value}</p>
                    <p className="text-xs text-dim">{contactHint(contact, selfId)}</p>
                </div>
                {contact.verifiedAt ? <StatusChip label="Verified" tone="success" /> : null}
                <div className="flex gap-2">
                    {contact.verifiedAt ? (
                        <button type="button" onClick={onPrimary} className={btnSmall}>
                            Make primary
                        </button>
                    ) : (
                        !codeOpen && (
                            <button type="button" onClick={() => void send()} className={btnSmall} disabled={busy}>
                                {busy ? "Sending…" : "Verify"}
                            </button>
                        )
                    )}
                    <button type="button" onClick={onRemove} className={`${btnSmall} text-danger`}>
                        Remove
                    </button>
                </div>
            </div>
            {codeOpen && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                    <FieldBlock label={`Code sent to ${contact.value}`} htmlFor={`code-${contact.id}`} className="min-w-[200px] flex-1">
                        <input
                            id={`code-${contact.id}`}
                            value={code}
                            onChange={(event) => setCode(normaliseCode(event.target.value, channel).slice(0, length))}
                            inputMode={channel === "mobile" ? "numeric" : "text"}
                            autoComplete="one-time-code"
                            spellCheck={false}
                            placeholder={contact.kind === "EMAIL" ? `${EMAIL_CODE_LENGTH} letters` : "6 digits"}
                            className={codeInputClass}
                        />
                    </FieldBlock>
                    <button type="button" onClick={() => void send()} className={btnSmall} disabled={busy}>
                        Send again
                    </button>
                    <button type="button" onClick={() => void verify()} className={`${btnSmall} border-brand bg-brand text-white hover:border-brand hover:bg-[#a51b1b]`} disabled={busy}>
                        {busy ? "Checking…" : "Verify"}
                    </button>
                </div>
            )}
            {error && (
                <p role="alert" className="mt-2 text-xs text-danger">
                    {error}
                </p>
            )}
        </li>
    );
}

/** Add an email or a number, with an optional label; a code is sent to it straight after. */
function AddContactForm({ kind, onCancel, onAdded }: { kind: ContactKind; onCancel: () => void; onAdded: (row: UserContact, devOtp: string) => void }) {
    const [value, setValue] = React.useState("");
    const [label, setLabel] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        if (kind === "EMAIL" && !isEmail(value)) return setError("Enter the whole email address.");
        if (kind === "PHONE" && digitsOf(value).length < 10) return setError("Enter the full ten-digit number.");
        setBusy(true);
        setError(null);
        try {
            const created = await accountService.addContact({ kind, value: kind === "PHONE" ? e164(value) : value.trim().toLowerCase(), ...(label.trim() ? { label: label.trim() } : {}) });
            /* Straight on to the code: a contact is not much use until it is verified. */
            let devOtp = "";
            try {
                devOtp = (await accountService.sendContactCode(created.id)).devOtp ?? "";
            } catch {
                /* The row's "Send again" asks once more. */
            }
            onAdded(created, devOtp);
        } catch (caught) {
            setError(isContactTaken(caught) ? "That one is already on another ADX account." : messageOf(caught, "Could not add it."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={(event) => void add(event)} className="grid gap-3" noValidate>
            <div className="grid gap-3 md:grid-cols-2">
                <FieldBlock label={kind === "EMAIL" ? "Email address" : "Phone number"} htmlFor="add-contact-value">
                    <input
                        id="add-contact-value"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        type={kind === "EMAIL" ? "email" : "tel"}
                        inputMode={kind === "EMAIL" ? "email" : "tel"}
                        placeholder={kind === "EMAIL" ? "name@example.in" : "+91 98765 43210"}
                        className={inputClass}
                        autoFocus
                    />
                </FieldBlock>
                <FieldBlock label="Label (optional)" htmlFor="add-contact-label">
                    <input id="add-contact-label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={60} placeholder="Work, home, office…" className={inputClass} />
                </FieldBlock>
            </div>
            <p className="text-xs text-dim">A code is sent to it next, to prove it is yours.</p>
            {error && (
                <p role="alert" className="text-xs text-danger">
                    {error}
                </p>
            )}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className={btnSmall} disabled={busy}>
                    Cancel
                </button>
                <button type="submit" className={`${btnSmall} border-brand bg-brand text-white hover:border-brand hover:bg-[#a51b1b]`} disabled={busy}>
                    {busy ? "Adding…" : "Add and send code"}
                </button>
            </div>
        </form>
    );
}
