"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { btnOutline, btnPrimary, inputClass } from "@/components/advertiser/bits";
import { normaliseCode } from "@/services/auth";
import { codeInputClass, FieldBlock, SettingsCard } from "./parts";
import { accountService, digitsOf, e164, type ChangePhoneStage } from "@/services/account";

/**
 * The app's Change phone number (Lot D, Q58): two codes, in order.
 * `POST /auth/change-mobile/start` sends the first to the number the account
 * has now — proof that whoever holds this session still holds that number —
 * `confirm-old` takes it and sends the second to the new number, and
 * `verify` takes that one, moves the identity and signs every device out,
 * this one included. Signing in with the new number is the proof it took.
 */
export function ChangePhone({ currentMobile, open, onOpenChange }: { currentMobile: string; open: boolean; onOpenChange: (open: boolean) => void }) {
    const { signOut } = useAuth();
    const [stage, setStage] = React.useState<ChangePhoneStage>("number");
    const [next, setNext] = React.useState("");
    const [oldCode, setOldCode] = React.useState("");
    const [code, setCode] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [done, setDone] = React.useState<string | null>(null);

    const newMobile = e164(next);

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        if (digitsOf(next).length < 10) return setError("Enter the full ten-digit number.");
        setBusy(true);
        setError(null);
        try {
            const answer = await accountService.startMobileChange(newMobile);
            setOldCode(answer.devOtp ?? "");
            setCode("");
            setStage("old-code");
        } catch (caught) {
            setError(messageOf(caught, "Could not send the code."));
        } finally {
            setBusy(false);
        }
    };

    const confirmOld = async (event: React.FormEvent) => {
        event.preventDefault();
        if (oldCode.length < 4) return setError("Enter the code sent to your current number.");
        setBusy(true);
        setError(null);
        try {
            const answer = await accountService.confirmOldMobile(newMobile, oldCode);
            setCode(answer.devOtp ?? "");
            setStage("new-code");
        } catch (caught) {
            setError(messageOf(caught, "That code did not work."));
        } finally {
            setBusy(false);
        }
    };

    const verify = async (event: React.FormEvent) => {
        event.preventDefault();
        if (code.length < 4) return setError("Enter the code sent to the new number.");
        setBusy(true);
        setError(null);
        try {
            const result = await accountService.verifyMobileChange(newMobile, code);
            setDone(result.mobile ?? newMobile);
            setStage("done");
        } catch (caught) {
            setError(messageOf(caught, "That code did not work."));
        } finally {
            setBusy(false);
        }
    };

    const restart = () => {
        setStage("number");
        setOldCode("");
        setCode("");
        setError(null);
    };

    if (stage === "done") {
        return (
            <SettingsCard id="phone" title="Change phone number">
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <CheckCircle2 className="size-10 text-success" aria-hidden />
                    <p className="text-base font-semibold text-ink">Your number is now {done}</p>
                    <p className="max-w-md text-sm text-dim">Every device has been signed out, this one included. Sign in again with the new number.</p>
                    <button type="button" onClick={() => void signOut()} className={btnPrimary}>
                        Sign in again
                    </button>
                </div>
            </SettingsCard>
        );
    }

    return (
        <SettingsCard
            id="phone"
            title="Change phone number"
            line="The number you sign in with"
            actions={
                !open ? (
                    <button type="button" onClick={() => onOpenChange(true)} className={btnOutline}>
                        Change number
                    </button>
                ) : undefined
            }
        >
            <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
                <FieldBlock label="Current number">
                    <input value={currentMobile || "—"} readOnly disabled className={inputClass} />
                </FieldBlock>
                <FieldBlock label="New number" htmlFor="new-mobile">
                    <div className="flex">
                        <span className="flex h-10 items-center rounded-l-md border border-r-0 border-line bg-ground px-3 text-sm text-dim">+91</span>
                        <input
                            id="new-mobile"
                            value={next}
                            onChange={(event) => setNext(event.target.value.replace(/[^\d\s+]/g, "").slice(0, 14))}
                            inputMode="tel"
                            autoComplete="tel-national"
                            placeholder="98765 43210"
                            disabled={!open || stage !== "number"}
                            className={`${inputClass} rounded-l-none`}
                        />
                    </div>
                </FieldBlock>
            </div>

            {open && stage === "old-code" && (
                <form onSubmit={(event) => void confirmOld(event)} className="mt-5 border-t border-line pt-5">
                    <FieldBlock label={`Code sent to your current number ${currentMobile}`} htmlFor="old-code">
                        <input id="old-code" value={oldCode} onChange={(event) => setOldCode(normaliseCode(event.target.value, "mobile").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" className={`${codeInputClass} max-w-[240px]`} autoFocus />
                    </FieldBlock>
                    <p className="mt-2 text-xs text-dim">This proves the number you have now is still yours. The new number gets its own code next.</p>
                    <Actions busy={busy} primary="Confirm current number" onRestart={restart} />
                </form>
            )}

            {open && stage === "new-code" && (
                <form onSubmit={(event) => void verify(event)} className="mt-5 border-t border-line pt-5">
                    <FieldBlock label={`Code sent to ${newMobile}`} htmlFor="new-code">
                        <input id="new-code" value={code} onChange={(event) => setCode(normaliseCode(event.target.value, "mobile").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" className={`${codeInputClass} max-w-[240px]`} autoFocus />
                    </FieldBlock>
                    <Actions busy={busy} primary="Confirm and sign out" onRestart={restart} />
                </form>
            )}

            {open && stage === "number" && (
                <form onSubmit={(event) => void send(event)} className="mt-4 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => onOpenChange(false)} className={btnOutline} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className={btnPrimary} disabled={busy || digitsOf(next).length < 10}>
                        {busy ? "Sending…" : "Send the first code"}
                    </button>
                </form>
            )}

            {error && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                </p>
            )}
            <p className="mt-4 text-xs text-dim">
                Two codes: the first goes to your current number, the second to the new one. When both are confirmed, every device is signed out and you sign in again with the new number. Your earnings, wallet and payouts follow your account, not your number — but a UPI ID that contains the old number is yours to update in your payout methods.
            </p>
        </SettingsCard>
    );
}

function Actions({ busy, primary, onRestart }: { busy: boolean; primary: string; onRestart: () => void }) {
    return (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onRestart} className={btnOutline} disabled={busy}>
                Use a different number
            </button>
            <button type="submit" className={btnPrimary} disabled={busy}>
                {busy ? "Checking…" : primary}
            </button>
        </div>
    );
}
