"use client";

import * as React from "react";
import { toast } from "sonner";
import { brandButton, Field, inputClass, outlineButton } from "@/components/publisher/parts";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { isValidIfsc, type IfscLookup, type PayoutMethod } from "@/services/publisher-workspace";
import { partnerMessage, partnerService } from "@/services/partner";

/**
 * A bank account (with the IFSC looked up in the public directory) or a UPI
 * ID, in the shop's name — `POST /print-partners/me/payout-methods`. It
 * lands PENDING_VERIFICATION like everyone's; ADX checks it before a
 * withdrawal can use it.
 */
export function AddPayoutMethod({ onCancel, onAdded }: { onCancel: () => void; onAdded: (method: PayoutMethod) => void }) {
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
        partnerService
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
            return setFailure("That does not look like a UPI ID (name@bank).");
        }
        setBusy(true);
        try {
            const method = await partnerService.addPayoutMethod(type === "BANK" ? { type, accountHolder: holder.trim(), bankName: bank.trim(), accountNumber: number.trim(), ifscCode: code } : { type, upiVpa: upi.trim() });
            toast.success("Payout method added. ADX checks it before the first withdrawal to it.");
            onAdded(method);
        } catch (caught) {
            setFailure(partnerMessage(caught, "Could not add the payout method."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <div role="tablist" aria-label="Kind of payout method" className="inline-flex rounded-md border border-line bg-white p-0.5">
                {(["BANK", "UPI"] as const).map((option) => (
                    <button key={option} type="button" role="tab" aria-selected={type === option} onClick={() => setType(option)} className={cn("h-8 rounded-[5px] px-4 text-sm", type === option ? "bg-ink font-semibold text-white" : "text-ink")}>
                        {option === "BANK" ? "Bank account" : "UPI"}
                    </button>
                ))}
            </div>
            {type === "BANK" ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="Account holder" htmlFor="pm-holder">
                        <input id="pm-holder" value={holder} onChange={(e) => setHolder(e.target.value)} className={inputClass} placeholder="The shop's name, as on the account" autoComplete="name" />
                    </Field>
                    <Field label="IFSC" htmlFor="pm-ifsc">
                        <input id="pm-ifsc" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} className={inputClass} placeholder="HDFC0001234" maxLength={11} autoComplete="off" />
                    </Field>
                    <Field label="Bank" htmlFor="pm-bank">
                        <input id="pm-bank" value={bank} onChange={(e) => setBank(e.target.value)} className={inputClass} placeholder="Filled in from the IFSC" />
                    </Field>
                    <Field label="Branch" htmlFor="pm-branch">
                        <input id="pm-branch" value={lookup.result?.found ? [lookup.result.branch, lookup.result.city].filter(Boolean).join(", ") : ""} readOnly className={inputClass} placeholder="From the IFSC directory" />
                    </Field>
                    <Field label="Account number" htmlFor="pm-number">
                        <input id="pm-number" value={number} onChange={(e) => setNumber(e.target.value.replace(/\s/g, ""))} className={inputClass} inputMode="numeric" autoComplete="off" />
                    </Field>
                    <Field label="Confirm account number" htmlFor="pm-confirm">
                        <input id="pm-confirm" value={confirmNumber} onChange={(e) => setConfirmNumber(e.target.value.replace(/\s/g, ""))} className={inputClass} inputMode="numeric" autoComplete="off" />
                    </Field>
                </div>
            ) : (
                <div className="mt-4 grid gap-4">
                    <Field label="UPI ID" htmlFor="pm-upi">
                        <input id="pm-upi" value={upi} onChange={(e) => setUpi(e.target.value)} className={inputClass} placeholder="shop@bank" autoComplete="off" />
                    </Field>
                </div>
            )}
            {lookup.note && <p className="mt-3 text-xs text-warning">{lookup.note}</p>}
            {failure && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {failure}
                </p>
            )}
            <p className="mt-3 text-xs text-dim">The account number is stored masked; ADX never shows it whole again.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={onCancel} className={outlineButton}>
                    Cancel
                </button>
                <button type="submit" disabled={busy} className={brandButton}>
                    {busy ? "Saving…" : "Save payout method"}
                </button>
            </div>
        </form>
    );
}
