"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImportFormat } from "@/services/bulk-listings";

/**
 * The sheet's format guide, as the server publishes it
 * (`GET /party-imports/formats/listings`): every column with whether it is
 * required, what it holds and an example, then the rules the checker keeps.
 * The guide and the checker are one list on the server, so nothing here can
 * promise a column the upload would refuse.
 */
export function FormatGuide({ format, defaultOpen = false }: { format: ImportFormat; defaultOpen?: boolean }) {
    const [open, setOpen] = React.useState(defaultOpen);
    const required = format.columns.filter((column) => column.required);
    return (
        <div className="rounded-lg border border-line bg-white">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                <span>
                    <span className="block text-sm font-semibold text-ink">The format guide</span>
                    <span className="mt-0.5 block text-xs text-dim">
                        {format.columns.length} columns · {required.length} required ({required.map((column) => column.name).join(", ")}) · one space per row
                    </span>
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-dim transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            {open && (
                <div className="border-t border-line px-5 pb-5">
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="bg-[#f5f5f3] text-left text-xs font-medium text-dim">
                                    <th scope="col" className="h-9 px-3">
                                        Column
                                    </th>
                                    <th scope="col" className="h-9 px-3">
                                        Needed
                                    </th>
                                    <th scope="col" className="h-9 px-3">
                                        What it holds
                                    </th>
                                    <th scope="col" className="h-9 px-3">
                                        Example
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {format.columns.map((column) => (
                                    <tr key={column.name} className="border-t border-line align-top">
                                        <td className="px-3 py-2.5 font-mono text-xs text-ink">{column.name}</td>
                                        <td className="px-3 py-2.5 text-xs">{column.required ? <span className="font-semibold text-brand">Required</span> : <span className="text-dim">Optional</span>}</td>
                                        <td className="px-3 py-2.5 text-xs text-ink">
                                            {column.description}
                                            {column.enumValues && <span className="mt-1 block text-dim">One of: {column.enumValues.join(", ")}</span>}
                                            {column.maxLength && <span className="mt-1 block text-dim">Up to {column.maxLength} characters</span>}
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-dim">{column.example || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {format.rules.length > 0 && (
                        <>
                            <p className="mt-5 text-sm font-semibold text-ink">How the sheet is checked</p>
                            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-dim">
                                {format.rules.map((rule) => (
                                    <li key={rule}>{rule}</li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
