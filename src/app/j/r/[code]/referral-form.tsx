"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpDown, CheckCircle2, Map as MapIcon } from "lucide-react";
import { primaryButton } from "@/components/auth/auth-card";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { referralService, type ReferralInput } from "@/services/party";

const field = "mt-1.5 h-12 w-full rounded-md border border-line bg-white px-4 text-sm text-ink focus:border-ink focus:outline-none";

/** The referral link's form: the side, the business, a number to call. Nothing is created until ADX has spoken to them. */
export function ReferralForm({ code }: { code: string }) {
    const [form, setForm] = React.useState<ReferralInput>({ side: "ADVERTISER", businessName: "", contactName: "", phone: "", city: "", message: "", website: "" });
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [done, setDone] = React.useState(false);
    const set = (patch: Partial<ReferralInput>) => setForm((current) => ({ ...current, ...patch }));
    const ready = form.businessName.trim().length > 0 && form.phone.replace(/\D/g, "").length >= 10;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            await referralService.submit(code, form);
            setDone(true);
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 404 ? "This referral link is not in use any more. You can still sign up yourself." : messageOf(caught, "Could not send your details. Try again."));
        } finally {
            setBusy(false);
        }
    };

    if (done) {
        return (
            <div className="mx-auto flex min-h-[60vh] max-w-[520px] flex-col items-center justify-center px-5 py-16 text-center">
                <CheckCircle2 className="size-10 text-success" aria-hidden />
                <h1 className="mt-4 text-[28px] font-semibold text-ink">Thanks — ADX will call you</h1>
                <p className="mt-1.5 text-dim">Someone from ADX will ring {form.phone.trim()} to get you started. You can also sign up now yourself.</p>
                <Link href="/sign-in" className="mt-6 inline-block rounded bg-brand px-6 py-2.5 text-sm font-medium text-white">
                    Sign up now
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[560px] px-6 pb-20 pt-14">
            <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">Someone thinks you should be on ADX</h1>
            <p className="mt-2 text-[16px] text-dim">ADX is where India&apos;s advertising spaces are listed and booked. Tell us a little about your business and we will call you to get started.</p>

            <form onSubmit={submit} className="mt-8 rounded-lg border border-line bg-white p-6 shadow-card">
                <p className="text-sm font-semibold text-ink">You want to</p>
                <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Side">
                    {(
                        [
                            { value: "ADVERTISER", label: "Advertise", icon: ArrowUpDown },
                            { value: "PUBLISHER", label: "List my space", icon: MapIcon },
                        ] as const
                    ).map((option) => (
                        <button key={option.value} type="button" role="radio" aria-checked={form.side === option.value} onClick={() => set({ side: option.value })} className={cn("flex h-[52px] items-center gap-3 rounded-md border bg-white px-5 text-sm font-semibold text-ink hover:border-ink", form.side === option.value ? "border-ink" : "border-line")}>
                            <option.icon className="size-[18px]" aria-hidden />
                            {option.label}
                        </button>
                    ))}
                </div>
                <label className="mt-5 block text-sm">
                    <span className="font-medium text-ink">Business name</span>
                    <input value={form.businessName} onChange={(event) => set({ businessName: event.target.value })} maxLength={160} className={field} />
                </label>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                        <span className="font-medium text-ink">Your name</span>
                        <input value={form.contactName ?? ""} onChange={(event) => set({ contactName: event.target.value })} maxLength={120} autoComplete="name" className={field} />
                    </label>
                    <label className="block text-sm">
                        <span className="font-medium text-ink">Mobile number</span>
                        <input type="tel" value={form.phone} onChange={(event) => set({ phone: event.target.value })} maxLength={20} autoComplete="tel" placeholder="98765 43210" className={field} />
                    </label>
                </div>
                <label className="mt-4 block text-sm">
                    <span className="font-medium text-ink">City</span>
                    <input value={form.city ?? ""} onChange={(event) => set({ city: event.target.value })} maxLength={80} autoComplete="address-level2" className={field} />
                </label>
                <label className="mt-4 block text-sm">
                    <span className="font-medium text-ink">Anything we should know (optional)</span>
                    <textarea value={form.message ?? ""} onChange={(event) => set({ message: event.target.value })} maxLength={500} rows={3} className="mt-1.5 w-full rounded-md border border-line px-4 py-3 text-sm text-ink focus:border-ink focus:outline-none" />
                </label>
                {/* The honeypot: a person never sees it, so a person never fills it. */}
                <input tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" value={form.website} onChange={(event) => set({ website: event.target.value })} name="website" />
                {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
                <button type="submit" disabled={!ready || busy} className={`${primaryButton} mt-6`}>
                    {busy ? "Sending…" : "Ask ADX to call me"}
                </button>
                <p className="mt-3 text-xs text-dim">
                    We use your number only to call you about ADX. See the <Link href="/legal/PRIVACY_POLICY" className="text-ink underline underline-offset-2">Privacy policy</Link>.
                </p>
            </form>
        </div>
    );
}
