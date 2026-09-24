"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatDay } from "@/services/booking";
import { primaryButton, secondaryButton } from "./booking-frame";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string | null) => (s ? new Date(s.slice(0, 10) + "T00:00:00") : undefined);

/**
 * "Campaign dates" (5204:67792): two months side by side, the range in
 * brand-soft with its ends in brand, the chosen dates under it, Cancel and
 * Apply dates. The same picker the cart and the Ad spaces step open.
 */
export function DateRangeDialog({ open, from, to, onApply, onClose }: { open: boolean; from: string | null; to: string | null; onApply: (from: string, to: string) => void; onClose: () => void }) {
    const [range, setRange] = React.useState<DateRange | undefined>(() => ({ from: fromIso(from), to: fromIso(to) }));
    const today = React.useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-[720px] gap-0 rounded-xl border-line p-6 sm:rounded-xl">
                <DialogTitle className="text-xl font-semibold text-ink">Campaign dates</DialogTitle>
                <div className="relative mt-5 rounded-lg border border-line">
                    <Calendar
                        key={open ? "open" : "closed"}
                        mode="range"
                        numberOfMonths={2}
                        selected={range}
                        onSelect={setRange}
                        defaultMonth={range?.from ?? today}
                        disabled={{ before: today }}
                        weekStartsOn={0}
                        className="p-4"
                        classNames={{
                            months: "flex flex-col sm:flex-row gap-0 sm:divide-x sm:divide-line",
                            month: "space-y-4 sm:px-4 first:pl-0 last:pr-0",
                            month_caption: "flex justify-center pt-1 relative items-center",
                            caption_label: "text-base font-semibold text-ink",
                            button_previous: "absolute left-4 top-5 z-10 flex size-7 items-center justify-center rounded-md text-dim hover:bg-ground hover:text-ink",
                            button_next: "absolute right-4 top-5 z-10 flex size-7 items-center justify-center rounded-md text-dim hover:bg-ground hover:text-ink",
                            weekday: "text-dim rounded-md w-10 font-normal text-sm",
                            day: "size-10 text-center text-sm p-0 relative",
                            day_button: "size-10 rounded-md font-normal hover:bg-ground",
                            selected: "bg-brand-soft text-ink",
                            range_start: "rounded-l-md [&>button]:bg-brand [&>button]:text-white [&>button]:rounded-md",
                            range_end: "rounded-r-md [&>button]:bg-brand [&>button]:text-white [&>button]:rounded-md",
                            range_middle: "bg-brand-soft text-ink rounded-none",
                            today: "font-semibold",
                            outside: "text-dim/50",
                            disabled: "text-dim/40",
                        }}
                    />
                </div>
                <p className="mt-5 flex items-center gap-3 text-base text-ink">
                    <span className="font-medium">{range?.from ? formatDay(iso(range.from)) : "Start date"}</span>
                    <span className="text-sm text-dim">to</span>
                    <span className="font-medium">{range?.to ? formatDay(iso(range.to)) : "End date"}</span>
                </p>
                <div className="mt-5 flex items-center justify-between">
                    <button type="button" onClick={onClose} className={secondaryButton}>
                        Cancel
                    </button>
                    <button type="button" disabled={!range?.from || !range?.to} onClick={() => range?.from && range?.to && onApply(iso(range.from), iso(range.to))} className={primaryButton}>
                        Apply dates
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
