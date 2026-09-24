"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Map as MapIcon } from "lucide-react";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AccountType, Party } from "@/services/party";

const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string }[] = [
    { value: "INDIVIDUAL", label: "Individual", hint: "In your own name" },
    { value: "BUSINESS", label: "Business", hint: "A registered firm or company" },
    { value: "ORGANISATION", label: "Organisation", hint: "A trust, society or institution" },
];

/**
 * The first question after the first code, exactly as the apps ask it:
 * which side. Choosing opens that side on the account — the same record the
 * app and the console then see — and needs what the apps' next step asks,
 * the kind of account and its name, so both are taken here before the
 * workspace opens.
 */
export function ChooseWorkspace() {
    const router = useRouter();
    const params = useSearchParams();
    const wanted = params.get("party");
    const next = params.get("next");
    const { status, parties, chooseParty, setPreferredParty } = useAuth();
    const [party, setParty] = React.useState<Party | null>(wanted === "PUBLISHER" || wanted === "ADVERTISER" ? wanted : null);
    const [accountType, setAccountType] = React.useState<AccountType>("BUSINESS");
    const [name, setName] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (status === "signed-out") router.replace(`/sign-in?next=${encodeURIComponent("/choose-workspace")}`);
    }, [status, router]);

    const destination = (side: Party) => (next && next.startsWith("/") ? next : side === "PUBLISHER" ? "/publisher" : "/advertiser");

    const open = (side: Party) => {
        if (parties.includes(side)) {
            /* The side already exists on this account: just go there. */
            setPreferredParty(side);
            router.replace(destination(side));
            return;
        }
        setParty(side);
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!party || busy) return;
        setBusy(true);
        setError(null);
        try {
            await chooseParty({ party, accountType, ...(name.trim() ? { name: name.trim() } : {}) });
            router.replace(destination(party));
        } catch (caught) {
            setError(messageOf(caught, "Could not open the workspace."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthCard>
            <AuthTitle title="Choose your workspace" subtitle="Your number is verified. Where would you like to start?" />
            <div className="mt-8 grid grid-cols-2 gap-3">
                <SideButton icon={<ArrowUpDown className="size-[18px]" aria-hidden />} label="Advertiser" active={party === "ADVERTISER"} held={parties.includes("ADVERTISER")} onClick={() => open("ADVERTISER")} />
                <SideButton icon={<MapIcon className="size-[18px]" aria-hidden />} label="Publisher" active={party === "PUBLISHER"} held={parties.includes("PUBLISHER")} onClick={() => open("PUBLISHER")} />
            </div>

            {party && !parties.includes(party) && (
                <form onSubmit={submit} className="mt-6 border-t border-line pt-6">
                    <p className="text-sm font-semibold text-ink">{party === "PUBLISHER" ? "Who owns the spaces?" : "Who is advertising?"}</p>
                    <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Kind of account">
                        {ACCOUNT_TYPES.map((option) => (
                            <label key={option.value} className={cn("flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3", accountType === option.value ? "border-ink" : "border-line")}>
                                <input type="radio" name="accountType" value={option.value} checked={accountType === option.value} onChange={() => setAccountType(option.value)} className="accent-brand" />
                                <span className="text-sm font-medium text-ink">{option.label}</span>
                                <span className="ml-auto text-xs text-dim">{option.hint}</span>
                            </label>
                        ))}
                    </div>
                    <label className="mt-4 block text-sm">
                        <span className="font-medium text-ink">{accountType === "INDIVIDUAL" ? "Your name" : "Business name"}</span>
                        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={accountType === "INDIVIDUAL" ? "As on your ID" : "As registered"} className="mt-1.5 h-12 w-full rounded-md border border-line px-4 text-sm text-ink focus:border-ink focus:outline-none" />
                    </label>
                    {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
                    <button type="submit" disabled={busy} className={`${primaryButton} mt-5`}>
                        {busy ? "Opening…" : party === "PUBLISHER" ? "Open publisher workspace" : "Open advertiser workspace"}
                    </button>
                </form>
            )}

            <p className="mt-5 text-xs text-dim">One ADX account for your advertising and publishing work.</p>
        </AuthCard>
    );
}

function SideButton({ icon, label, active, held, onClick }: { icon: React.ReactNode; label: string; active: boolean; held: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn("flex h-[60px] items-center gap-3 rounded-md border bg-white px-6 text-left text-sm font-semibold text-ink hover:border-ink", active ? "border-ink" : "border-line")}
        >
            {icon}
            {label}
            {held && <span className="ml-auto text-xs font-normal text-dim">Open</span>}
        </button>
    );
}
