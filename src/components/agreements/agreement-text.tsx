import * as React from "react";
import { cn } from "@/lib/utils";
import { inlineParts, textBlocks } from "@/services/agreements";

/**
 * A published agreement's text, drawn with the site's own type: the
 * Markdown's headings, paragraphs, lists and rules, and bold or italic
 * inside a line. Nothing in the text is taken as HTML.
 */
export function AgreementBody({ body, className }: { body: string; className?: string }) {
    const blocks = React.useMemo(() => textBlocks(body), [body]);
    return (
        <div className={cn("space-y-3 text-sm leading-6 text-ink", className)}>
            {blocks.map((block, index) => {
                switch (block.type) {
                    case "heading":
                        return block.level === 1 ? (
                            <h3 key={index} className="pt-1 text-base font-semibold text-ink">
                                <Inline text={block.text} />
                            </h3>
                        ) : (
                            <h4 key={index} className="pt-1 text-sm font-semibold text-ink">
                                <Inline text={block.text} />
                            </h4>
                        );
                    case "paragraph":
                        return (
                            <p key={index} className="text-[#3d3f45]">
                                <Inline text={block.text} />
                            </p>
                        );
                    case "list": {
                        const List = block.ordered ? "ol" : "ul";
                        return (
                            <List key={index} className={cn("space-y-1 pl-5 text-[#3d3f45]", block.ordered ? "list-decimal" : "list-disc")}>
                                {block.items.map((item, itemIndex) => (
                                    <li key={itemIndex}>
                                        <Inline text={item} />
                                    </li>
                                ))}
                            </List>
                        );
                    }
                    case "rule":
                        return <hr key={index} className="border-line" />;
                }
            })}
        </div>
    );
}

function Inline({ text }: { text: string }) {
    return (
        <>
            {inlineParts(text).map((part, index) =>
                part.strong ? (
                    <strong key={index} className="font-semibold text-ink">
                        {part.text}
                    </strong>
                ) : part.em ? (
                    <em key={index}>{part.text}</em>
                ) : (
                    <React.Fragment key={index}>{part.text}</React.Fragment>
                )
            )}
        </>
    );
}
