"use client";

import * as React from "react";
import { FormRenderer } from "@/components/forms/form-renderer";
import { formBlockOf } from "@/services/layouts";

/**
 * PB-4 · `form`: a Content › Forms form on the page — the server resolved
 * its published definition into `props.form`; with none (unpublished,
 * archived, gone) the block draws nothing. The heading and the intro are
 * the block's; the form's own title is not repeated.
 */
export function FormBlock({ props, surface }: { props: Record<string, unknown>; surface: string }) {
    const block = formBlockOf(props);
    if (!block) return null;
    return (
        <section data-testid="form-block" className="mx-auto max-w-[720px]">
            {block.heading && <h2 className="text-[32px] font-semibold leading-10 text-ink">{block.heading}</h2>}
            {block.intro && <p className="mt-2 text-lg leading-6 text-dim">{block.intro}</p>}
            <FormRenderer form={block.form} source={`web:${surface}`} className={block.heading || block.intro ? "mt-8" : undefined} />
        </section>
    );
}
