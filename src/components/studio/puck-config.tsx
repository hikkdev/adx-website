"use client";

import * as React from "react";
import type { ComponentConfig, Config } from "@puckeditor/core";
import { AlertCircle } from "lucide-react";
import { ContentBlock } from "@/components/layout/layout-blocks";
import { cn } from "@/lib/utils";
import { CONTENT_BLOCKS, type ContentBlockType } from "@/services/layouts";
import { ENVELOPE_KEY, audienceLine, defaultProps, pinnedFor, type BlockEnvelope, type BlockTypeDef } from "@/services/studio";
import { useCanvasState, useStudioLookups } from "./lookups";
import { fieldsFor } from "./puck-fields";

/**
 * ST-1: the Puck configuration, built from the registry.
 *
 * One Puck component per block type `GET /layouts/block-types` lists. A
 * CONTENT block draws through the website's own `ContentBlock` with its
 * resolved props (rails show real listings, pictures are pictures); a
 * SYSTEM block is a labelled placeholder for a section the page draws
 * itself — offered only on its own surface, never on a custom page, never
 * deleted or duplicated; a type the registry does not know (saved by a
 * newer backend) is kept as a labelled card. Nothing here names a block
 * type, so a new one appears in Studio without a Studio change.
 */

export interface ConfigOptions {
    types: readonly BlockTypeDef[];
    /** The surface whose sections are offered; null for a custom page. */
    surface: string | null;
    /** A CUSTOM page takes content blocks only. */
    custom: boolean;
    /** Types present in the saved blocks that the registry does not list. */
    extraTypes?: readonly string[];
    /** The 390-px app frame: tighter gaps, the phone's paper. */
    phone?: boolean;
}

export const isContentBlockType = (type: string): type is ContentBlockType => (CONTENT_BLOCKS as readonly string[]).includes(type);

type CanvasKind = "SYSTEM" | "CONTENT" | "UNKNOWN";

/** What one block draws on the canvas: its issues, its audience, and the block itself. */
export function BlockCanvas({ id, type, kind, label, raw }: { id: string; type: string; kind: CanvasKind; label: string; raw: Record<string, unknown> }) {
    const { canvas, issues, resolvedOnce, phone } = useCanvasState();
    const { surface } = useStudioLookups();
    const { id: _id, puck: _puck, editMode: _editMode, [ENVELOPE_KEY]: envelope, ...own } = raw;
    const entry = canvas.get(id);
    const props = entry?.props ?? own;
    const shown = entry ? entry.shown : true;
    const problems = issues.get(id) ?? [];
    const audience = envelope ? audienceLine(envelope as BlockEnvelope) : null;
    const dim = !shown && resolvedOnce;

    return (
        <div data-studio-block={type} className={cn("relative", dim && "opacity-60")}>
            {(problems.length > 0 || dim || audience) && (
                <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
                    {problems.map((issue, index) => (
                        <span key={index} className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-danger" data-testid="block-issue">
                            <AlertCircle className="size-3" aria-hidden />
                            {issue.path && issue.path !== "(block)" && issue.path !== "props" ? <span className="font-mono">{issue.path.replace(/^props\./, "")}: </span> : null}
                            {issue.message}
                        </span>
                    ))}
                    {dim && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">Not shown to this viewer — hidden, out of its schedule or targeted elsewhere</span>}
                    {audience && <span className="rounded-full bg-paper px-2 py-0.5 text-dim">{audience}</span>}
                </div>
            )}
            {kind === "SYSTEM" ? (
                <SystemCard label={label} title={typeof own.title === "string" ? own.title : null} phone={phone} />
            ) : kind === "CONTENT" && isContentBlockType(type) ? (
                <>
                    <div className="adx-studio-content">
                        <ContentBlock type={type} props={props} surface={surface ?? "STUDIO"} />
                    </div>
                    <div className="adx-studio-empty-note items-center justify-center rounded-lg border border-dashed border-line bg-white px-4 py-6 text-center text-sm text-dim">{label} — nothing to draw yet. Fill in its fields; it resolves once the draft saves.</div>
                </>
            ) : (
                <UnknownCard type={type} label={label} />
            )}
        </div>
    );
}

function SystemCard({ label, title, phone }: { label: string; title: string | null; phone: boolean }) {
    return (
        <div className={cn("rounded-lg border border-dashed border-dim/60 bg-white/70 px-4 text-ink", phone ? "py-4" : "py-6")} data-testid="system-block">
            <p className="text-[11px] font-medium uppercase tracking-wide text-dim">{phone ? "The app's own section" : "This page's own section"}</p>
            <p className="mt-1 text-sm font-semibold">{title ?? label}</p>
            {title && <p className="text-xs text-dim">{label}, retitled</p>}
        </div>
    );
}

function UnknownCard({ type, label }: { type: string; label: string }) {
    return (
        <div className="rounded-lg border border-dashed border-warning bg-warning-soft px-4 py-4 text-sm text-warning" data-testid="unknown-block">
            <p className="font-medium">{label}</p>
            <p className="text-xs">
                This build of Studio cannot draw a <span className="font-mono">{type}</span> block; it is kept exactly as saved.
            </p>
        </div>
    );
}

export function buildConfig({ types, surface, custom, extraTypes = [], phone = false }: ConfigOptions): Config {
    const components: Record<string, ComponentConfig> = {};
    const sections: string[] = [];
    const content: string[] = [];
    const elsewhere: string[] = [];
    const pinned = pinnedFor(surface);

    for (const def of types) {
        const onSurface = !!surface && def.surfaces.includes(surface);
        const isPinned = pinned.includes(def.type);
        const kind: CanvasKind = def.kind === "SYSTEM" ? "SYSTEM" : "CONTENT";
        components[def.type] = {
            label: def.label,
            fields: fieldsFor(def.props),
            defaultProps: defaultProps(def.props),
            ...(def.kind === "SYSTEM" ? { permissions: { delete: false, duplicate: false, drag: !isPinned } } : {}),
            render: (props) => <BlockCanvas id={String(props.id)} type={def.type} kind={kind} label={def.label} raw={props as Record<string, unknown>} />,
        };
        if (def.kind === "SYSTEM") {
            if (onSurface && !custom) sections.push(def.type);
            else elsewhere.push(def.type);
        } else {
            content.push(def.type);
        }
    }
    for (const type of extraTypes) {
        if (components[type]) continue;
        components[type] = {
            label: type,
            fields: {},
            render: (props) => <BlockCanvas id={String(props.id)} type={type} kind="UNKNOWN" label={type} raw={props as Record<string, unknown>} />,
        };
        elsewhere.push(type);
    }

    return {
        categories: {
            sections: { title: phone ? "The app's own sections" : "This page's own sections", components: sections, visible: sections.length > 0, defaultExpanded: true },
            content: { title: "Content blocks", components: content, defaultExpanded: true },
            elsewhere: { title: "Elsewhere", components: elsewhere, visible: false },
        },
        components,
        root: {
            fields: {},
            render: ({ children }: { children: React.ReactNode }) => (
                <div className={cn("min-h-[320px]", phone ? "bg-ground px-4 py-4 [&_[data-puck-dropzone]>*+*]:mt-4" : "mx-auto w-full max-w-[1200px] px-6 py-10 [&_[data-puck-dropzone]>*+*]:mt-10")}>{children}</div>
            ),
        },
    };
}
