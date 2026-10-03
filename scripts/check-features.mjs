/**
 * Every website folder belongs to a feature — Lot G (answer 144), the
 * website's half (28 Sep 2026).
 *
 * `features.manifest.json` at the package root maps what is under
 * `src/app` and `src/components` to feature keys, named from `src`:
 * `app/advertiser/campaigns`, `components/booking`. This walks EVERY folder
 * under the two roots (at any depth — a page three levels down is a page),
 * plus the route files at the root of `src/app` a visitor reaches (the home
 * page, the 404, the sitemap, robots.txt) as `app/<file>`, and fails when:
 *
 *   - one of them sits under no declared path (the longest path wins, so a
 *     side's root — `app/publisher` — is the net under its finer keys);
 *   - a declared path names nothing on disk (a page moved or was deleted
 *     without the manifest following);
 *   - a path is a bare root (`app`, `components`), or outside both — a
 *     root would cover every folder and prove nothing;
 *   - a key is not `<area>.<capability>`, names no paths, or lists a
 *     variant that is not a slug or twice;
 *   - an entry carries some of kind / owner / launch / description but not
 *     all four, or a kind or launch the registry does not know;
 *   - the manifest is for another surface.
 *
 * A path may sit under more than one key (the user app's rule): the folder
 * belongs to its longest-path feature, and every key that draws a control
 * in it names it. The backend's `npm run features:sync` folds the manifest
 * into `docs/feature-registry.json` beside the console's and the two apps',
 * which is how Settings -> Feature flags lists a website feature the moment
 * it exists; a key only the website knows must carry all four fields there.
 *
 * Run with `npm run check:features`; `npm run lint` runs it too. The check
 * itself is `checkFeatures(items, manifest)` — pure, so
 * `src/lib/check-features.test.ts` can hand it a manifest and a tree and
 * read the problems back — and `main()` is the walk plus the exit code.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved when main() runs, not at import: the test imports this module
// through Vitest, whose module URLs are not file: URLs. fileURLToPath, not
// URL.pathname: the repository path contains spaces.
const root = () => fileURLToPath(new URL('..', import.meta.url));

/** `<area>.<capability>` — lower-case, dot-separated, hyphens allowed. The backend's `FEATURE_KEY`. */
export const KEY = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/;
/** A variant the console may choose (MG2): a slug, the way the backend's `variants` are. */
export const VARIANT = /^[a-z][a-z0-9-]*$/;
export const SURFACE = 'WEBSITE';
/** The two trees under `src` whose folders must each belong to a feature. */
export const ROOTS = ['app', 'components'];
/** The registry's kinds and launches (`shared/features/registry.ts`). */
const KINDS = ['FEATURE', 'KILL_SWITCH', 'EXPERIMENT'];
const LAUNCHES = ['on', 'dark'];
const METADATA = ['owner', 'kind', 'launch', 'description'];
/**
 * The files at the root of `src/app` that are a page a visitor reaches: the
 * home, the 404, the error page, the sitemap, robots.txt and the app
 * manifest. The layout, the global styles and tests are the shell, not a
 * feature.
 */
export const ROOT_ROUTE_FILE = /^(page|not-found|error|global-error|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.(tsx|ts|jsx|js)$/;

/**
 * What must belong to a feature: every folder under `src/app` and
 * `src/components` — a Next private folder (`_name`) or a dot folder is
 * skipped with everything under it, since neither routes nor ships a
 * component — and each root route file of `src/app`, as `/`-joined paths
 * from `src`.
 */
export function itemsUnder(src) {
    const out = [];
    const walk = (dir, prefix) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
            const path = `${prefix}/${entry.name}`;
            out.push(path);
            walk(join(dir, entry.name), path);
        }
    };
    for (const name of ROOTS) walk(join(src, name), name);
    for (const entry of readdirSync(join(src, 'app'), { withFileTypes: true })) {
        if (entry.isFile() && ROOT_ROUTE_FILE.test(entry.name)) out.push(`app/${entry.name}`);
    }
    return out.sort();
}

