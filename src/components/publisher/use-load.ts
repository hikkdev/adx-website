"use client";

import * as React from "react";
import { messageOf } from "@/lib/api-client";

/**
 * A read keyed by its inputs: the loader runs when `key` changes or
 * `reload` is called, the last answer stays on screen while the next one
 * loads, and a failure carries the API's own sentence. State is only set
 * from the loader's own result, never to mirror a prop.
 */
export function useLoad<T>(key: string, loader: () => Promise<T>): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
    const loaderRef = React.useRef(loader);
    React.useEffect(() => {
        loaderRef.current = loader;
    });
    const [tick, setTick] = React.useState(0);
    const [state, setState] = React.useState<{ stamp: string; data: T | null; error: string | null }>({ stamp: "", data: null, error: null });
    const stamp = `${key}#${tick}`;

    React.useEffect(() => {
        let cancelled = false;
        loaderRef
            .current()
            .then((data) => {
                if (!cancelled) setState({ stamp, data, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setState((current) => ({ stamp, data: current.data, error: messageOf(caught, "Could not reach ADX.") }));
            });
        return () => {
            cancelled = true;
        };
    }, [stamp]);

    const loading = state.stamp !== stamp;
    const reload = React.useCallback(() => setTick((t) => t + 1), []);
    return { data: state.data, error: loading ? null : state.error, loading, reload };
}
