"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, MapPin } from "lucide-react";
import { toast } from "sonner";
import { primaryButton } from "@/components/auth/auth-card";
import { ApiError, messageOf, tokens } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { authService, destinationFor, normaliseMobile } from "@/services/auth";
import { HOME_OF, inviteService, proposalLine, type AccountType, type InviteLanding as Landing } from "@/services/party";

const field = "mt-1.5 h-12 w-full rounded-md border border-line bg-white px-4 text-sm text-ink focus:border-ink focus:outline-none";

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
    { value: "BUSINESS", label: "Business" },
    { value: "INDIVIDUAL", label: "Individual" },
    { value: "ORGANISATION", label: "Organisation" },
];

const inr = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * The invite landing (LH7): who it was made for, the side's pitch as ops
 * wrote it, the numbers that lead it (a rate estimate for a space owner,
 * nearby spaces and plans for an advertiser), what the agent proposed, and
 * the door. Signed in, the account takes the lead's side through the link
 * (`POST /j/:code/link`, the app's `joinDoor`); signed out, the landing's
 * own number-and-code door opens the account on that side. A shut door
 * (expired, replaced) still offers a callback.
 */
export function InviteLanding({ code }: { code: string }) {
    const [state, setState] = React.useState<{ kind: "loading" } | { kind: "ready"; landing: Landing } | { kind: "missing"; message: string }>({ kind: "loading" });

    React.useEffect(() => {
        let cancelled = false;
        inviteService
            .open(code)
            .then((landing) => {
                if (!cancelled) setState({ kind: "ready", landing });
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                const missing = caught instanceof ApiError && caught.status === 404;
                setState({ kind: "missing", message: missing ? "This invite link is not in use. Check the link, or ask your ADX contact to send it again." : messageOf(caught, "Could not open this invite. Try again in a moment.") });
            });
        return () => {
            cancelled = true;
        };
    }, [code]);

    if (state.kind === "loading") return <Centre title="One moment…" line="Opening your invitation." />;
    if (state.kind === "missing") return <Centre title="Nothing here" line={state.message} action={{ href: "/", label: "Go to ADX" }} />;

    const { landing } = state;
    const place = [landing.business.locality, landing.business.city].filter(Boolean).join(", ");
    const live = landing.state === "LIVE";

    return (
        <div className="mx-auto grid max-w-[1120px] gap-10 px-6 pb-20 pt-14 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section>
                {landing.agent?.name && <p className="text-sm font-medium text-brand-bright">{landing.agent.name} from ADX invited you</p>}
                <h1 className="mt-2 text-[40px] font-extrabold leading-[48px] tracking-[-1px] text-ink">{landing.copy.headline}</h1>
                {landing.copy.line && <p className="mt-3 text-lg text-dim">{landing.copy.line}</p>}

                <div className="mt-8 rounded-lg border border-line bg-white p-6">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-dim">Made for</p>
                    <p className="mt-1 text-xl font-semibold text-ink">{landing.business.name}</p>
                    {(place || landing.business.category) && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-dim">
                            <MapPin className="size-4" aria-hidden />
                            {[place, landing.business.category].filter(Boolean).join(" · ")}
                        </p>
                    )}
                    <Hook landing={landing} />
                </div>

                {landing.copy.bullets.length > 0 && (
                    <ul className="mt-8 space-y-3">
                        {landing.copy.bullets.map((bullet) => (
                            <li key={bullet} className="flex items-start gap-3 text-[15px] text-ink">
                                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                                {bullet}
                            </li>
                        ))}
                    </ul>
                )}

                {landing.proposals.length > 0 && <Proposals code={code} landing={landing} />}
            </section>

            <aside className="lg:pt-10">
                <div className="rounded-lg border border-line bg-white p-6 shadow-card">
                    {landing.state === "CONVERTED" || landing.converted ? (
                        <>
                            <p className="text-lg font-semibold text-ink">This invitation has been used</p>
                            <p className="mt-1 text-sm text-dim">The account it opened is ready. Sign in with the number you used to carry on.</p>
                            <Link href="/sign-in" className={`${primaryButton} mt-5`}>
                                Sign in
                            </Link>
                        </>
                    ) : live ? (
                        <JoinDoor code={code} landing={landing} />
                    ) : (
                        <>
                            <p className="text-lg font-semibold text-ink">{landing.state === "EXPIRED" ? "This link has expired" : "This link was replaced"}</p>
                            <p className="mt-1 text-sm text-dim">{landing.state === "EXPIRED" ? "Ask your ADX contact for a fresh one — or ask for a call below." : "Your ADX contact sent a newer link. Use that one, or ask for a call below."}</p>
                        </>
                    )}
                </div>
                <Callback code={code} />
                <a href={landing.appLink} className="mt-4 block text-center text-sm font-medium text-dim underline underline-offset-2 hover:text-ink lg:hidden">
                    Open in the ADX app
                </a>
            </aside>
        </div>
    );
}

