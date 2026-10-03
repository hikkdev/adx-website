"use client";

import * as React from "react";
import { Maximize, PencilLine, Unlock } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { btnSmall } from "@/components/advertiser/bits";
import { accessService, changeMeta, changeTitle, grantMeta, grantTitle, scanMeta, scanTitle, type AccessLog, type AccessParty } from "@/services/access";

/**
 * U9 on the web — who has had access to my account, when, and what
 * changed: every scan of the code with who made it and how far away they
 * stood (refusals included), every window of access and how it ended, and
 * every change an agent made under one. Read, never edited — a record you
 * can tidy is not one.
 */
export function AccessLogPanel({ party, refreshKey = 0 }: { party: AccessParty; refreshKey?: number }) {
    const [log, setLog] = React.useState<AccessLog | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        accessService
            .accessLog(party)
            .then((next) => {
                if (!cancelled) {
                    setLog(next);
                    setError(null);
                }
            })
            .catch((caught: unknown) => {
                if (!cancelled) {
                    setError(messageOf(caught, "Could not load the record."));
                    setLog((current) => current ?? { scans: [], grants: [], changes: [] });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [party, refreshKey, tick]);

    if (!log) return <p className="text-sm text-dim">Loading your access record…</p>;
    const empty = log.scans.length + log.grants.length + log.changes.length === 0;

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-dim">Every scan of your code, every window of access, every change made for you.</p>
                <button type="button" onClick={() => setTick((n) => n + 1)} className={btnSmall}>
                    Refresh
                </button>
            </div>
            {error && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                </p>
            )}
            {empty && !error && <p className="mt-4 rounded-md bg-ground px-4 py-3 text-sm text-dim">Nobody has scanned your code and no agent has had access to your account.</p>}
            {log.scans.length > 0 && <LogSection icon={Maximize} title="Scans of your code" rows={log.scans.map((scan) => ({ id: scan.id, title: scanTitle(scan), meta: scanMeta(scan) }))} />}
            {log.grants.length > 0 && <LogSection icon={Unlock} title="Windows of access" rows={log.grants.map((grant) => ({ id: grant.id, title: grantTitle(grant), meta: grantMeta(grant) }))} />}
            {log.changes.length > 0 && <LogSection icon={PencilLine} title="Changes made for you" rows={log.changes.map((change) => ({ id: change.id, title: changeTitle(change), meta: changeMeta(change) }))} />}
        </div>
    );
}

function LogSection({ icon: Icon, title, rows }: { icon: typeof Maximize; title: string; rows: { id: string; title: string; meta: string }[] }) {
    return (
        <div className="mt-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon className="size-4 text-brand-bright" aria-hidden />
                {title}
            </p>
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                {rows.map((row) => (
                    <li key={row.id} className="px-3 py-2.5">
                        <p className="text-sm text-ink">{row.title}</p>
                        <p className="text-xs text-dim">{row.meta}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
