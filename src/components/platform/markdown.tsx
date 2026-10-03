import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/services/legal";

/**
 * A published document's Markdown, drawn in the site's document type
 * (`.site-doc`, globals.css). `renderMarkdown` escapes the source before it
 * adds a single tag and keeps only links a reader can follow safely, so the
 * HTML set here is ours, whatever ADX Legal typed.
 */
export function Markdown({ source, className, topLevel = 2 }: { source: string; className?: string; topLevel?: number }) {
    return <div className={cn("site-doc", className)} dangerouslySetInnerHTML={{ __html: renderMarkdown(source, topLevel) }} />;
}
