import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api-client";
import type { BlockTypeDef, LayoutBlock, VersionView } from "@/services/studio";

/**
 * ST-1: a smoke render of the editor shell. Puck itself is replaced by a
 * stub that renders the page through the config's `render` functions and
 * calls `onChange` the way Puck does; the services are mocked. What is
 * under test is Studio's own wiring: loading, the resolved canvas, the
 * toolbar, the save state, autosave, and the seed fallback.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/studio" }));

vi.mock("@/lib/studio-auth", () => ({
    useStudioAuth: () => ({ status: "signed-in", user: { id: "u1", name: "Ops", email: "ops@adx.in", roles: ["ADMIN"] }, permissions: ["content.view", "content.edit", "content.approve", "content.delete"], can: (id: string) => id !== "content.addresses", mustEnrolAuthenticator: false, signOut: vi.fn(), consoleUrl: "http://console.test" }),
}));

/* Puck, stubbed: enough of its surface for the shell — the compositional pieces, the store hook, the field label. */
vi.mock("@puckeditor/core", async () => {
    const React = await import("react");
    type Item = { type: string; props: Record<string, unknown> & { id: string } };
    type Ctx = { config: { components: Record<string, { render: (props: Record<string, unknown>) => React.ReactElement; label?: string }> }; data: { content: Item[] } };
    const PuckContext = React.createContext<Ctx | null>(null);
    let pushChange: ((data: { root: { props: Record<string, unknown> }; content: Item[] }) => void) | null = null;

    function Puck({ config, data, children, onChange }: { config: Ctx["config"]; data: Ctx["data"]; children: React.ReactNode; onChange?: (data: unknown) => void }) {
        const [state, setState] = React.useState(data);
        React.useEffect(() => {
            pushChange = (next) => {
                setState(next);
                onChange?.(next);
            };
            onChange?.(state);
            return () => {
                pushChange = null;
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return <PuckContext.Provider value={{ config, data: state }}>{children}</PuckContext.Provider>;
    }
    Puck.Preview = function Preview() {
        const ctx = React.useContext(PuckContext)!;
        return (
            <div data-testid="puck-preview">
                {ctx.data.content.map((item) => {
                    const component = ctx.config.components[item.type];
                    return <div key={item.props.id}>{component ? component.render({ ...item.props, puck: {} }) : `No configuration for ${item.type}`}</div>;
                })}
            </div>
        );
    };
    Puck.Fields = function Fields() {
        return <div data-testid="puck-fields" />;
    };
    Puck.Components = function Components() {
        const ctx = React.useContext(PuckContext)!;
        return <ul data-testid="puck-components">{Object.entries(ctx.config.components).map(([type, component]) => <li key={type}>{component.label ?? type}</li>)}</ul>;
    };
    Puck.Outline = function Outline() {
        return <div data-testid="puck-outline" />;
    };
    const usePuck = () => ({ dispatch: vi.fn(), history: { back: vi.fn(), forward: vi.fn(), hasPast: false, hasFuture: false }, selectedItem: null, getSelectorForId: () => undefined, appState: { ui: { viewports: { current: { width: 1280 } } } } });
    const FieldLabel = ({ label, children }: { label: string; children?: React.ReactNode }) => (
        <div>
            <span>{label}</span>
            {children}
        </div>
    );
    return { Puck, usePuck, FieldLabel, __pushChange: (data: unknown) => pushChange?.(data as never) };
});

const types: BlockTypeDef[] = [
    { type: "legacy_home", label: "Home page body", kind: "SYSTEM", surfaces: ["WEB_HOME"], props: [] },
    { type: "popular_rail", label: "Popular listings rail", kind: "SYSTEM", surfaces: ["WEB_EXPLORE"], props: [{ key: "title", label: "Title override", input: "text", max: 80 }] },
    { type: "rich_text", label: "Text", kind: "CONTENT", surfaces: ["WEB_HOME", "WEB_EXPLORE"], props: [{ key: "markdown", label: "Text", input: "markdown", max: 20000 }, { key: "contentSlug", label: "Content page", input: "contentSlug", max: 80 }] },
    { type: "promo_banner", label: "Promo banner", kind: "CONTENT", surfaces: ["WEB_HOME"], props: [{ key: "mediaId", label: "Picture", input: "media", required: true, spec: "PROMO_WIDE" }, { key: "target", label: "Opens", input: "target", required: true }] },
];

const liveBlocks: LayoutBlock[] = [
    { id: "sys-home", type: "legacy_home", props: {} },
    { id: "txt-1", type: "rich_text", props: { markdown: "Hello **world**" }, visibility: { sides: ["ADVERTISER"] } },
    { id: "future-1", type: "hologram", props: { beam: 3 } },
];

const version = (over: Partial<VersionView>): VersionView => ({ id: "v2", number: 2, status: "PUBLISHED", blocks: liveBlocks, changeNote: null, createdAt: "2026-09-27T10:00:00Z", updatedAt: "2026-09-27T10:00:00Z", publishedAt: "2026-09-27T10:00:00Z", retiredAt: null, publishedBy: { id: "u1", name: "Ops" }, ...over });

const api = {
    get: vi.fn(),
    saveDraft: vi.fn(),
    discardDraft: vi.fn(),
    preview: vi.fn(),
    publish: vi.fn(),
    versions: vi.fn(),
    restore: vi.fn(),
    previewToken: vi.fn(),
};

vi.mock("@/services/studio", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/studio")>();
    return {
        ...actual,
        versionApi: () => api,
        studioService: {
            ...actual.studioService,
            layouts: { blockTypes: vi.fn(), list: vi.fn() },
            pages: { ...actual.studioService.pages, get: vi.fn(), list: vi.fn() },
            media: { list: vi.fn(), specs: vi.fn(), upload: vi.fn() },
            slots: vi.fn(),
            forms: vi.fn(),
            cities: vi.fn(),
            listings: vi.fn(),
        },
    };
});

import { studioService } from "@/services/studio";
import { StudioEditor } from "./studio-editor";

const mocked = studioService as unknown as {
    layouts: { blockTypes: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };
    pages: { get: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };
    media: { list: ReturnType<typeof vi.fn>; specs: ReturnType<typeof vi.fn> };
    slots: ReturnType<typeof vi.fn>;
    forms: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
    vi.useRealTimers();
    for (const fn of Object.values(api)) fn.mockReset();
    mocked.layouts.blockTypes.mockResolvedValue(types);
    mocked.pages.get.mockResolvedValue({ id: "p1", key: "home", kind: "SYSTEM", title: "Home", path: "/", internalPath: "/", surface: "WEB_HOME", channels: ["WEBSITE"], addressLocked: true, archivedAt: null, live: version({}), draft: null, updatedAt: "2026-09-27T10:00:00Z", redirectCount: 0 });
    mocked.pages.list.mockResolvedValue([]);
    mocked.media.list.mockResolvedValue([]);
    mocked.media.specs.mockResolvedValue([]);
    mocked.slots.mockResolvedValue([]);
    mocked.forms.mockRejectedValue(new Error("no forms module yet"));
    api.get.mockResolvedValue({ surface: "WEB_HOME", label: "Website — Home page", live: version({}), draft: null, defaults: [] });
    api.preview.mockResolvedValue({ surface: "WEB_HOME", version: 2, isDefault: false, blocks: [{ id: "txt-1", type: "rich_text", props: { markdown: "Hello **world**", resolvedBy: "server" } }] });
    api.saveDraft.mockImplementation(async (input: { blocks: LayoutBlock[] }) => version({ id: "v3", number: 3, status: "DRAFT", blocks: input.blocks, publishedAt: null }));
});

describe("ST-1: the editor shell", () => {
    it("loads a system page, draws its sections as placeholders and its content resolved, with the toolbar around it", async () => {
        render(<StudioEditor target={{ kind: "page", key: "home" }} />);
        expect(screen.getByText("Reading the page…")).toBeInTheDocument();

        await waitFor(() => expect(screen.getByTestId("editor-title")).toHaveTextContent("Home"));
        expect(screen.getByTestId("save-state")).toHaveTextContent("Live v2 · no draft");
        expect(screen.getByTestId("system-block")).toHaveTextContent("Home page body");
        await waitFor(() => expect(screen.getByText("world").tagName).toBe("STRONG"));
        expect(screen.getByTestId("unknown-block")).toHaveTextContent("hologram");
        expect(screen.getByText("Advertiser")).toBeInTheDocument();

        expect(screen.getByTestId("publish")).toBeDisabled();
        expect(screen.getByTestId("open-history")).toBeInTheDocument();
        expect(screen.getByTestId("open-settings")).toBeInTheDocument();
        expect(screen.getByTestId("open-live")).toHaveAttribute("href", "/");
        expect(screen.getByTestId("tab-audience")).toHaveTextContent("Who sees this");
        expect(screen.getByTestId("puck-components")).toHaveTextContent("Home page body");
        expect(screen.getByTestId("puck-components")).toHaveTextContent("Text");

        expect(api.get).toHaveBeenCalledTimes(1);
        expect(api.preview).toHaveBeenCalledWith({ version: 2, side: "VISITOR", cityId: null });
        expect(api.saveDraft).not.toHaveBeenCalled();
    });

    it("saves a change as the draft after 600 ms, then reads it back resolved", async () => {
        const puck = (await import("@puckeditor/core")) as unknown as { __pushChange: (data: unknown) => void };
        render(<StudioEditor target={{ kind: "page", key: "home" }} />);
        await waitFor(() => expect(screen.getByTestId("editor-title")).toHaveTextContent("Home"));
        await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));

        act(() => {
            puck.__pushChange({
                root: { props: {} },
                content: [
                    { type: "legacy_home", props: { id: "sys-home", __adx: {} } },
                    { type: "rich_text", props: { id: "txt-1", markdown: "Changed", __adx: { visibility: { sides: ["ADVERTISER"] } } } },
                ],
            });
        });
        expect(screen.getByTestId("save-state")).toHaveTextContent("Unsaved changes");
        await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1), { timeout: 3000 });
        expect(api.saveDraft.mock.calls[0]![0].blocks).toEqual([
            { id: "sys-home", type: "legacy_home", props: {} },
            { id: "txt-1", type: "rich_text", props: { markdown: "Changed" }, visibility: { sides: ["ADVERTISER"] } },
        ]);
        await waitFor(() => expect(screen.getByTestId("save-state")).toHaveTextContent("Saved · v3 draft"));
        await waitFor(() => expect(api.preview).toHaveBeenLastCalledWith({ version: "draft", side: "VISITOR", cityId: null }));
        expect(api.publish).not.toHaveBeenCalled();
        expect(screen.getByTestId("publish")).toBeEnabled();
    });

    it("shows the server's issues on the block a refused draft names", async () => {
        const puck = (await import("@puckeditor/core")) as unknown as { __pushChange: (data: unknown) => void };
        api.saveDraft.mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "1 problem", { issues: [{ index: 1, blockId: "txt-1", type: "rich_text", path: "props.markdown", message: "Too long" }] }));
        render(<StudioEditor target={{ kind: "page", key: "home" }} />);
        await waitFor(() => expect(screen.getByTestId("editor-title")).toHaveTextContent("Home"));
        act(() => {
            puck.__pushChange({ root: { props: {} }, content: [{ type: "rich_text", props: { id: "txt-1", markdown: "x".repeat(10) } }] });
        });
        await waitFor(() => expect(screen.getByTestId("block-issue")).toHaveTextContent("markdown: Too long"), { timeout: 3000 });
        expect(screen.getByTestId("save-state")).toHaveTextContent("Not saved");
        expect(screen.getByTestId("save-error")).toHaveTextContent("1 problem");
    });

    it("still opens a seeded system page when the page record cannot be read, and an app home in the phone frame", async () => {
        mocked.pages.get.mockRejectedValue(new ApiError(404, "NOT_FOUND", "No such page"));
        const { unmount } = render(<StudioEditor target={{ kind: "page", key: "help" }} />);
        await waitFor(() => expect(screen.getByTestId("editor-title")).toHaveTextContent("Help"));
        expect(screen.getByText(/The page record could not be read/)).toBeInTheDocument();
        expect(screen.getByTestId("open-live")).toHaveAttribute("href", "/help");
        unmount();

        api.get.mockResolvedValue({ surface: "AGENT_HOME", label: "Agent app — Home", live: null, draft: null, defaults: [{ id: "d1", type: "tasks_card", props: {} }] });
        render(<StudioEditor target={{ kind: "surface", surface: "AGENT_HOME" }} />);
        await waitFor(() => expect(screen.getByTestId("editor-title")).toHaveTextContent("Agent app — Home"));
        expect(document.querySelector(".adx-studio-phone")).not.toBeNull();
        expect(screen.getByText(/Check on a phone after publishing/)).toBeInTheDocument();
        expect(screen.queryByTestId("open-settings")).toBeNull();
        expect(screen.getByTestId("save-state")).toHaveTextContent("Default order · no draft");
        expect(mocked.pages.get).toHaveBeenCalledTimes(1);
    });

    it("says what permission a refused save needs and stops saving", async () => {
        const puck = (await import("@puckeditor/core")) as unknown as { __pushChange: (data: unknown) => void };
        api.saveDraft.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Insufficient permissions", { missing: ["content.edit"] }));
        render(<StudioEditor target={{ kind: "page", key: "home" }} />);
        await waitFor(() => expect(screen.getByTestId("editor-title")).toHaveTextContent("Home"));
        act(() => {
            puck.__pushChange({ root: { props: {} }, content: [{ type: "rich_text", props: { id: "txt-1", markdown: "Changed" } }] });
        });
        await waitFor(() => expect(screen.getByTestId("save-error")).toHaveTextContent("content.edit"), { timeout: 3000 });
        expect(screen.getByTestId("save-state")).toHaveTextContent("Read only");
        fireEvent.keyDown(window, { key: "s", ctrlKey: true });
        expect(api.saveDraft).toHaveBeenCalledTimes(1);
    });
});