function under(path, prefix) {
    return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The check: every item under one declared path (the longest wins), every
 * declared path an item on disk, every key well-formed, the surface
 * WEBSITE. Returns the problems, one line each, and the counts the summary
 * prints.
 */
export function checkFeatures(items, manifest) {
    const problems = [];

    if (manifest?.surface !== SURFACE) problems.push(`surface must be ${SURFACE}, found ${manifest?.surface}`);

    const declared = [];
    const features = manifest?.features ?? {};
    for (const [key, entry] of Object.entries(features)) {
        if (!KEY.test(key)) problems.push(`"${key}" is not <area>.<capability>`);
        if (!Array.isArray(entry?.paths) || entry.paths.length === 0) problems.push(`"${key}" names no paths`);
        for (const path of Array.isArray(entry?.paths) ? entry.paths : []) {
            if (typeof path !== 'string' || !ROOTS.some((name) => path.startsWith(`${name}/`))) {
                problems.push(`"${key}" names ${JSON.stringify(path)} — a path is app/<folder>, app/<root route file> or components/<folder>, never a bare root`);
                continue;
            }
            declared.push({ path, key });
        }
        const given = METADATA.filter((field) => entry?.[field] !== undefined);
        if (given.length > 0 && given.length < METADATA.length) {
            problems.push(`"${key}" carries ${given.join(', ')} but not ${METADATA.filter((field) => !given.includes(field)).join(', ')} — a website-only key carries all four, a shared one none`);
        }
        if (entry?.kind !== undefined && !KINDS.includes(entry.kind)) problems.push(`"${key}" kind must be one of ${KINDS.join(', ')}`);
        if (entry?.launch !== undefined && !LAUNCHES.includes(entry.launch)) problems.push(`"${key}" launch must be 'on' or 'dark'`);
        if (entry?.variants !== undefined) {
            if (!Array.isArray(entry.variants) || entry.variants.length === 0) problems.push(`"${key}" variants must be a non-empty list`);
            for (const variant of Array.isArray(entry.variants) ? entry.variants : []) {
                if (typeof variant !== 'string' || !VARIANT.test(variant)) problems.push(`"${key}" variant ${JSON.stringify(variant)} is not a slug`);
            }
            if (Array.isArray(entry.variants) && new Set(entry.variants).size !== entry.variants.length) problems.push(`"${key}" lists a variant twice`);
        }
    }
    declared.sort((a, b) => b.path.length - a.path.length);

    const covered = new Set();
    for (const item of items) {
        const match = declared.find(({ path }) => under(item, path));
        if (!match) problems.push(`src/${item} belongs to no feature — add its path to features.manifest.json`);
        else covered.add(match.path);
    }
    for (const { path, key } of declared) {
        if (!items.includes(path)) problems.push(`"${key}" names "${path}", which is not a folder under src/app or src/components (nor a root route file) — the page moved, or the manifest is stale`);
    }

    return { problems, items: items.length, paths: new Set(declared.map(({ path }) => path)).size, features: Object.keys(features).length };
}

export function main() {
    // A test points the check at a broken copy through the env, to prove the refusals end to end.
    const file = process.env.CHECK_FEATURES_MANIFEST ? resolve(process.env.CHECK_FEATURES_MANIFEST) : join(root(), 'features.manifest.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const result = checkFeatures(itemsUnder(join(root(), 'src')), manifest);
    if (result.problems.length > 0) {
        console.error(`check-features: ${result.problems.length} problem(s)`);
        for (const problem of result.problems) console.error(`  - ${problem}`);
        process.exit(1);
    }
    const variants = Object.values(manifest.features).reduce((n, entry) => n + (entry.variants?.length ?? 0), 0);
    console.log(
        `check-features: ${result.items} folders and root pages under ${result.paths} paths across ${result.features} features — all covered${variants > 0 ? `; ${variants} variant(s) declared` : ''}.`
    );
}

// Run only as a script; the test imports the check without walking the tree.
if (import.meta.url.startsWith('file:') && process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
