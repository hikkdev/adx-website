"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Calendar, MapPin, User } from "lucide-react";
import { cn } from "@/lib/utils";

function dateLabel(from: string, to: string): string {
    if (!from && !to) return "";
    const fmt = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "…");
    return `${fmt(from)} – ${fmt(to)}`;
}

/**
 * The formats page's place · dates · format bar ("Search spaces → explore",
 * 5204:53171). It is the Explore page's search, drawn on the hero: every
 * choice becomes a `/spaces` query, so the answer is the real listing grid.
 */
export function FormatsSearch({ className }: { className?: string }) {
    const router = useRouter();
    const [city, setCity] = React.useState("");
    const [from, setFrom] = React.useState("");
    const [to, setTo] = React.useState("");
    const [display, setDisplay] = React.useState("");
    const [datesOpen, setDatesOpen] = React.useState(false);

    const search = (next: { display?: string } = {}) => {
        const params = new URLSearchParams();
        if (city.trim()) params.set("city", city.trim());
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const chosen = next.display ?? display;
        if (chosen) params.set("display", chosen);
        const query = params.toString();
        router.push(query ? `/spaces?${query}` : "/spaces");
    };

    return (
        <form
            className={cn("flex w-full text-left rounded-xl border border-[rgba(204,204,204,0.5)] bg-white shadow-[0px_3px_5px_rgba(0,0,0,0.04)]", className)}
            onSubmit={(event) => {
                event.preventDefault();
                search();
            }}
        >
            <label className="flex min-w-0 flex-1 items-center gap-3 border-r border-[rgba(204,204,204,0.5)] px-6 py-[18px]">
                <MapPin className="size-5 shrink-0 text-ink" aria-hidden />
                <input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Bengaluru"
                    aria-label="City"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium leading-5 text-ink placeholder:text-dim focus:outline-none"
                />
            </label>
            <div className="relative flex min-w-0 flex-1 border-r border-[rgba(204,204,204,0.5)]">
                <button type="button" onClick={() => setDatesOpen((open) => !open)} className="flex w-full items-center gap-3 px-6 py-[18px] text-left text-sm font-medium leading-5 text-dim" aria-expanded={datesOpen} aria-label="Dates">
                    <Calendar className="size-5 shrink-0 text-ink" aria-hidden />
                    <span className={cn("truncate", (from || to) && "text-ink")}>{dateLabel(from, to) || "12–25 Oct"}</span>
                </button>
                {datesOpen && (
                    <div className="absolute left-0 top-full z-20 mt-2 grid w-[320px] gap-3 rounded-xl border border-line bg-white p-4 shadow-card">
                        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.8px] text-dim">
                            Starts
                            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10 rounded-md border border-line px-3 text-sm font-normal normal-case tracking-normal text-ink" />
                        </label>
                        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.8px] text-dim">
                            Ends
                            <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-md border border-line px-3 text-sm font-normal normal-case tracking-normal text-ink" />
                        </label>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="rounded-md px-3 py-2 text-sm font-medium text-dim" onClick={() => { setFrom(""); setTo(""); }}>
                                Clear
                            </button>
                            <button type="button" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => { setDatesOpen(false); search(); }}>
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <label className="flex min-w-0 flex-1 items-center gap-3 px-6 py-[18px]">
                <User className="size-5 shrink-0 text-ink" aria-hidden />
                <select
                    value={display}
                    onChange={(event) => {
                        setDisplay(event.target.value);
                        search({ display: event.target.value });
                    }}
                    aria-label="Format"
                    className="min-w-0 flex-1 appearance-none bg-transparent text-sm font-medium leading-5 text-dim focus:outline-none"
                >
                    <option value="">All formats</option>
                    <option value="STATIC">Static</option>
                    <option value="DIGITAL">Digital</option>
                </select>
                <button type="submit" className="sr-only">Search spaces</button>
            </label>
        </form>
    );
}