function Hook({ landing }: { landing: Landing }) {
    const hook = landing.hook;
    if (!hook) return null;
    if (hook.side === "PUBLISHER") {
        return (
            <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
                {hook.rateEstimate && (
                    <div>
                        <p className="text-2xl font-semibold tabular-nums text-ink">{inr(hook.rateEstimate.perMonth)}</p>
                        <p className="text-sm text-dim">
                            a month — about {inr(hook.rateEstimate.perDay)} a day, from {hook.rateEstimate.comparables} live space{hook.rateEstimate.comparables === 1 ? "" : "s"} within {hook.rateEstimate.radiusM} m
                        </p>
                    </div>
                )}
                {hook.nearbyCampaigns > 0 && (
                    <div>
                        <p className="text-2xl font-semibold tabular-nums text-ink">{hook.nearbyCampaigns}</p>
                        <p className="text-sm text-dim">campaigns booked nearby in the last six months</p>
                    </div>
                )}
            </div>
        );
    }
    return (
        <div className="mt-5 border-t border-line pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
                {hook.nearbySpots > 0 && (
                    <div>
                        <p className="text-2xl font-semibold tabular-nums text-ink">{hook.nearbySpots}</p>
                        <p className="text-sm text-dim">live ad spaces near you</p>
                    </div>
                )}
                {hook.sampleEstimate && (
                    <div>
                        <p className="text-2xl font-semibold tabular-nums text-ink">{inr(hook.sampleEstimate.amount)}</p>
                        <p className="text-sm text-dim">
                            {hook.sampleEstimate.spots} spaces for {hook.sampleEstimate.days} days at about {inr(hook.sampleEstimate.perSpotPerDay)} each a day
                        </p>
                    </div>
                )}
            </div>
            {hook.packages.length > 0 && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {hook.packages.map((plan) => (
                        <div key={plan.tier} className={cn("rounded-md border px-4 py-3", plan.isPopular ? "border-brand-bright" : "border-line")}>
                            <p className="text-sm font-semibold text-ink">
                                {plan.name}
                                {plan.isPopular && <span className="ml-2 text-xs font-medium text-brand-bright">Popular</span>}
                            </p>
                            <p className="text-sm tabular-nums text-dim">{inr(plan.pricePerMonth)} a month</p>
                            {plan.description && <p className="mt-1 text-xs text-dim">{plan.description}</p>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Proposals({ code, landing }: { code: string; landing: Landing }) {
    const [accepted, setAccepted] = React.useState<Set<string>>(() => new Set(landing.proposals.filter((p) => p.acceptedAt).map((p) => p.id)));
    const [busy, setBusy] = React.useState<string | null>(null);
    const accept = async (id: string) => {
        setBusy(id);
        try {
            await inviteService.acceptProposal(code, id);
            setAccepted((current) => new Set(current).add(id));
            toast.success("Accepted. Your ADX contact has been told.");
        } catch (caught) {
            toast.error(messageOf(caught, "Could not accept this proposal. Try again."));
        } finally {
            setBusy(null);
        }
    };
    return (
        <section className="mt-10">
            <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-dim">What your ADX contact proposed</h2>
            <div className="mt-3 grid gap-3">
                {landing.proposals.map((proposal) => (
                    <div key={proposal.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-white px-5 py-4">
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-medium text-ink">{proposalLine(proposal)}</p>
                            {proposal.note && <p className="mt-1 text-sm text-dim">{proposal.note}</p>}
                        </div>
                        {accepted.has(proposal.id) ? (
                            <span className="text-sm font-medium text-success">Accepted</span>
                        ) : (
                            <button type="button" disabled={busy === proposal.id || landing.state !== "LIVE"} onClick={() => void accept(proposal.id)} className="h-10 rounded-md border border-line bg-white px-5 text-sm font-semibold text-ink hover:border-ink disabled:opacity-50">
                                {busy === proposal.id ? "Accepting…" : "Accept"}
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}

/** The door: signed in, link this account; signed out, the landing's own number-and-code sign-up on the lead's side. */
function JoinDoor({ code, landing }: { code: string; landing: Landing }) {
    const router = useRouter();
    const { status, user, signInWithTokens, setPreferredParty, refresh } = useAuth();
    const [mobile, setMobile] = React.useState("");
    const [sent, setSent] = React.useState<{ mobile: string } | null>(null);
    const [otp, setOtp] = React.useState("");
    const [name, setName] = React.useState(landing.business.contactName ?? landing.business.name ?? "");
    const [accountType, setAccountType] = React.useState<AccountType>("BUSINESS");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const side = landing.side;
    const sideWord = side === "PUBLISHER" ? "publisher" : "advertiser";

    const link = async () => {
        setBusy(true);
        setError(null);
        try {
            const joined = await inviteService.link(code, { ...(name.trim() ? { name: name.trim() } : {}), accountType });
            /* The side's role is on the account now. The link answers the re-signed token when it granted the role —
               adopt it, as after choosing a side; a backend that does not answer one gets the session renewed instead. */
            let me = null;
            if (joined.accessToken) {
                tokens.set({ accessToken: joined.accessToken });
                me = await refresh();
            } else if (user && !user.roles.includes(side)) {
                const refreshToken = tokens.refresh;
                me = refreshToken ? await signInWithTokens(await authService.refresh(refreshToken)) : null;
            } else {
                me = await refresh();
            }
            setPreferredParty(side);
            router.replace(me ? destinationFor(me, HOME_OF[side]) : HOME_OF[side]);
        } catch (caught) {
            setError(messageOf(caught, "Could not open your account through this link. Try again."));
            setBusy(false);
        }
    };

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const answer = await inviteService.sendOtp(code, normaliseMobile(mobile));
            setSent({ mobile: answer.mobile });
            if (answer.devOtp) setOtp(answer.devOtp);
        } catch (caught) {
            setError(messageOf(caught, "Could not send the code. Check the number and try again."));
        } finally {
            setBusy(false);
        }
    };

    const verify = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!sent) return;
        setBusy(true);
        setError(null);
        try {
            const result = await inviteService.verify(code, { mobile: sent.mobile, otp: otp.trim(), ...(name.trim() ? { name: name.trim() } : {}), accountType });
            const me = await signInWithTokens(result);
            setPreferredParty(side);
            router.replace(destinationFor(me, HOME_OF[side]));
        } catch (caught) {
            setError(messageOf(caught, "That code did not work. Check it and try again."));
            setBusy(false);
        }
    };

    const kindPicker = (
        <label className="mt-4 block text-sm">
            <span className="font-medium text-ink">Kind of account</span>
            <select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)} className={field}>
                {ACCOUNT_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );
    const namePicker = (
        <label className="mt-4 block text-sm">
            <span className="font-medium text-ink">{accountType === "INDIVIDUAL" ? "Your name" : "Business name"}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className={field} />
        </label>
    );

    if (status === "restoring") return <p className="text-sm text-dim">Checking your session…</p>;

    if (status === "signed-in" && user) {
        return (
            <>
                <p className="text-lg font-semibold text-ink">{landing.copy.cta}</p>
                <p className="mt-1 text-sm text-dim">
                    You are signed in as {user.name || user.email || user.mobile}. This opens the {sideWord} side on your account and tells your ADX contact.
                </p>
                {namePicker}
                {kindPicker}
                {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
                <button type="button" onClick={() => void link()} disabled={busy} className={`${primaryButton} mt-5`}>
                    {busy ? "Opening…" : `Continue as ${sideWord}`}
                </button>
            </>
        );
    }

    return (
        <>
            <p className="text-lg font-semibold text-ink">{landing.copy.cta}</p>
            <p className="mt-1 text-sm text-dim">Your mobile number opens your {sideWord} account. We send a code to prove it is yours.</p>
            {!sent ? (
                <form onSubmit={send}>
                    <label className="mt-4 block text-sm">
                        <span className="font-medium text-ink">Mobile number</span>
                        <input type="tel" inputMode="numeric" autoComplete="tel-national" value={mobile} onChange={(event) => setMobile(event.target.value.replace(/[^\d\s+]/g, ""))} placeholder="98765 43210" className={field} />
                    </label>
                    {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
                    <button type="submit" disabled={busy || mobile.replace(/\D/g, "").length < 10} className={`${primaryButton} mt-5`}>
                        {busy ? "Sending the code…" : "Send the code"}
                    </button>
                </form>
            ) : (
                <form onSubmit={verify}>
                    <label className="mt-4 block text-sm">
                        <span className="font-medium text-ink">The 6-digit code sent to {sent.mobile}</span>
                        <input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} className={`${field} tracking-[0.3em]`} />
                    </label>
                    {namePicker}
                    {kindPicker}
                    {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
                    <button type="submit" disabled={busy || otp.length < 4} className={`${primaryButton} mt-5`}>
                        {busy ? "Opening your account…" : "Verify and continue"}
                    </button>
                    <button type="button" onClick={() => setSent(null)} className="mt-3 text-sm text-dim underline-offset-2 hover:text-ink hover:underline">
                        Use another number
                    </button>
                </form>
            )}
            <p className="mt-5 text-xs text-dim">
                Already on ADX?{" "}
                <Link href={`/sign-in?next=${encodeURIComponent(`/j/${code}`)}`} className="font-medium text-ink underline underline-offset-2">
                    Sign in
                </Link>{" "}
                and come back to this link. By continuing you will be asked to accept the{" "}
                <Link href="/legal/TERMS_OF_SERVICE" className="text-ink underline underline-offset-2">Terms of service</Link> and{" "}
                <Link href="/legal/PRIVACY_POLICY" className="text-ink underline underline-offset-2">Privacy policy</Link>.
            </p>
        </>
    );
}

function Callback({ code }: { code: string }) {
    const [open, setOpen] = React.useState(false);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [done, setDone] = React.useState(false);
    const ask = async () => {
        setBusy(true);
        try {
            await inviteService.callback(code, note.trim() || undefined);
            setDone(true);
        } catch (caught) {
            toast.error(messageOf(caught, "Could not ask for a call. Try again."));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="mt-4 rounded-lg border border-line bg-white p-5">
            {done ? (
                <p className="text-sm text-ink">Thanks — your ADX contact will call you back.</p>
            ) : !open ? (
                <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-ink underline underline-offset-2">
                    Rather talk first? Ask for a call back
                </button>
            ) : (
                <>
                    <label className="block text-sm">
                        <span className="font-medium text-ink">When suits you, or what to talk about (optional)</span>
                        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} className="mt-1.5 w-full rounded-md border border-line px-4 py-3 text-sm text-ink focus:border-ink focus:outline-none" />
                    </label>
                    <button type="button" onClick={() => void ask()} disabled={busy} className="mt-3 h-10 rounded-md border border-line bg-white px-5 text-sm font-semibold text-ink hover:border-ink disabled:opacity-50">
                        {busy ? "Asking…" : "Ask for a call back"}
                    </button>
                </>
            )}
        </div>
    );
}

function Centre({ title, line, action }: { title: string; line: string; action?: { href: string; label: string } }) {
    return (
        <div className="mx-auto flex min-h-[60vh] max-w-[520px] flex-col items-center justify-center px-5 py-16 text-center">
            <h1 className="text-[28px] font-semibold text-ink">{title}</h1>
            <p className="mt-1.5 text-dim">{line}</p>
            {action && (
                <Link href={action.href} className="mt-6 inline-block rounded bg-brand px-6 py-2.5 text-sm font-medium text-white">
                    {action.label}
                </Link>
            )}
        </div>
    );
}
