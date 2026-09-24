/** A workspace page's heading row (5204:62052): the title, one line under it, and actions on the right. */
export function PageHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
                {subtitle && <p className="mt-2 text-sm text-dim">{subtitle}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}

/** A white card on the workspace ground (5204:62055). */
export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={`rounded-lg border border-line bg-white p-6 ${className}`}>{children}</section>;
}
