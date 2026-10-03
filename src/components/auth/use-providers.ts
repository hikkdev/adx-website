"use client";

import * as React from "react";
import { providerIds, providersService, type ProviderIds } from "@/services/auth";
import { FACEBOOK_APP_ID_FALLBACK } from "./facebook-button";
import { GOOGLE_CLIENT_ID_FALLBACK } from "./google-button";

/**
 * The provider doors this site can offer — `GET /auth/providers`, read once
 * per visit to a door, the env ids as the fallback. `loaded` false keeps the
 * card from flashing a button the answer then takes away.
 */
export function useProviderIds(): ProviderIds & { loaded: boolean } {
    const fallback = React.useMemo(() => ({ google: GOOGLE_CLIENT_ID_FALLBACK, facebook: FACEBOOK_APP_ID_FALLBACK }), []);
    const [state, setState] = React.useState<ProviderIds & { loaded: boolean }>(() => ({ ...providerIds(null, fallback), loaded: false }));

    React.useEffect(() => {
        let cancelled = false;
        providersService
            .read()
            .then((answer) => {
                if (!cancelled) setState({ ...providerIds(answer, fallback), loaded: true });
            })
            .catch(() => {
                if (!cancelled) setState({ ...providerIds(null, fallback), loaded: true });
            });
        return () => {
            cancelled = true;
        };
    }, [fallback]);

    return state;
}
