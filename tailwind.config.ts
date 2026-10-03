import type { Config } from "tailwindcss";

/**
 * The DR 12 website tokens, as Figma names them (`website/ink`, `website/muted`,
 * `website/line`, `website/red`, `website/bg`), beside the shadcn names the
 * copied primitives expect. One source: the CSS variables in globals.css.
 */
export default {
    darkMode: ["class"],
    content: ["./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                canvas: "hsl(var(--canvas))",
                card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
                popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
                primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
                secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
                muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
                accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
                destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
                success: { DEFAULT: "hsl(var(--success))", soft: "hsl(var(--success-soft))" },
                warning: { DEFAULT: "hsl(var(--warning))", soft: "hsl(var(--warning-soft))" },
                danger: { DEFAULT: "hsl(var(--danger))", soft: "hsl(var(--danger-soft))" },
                info: { DEFAULT: "hsl(var(--info))", soft: "hsl(var(--info-soft))" },
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                /* DR 12 names */
                ink: "#141518",
                paper: "#eeeae2",
                line: "#eaeae7",
                /* The three reds; Settings › Brand & theme may retune them through these variables (root layout), else DR 12's own. */
                brand: { DEFAULT: "rgb(var(--brand-rgb, 189 32 32) / <alpha-value>)", bright: "rgb(var(--brand-bright-rgb, 227 34 39) / <alpha-value>)", soft: "rgb(var(--brand-soft-rgb, 252 233 232) / <alpha-value>)" },
                dim: "#77787d",
                ground: "#f8f8f6",
            },
            fontFamily: {
                sans: ["var(--font-sans)", "system-ui", "sans-serif"],
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            boxShadow: {
                card: "0px 2px 10px 0px rgba(0,0,0,0.05)",
            },
            keyframes: {
                "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
                "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
} satisfies Config;
