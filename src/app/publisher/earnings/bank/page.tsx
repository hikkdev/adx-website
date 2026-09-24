"use client";

import * as React from "react";
import Link from "next/link";
import { Landmark, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Chip, ErrorNote, Field, inputClass, Loading, outlineButton, StatusText } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { usePublisher } from "../../layout";
import { isValidIfsc, methodLine, methodStatus, publisherWorkspace, type IfscLookup, type PayoutMethod } from "@/services/publisher-workspace";

/**
 * DR 12 · 10 · 17 · Bank details (5204:91409): the payout account, which
 * one is primary, and "Update bank details" — a new account with the IFSC
 * looked up in the public directory, or a UPI id. The account number
 * never comes back whole: `•••• 4821` is all the server sends.
 */
export default function BankDetailsPage() {
    const me = usePublisher();
    const { data, error, loading, reload } = useLoad("methods", () => publisherWorkspace.methods());
    const [adding, setAdding] = React.useState(false);
    const [busy, setBusy] = React.useState<string | null>(null);

    const methods = data ?? [];
    const primary = methods.find((m) => m.isDefault) ?? methods[0] ?? null;

    const act = async (key: string, action: () => Promise<unknown>, done: string) => {
        setBusy(key);
        try {
            await action();
            toast.success(done);
            reload();
        } catch (caught) {
            toast.error(messageOf(caught, "That did not go through."));
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Bank details</h1>
            <p className="mt-1 text-sm text-dim">{me?.name ?? "Your account"} · Your payout account</p>

            <Panel className="mt-6">
                <CardTitle>Your payout account</CardTitle>
                {!data && loading && <Loading label="Loading your accounts…" />}
                {error && (
                    <div className="mt-3">
                        <ErrorNote message={error} onRetry={reload} />
                    </div>
                )}
                {data && methods.length === 0 && <p className="mt-2 text-sm text-dim">No payout account yet. Add the bank account or UPI id where you want your earnings sent.</p>}
                {methods.length > 0 && (
                    <ul className="mt-4 grid gap-3">
                        {methods.map((method) => (
                            <MethodRow key={method.id} method={method} busy={busy} onPrimary={() => act(`primary:${method.id}`, () => publisherWorkspace.setDefaultMethod(method.id), `${methodLine(method)} is now your primary account`)} onRemove={() => act(`remove:${method.id}`, () => publisherWorkspace.removeMethod(method.id), "Account removed")} />
                        ))}
                    </ul>
                )}
                {primary && (
                    <p className="mt-4 text-sm text-dim">
                        {methodLine(primary).replace(" · ", " ending ").replace("•••• ", "")} is the primary account for your publisher payouts.
                        {primary.status !== "VERIFIED" && " It is being verified — payouts go out once it is."}
                    </p>
                )}
                {!adding && (
                    <button type="button" onClick={() => setAdding(true)} className={cn(brandButton, "mt-5")}>
                        {methods.length === 0 ? "Add bank details" : "Update bank details"}
                    </button>
                )}
                {adding && (
                    <AddMethod
                        onCancel={() => setAdding(false)}
                        onAdded={() => {
                            setAdding(false);
                            reload();
                        }}
                    />
                )}
            </Panel>

            <Link href="/publisher/earnings" className="mt-6 inline-block text-sm text-dim underline underline-offset-4 hover:text-ink">
                Back to earnings
            </Link>
        </>
    );
}

function MethodRow({ method, busy, onPrimary, onRemove }: { method: PayoutMethod; busy: string | null; onPrimary: () => void; onRemove: () => void }) {
    const status = methodStatus(method.status);
    return (
        <li className="flex flex-wrap items-center gap-4 rounded-lg border border-line px-4 py-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">{method.type === "UPI" ? <Smartphone className="size-4" aria-hidden /> : <Landmark className="size-4" aria-hidden />}</span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{method.type === "UPI" ? "UPI" : (method.bankName ?? "Bank account")}</p>
                <p className="text-xs text-dim">
                    {method.type === "UPI" ? method.upiVpa : method.accountNumberMasked ?? "••••"}
                    {method.accountHolder ? ` · ${method.accountHolder}` : ""}
                    {method.bankBranch ? ` · ${method.bankBranch}` : ""}
                </p>
                {method.status === "REJECTED" && method.rejectionReason && <p className="mt-1 text-xs text-danger">{method.rejectionReason}</p>}
            </div>
            <StatusText tone={status.tone} className="text-xs">
                {status.label}
            </StatusText>
            {method.isDefault ? (
                <Chip tone="ink">Primary</Chip>
            ) : (
                <button type="button" onClick={onPrimary} disabled={busy !== null} className="text-xs font-semibold text-ink hover:underline disabled:opacity-50">
                    Make primary
                </button>
            )}
            {!method.isDefault && (
                <button type="button" onClick={onRemove} disabled={busy !== null} className="text-xs font-semibold text-danger hover:underline disabled:opacity-50">
                    Remove
                </button>
            )}
        </li>
    );
}

/** The new-account form: bank with an IFSC lookup, or a UPI id. `POST /payouts/methods`. */
function AddMethod({ onCancel, onAdded }: { onCancel: () => void; onAdded: () => void }) {
    const [type, setType] = React.useState<"BANK" | "UPI">("BANK");
    const [holder, setHolder] = React.useState("");
    const [bank, setBank] = React.useState("");
    const [number, setNumber] = React.useState("");
    const [confirmNumber, setConfirmNumber] = React.useState("");
    const [ifsc, setIfsc] = React.useState("");
    const [upi, setUpi] = React.useState("");
    const [lookup, setLookup] = React.useState<{ code: string; result: IfscLookup | null; note: string | null }>({ code: "", result: null, note: null });
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    const code = ifsc.trim().toUpperCase();
    React.useEffect(() => {
        if (!isValidIfsc(code) || lookup.code === code) return;
        let cancelled = false;
        publisherWorkspace
            .ifsc(code)
            .then((result) => {
                if (cancelled) return;
                setLookup({ code, result, note: result.found ? null : "No bank found for that IFSC. Check the code." });
                if (result.found && result.bank) setBank(result.bank);
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                setLookup({ code, result: null, note: caught instanceof ApiError && caught.status === 503 ? "The IFSC directory did not answer — type the bank's name yourself." : messageOf(caught, "Could not look up the IFSC.") });
            });
        return () => {
            cancelled = true;
        };
    }, [code, lookup.code]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setFailure(null);
        if (type === "BANK") {
            if (!holder.trim() || !bank.trim() || !number.trim() || !code) return setFailure("Fill in the account holder, bank, account number and IFSC.");
            if (number.trim().length < 8) return setFailure("The account number looks too short.");
            if (number.trim() !== confirmNumber.trim()) return setFailure("The account numbers do not match.");
            if (!isValidIfsc(code)) return setFailure("An IFSC is eleven characters: four letters, a zero, then six letters or digits.");
        } else if (!/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(upi.trim())) {
            return setFailure("That does not look like a UPI id (name@bank).");
        }
        setBusy(true);
        try {
            await publisherWorkspace.addMethod(type === "BANK" ? { type, accountHolder: holder.trim(), bankName: bank.trim(), accountNumber: number.trim(), ifscCode: code } : { type, upiVpa: upi.trim() });
            toast.success("Payout account added. ADX verifies it before the first payout.");
            onAdded();
        } catch (caught) {
            setFailure(messageOf(caught, "Could not add the account."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-5 rounded-lg bg-ground p-5">
            <div role="tablist" aria-label="Account type" className="inline-flex rounded-md border border-line bg-white p-0.5">
                {(["BANK", "UPI"] as const).map((option) => (
                    <button key={option} type="button" role="tab" aria-selected={type === option} onClick={() => setType(option)} className={cn("h-8 rounded-[5px] px-4 text-sm", type === option ? "bg-ink font-semibold text-white" : "text-ink")}>
                        {option === "BANK" ? "Bank account" : "UPI"}
                    </button>
                ))}
            </div>
            {type === "BANK" ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="Account holder" htmlFor="m-holder">
                        <input id="m-holder" value={holder} onChange={(e) => setHolder(e.target.value)} className={inputClass} placeholder="As printed on the account" autoComplete="name" />
                    </Field>
                    <Field label="IFSC" htmlFor="m-ifsc">
                        <input id="m-ifsc" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} className={inputClass} placeholder="HDFC0001234" maxLength={11} autoComplete="off" />
                    </Field>
                    <Field label="Bank" htmlFor="m-bank" hint={lookup.result?.found ? "from the IFSC" : undefined}>
                        <input id="m-bank" value={bank} onChange={(e) => setBank(e.target.value)} className={inputClass} placeholder="Filled in from the IFSC" />
                    </Field>
                    <Field label="Branch" htmlFor="m-branch">
                        <input id="m-branch" value={lookup.result?.found ? [lookup.result.branch, lookup.result.city].filter(Boolean).join(", ") : ""} readOnly className={inputClass} placeholder="From the IFSC directory" />
                    </Field>
                    <Field label="Account number" htmlFor="m-number">
                        <input id="m-number" value={number} onChange={(e) => setNumber(e.target.value.replace(/\s/g, ""))} className={inputClass} inputMode="numeric" autoComplete="off" />
                    </Field>
                    <Field label="Confirm account number" htmlFor="m-confirm">
                        <input id="m-confirm" value={confirmNumber} onChange={(e) => setConfirmNumber(e.target.value.replace(/\s/g, ""))} className={inputClass} inputMode="numeric" autoComplete="off" />
                    </Field>
                </div>
            ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="UPI id" htmlFor="m-upi">
                        <input id="m-upi" value={upi} onChange={(e) => setUpi(e.target.value)} className={inputClass} placeholder="name@bank" autoComplete="off" />
                    </Field>
                </div>
            )}
            {lookup.note && <p className="mt-3 text-xs text-warning">{lookup.note}</p>}
            {failure && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {failure}
                </p>
            )}
            <p className="mt-3 text-xs text-dim">ADX verifies a new account before the first payout to it. The account number is stored masked.</p>
            <div className="mt-4 flex flex-wrap gap-3">
                <button type="submit" disabled={busy} className={brandButton}>
                    {busy ? "Saving…" : "Save account"}
                </button>
                <button type="button" onClick={onCancel} className={outlineButton}>
                    Cancel
                </button>
            </div>
        </form>
    );
}
