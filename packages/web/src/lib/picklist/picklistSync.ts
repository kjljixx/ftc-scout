import { writable } from "svelte/store";
import type { Season } from "@ftc-scout/common";
import { getClient, resetSubscriptionConnection } from "$lib/graphql/client";
import {
    EventPicklistDocument,
    PicklistUpdatedDocument,
} from "$lib/graphql/generated/graphql-operations";
import { getTeamToken, team } from "$lib/team/team-store";

export type CustomFieldTy = { id: string; name: string; type: string };
export type CustomValueTy = {
    teamNumber: number;
    fieldId: string;
    value: string | number | boolean;
};

export type PicklistState = {
    loaded: boolean;
    teamOrder: number[] | null;
    customFields: CustomFieldTy[];
    customValues: CustomValueTy[];
};

const EMPTY_STATE: PicklistState = {
    loaded: false,
    teamOrder: null,
    customFields: [],
    customValues: [],
};

export const picklistState = writable<PicklistState>(EMPTY_STATE);

type Run = { stop: () => void };
type Session = { key: string; season: Season; eventCode: string; refs: number; run: Run };

let activeSession: Session | null = null;

function startRun(season: Season, eventCode: string): Run {
    let key = `${season}:${eventCode}`;
    let stopped = false;
    let subscription: { unsubscribe(): void } | null = null;

    if (!getTeamToken()) {
        console.info(`[picklist sync] no team, not loading ${key}`);
        picklistState.set({ ...EMPTY_STATE, loaded: true });
        return { stop() {} };
    }
    console.info(`[picklist sync] start ${key}`);

    getClient()
        .query({
            query: EventPicklistDocument,
            variables: { season, eventCode },
            fetchPolicy: "no-cache",
        })
        .then((result) => {
            if (stopped) return;
            let picklist = result.data?.eventPicklist;
            picklistState.set({
                loaded: true,
                teamOrder: picklist?.teamOrder ?? null,
                customFields: picklist?.customFields ?? [],
                customValues: picklist?.customValues ?? [],
            });
            console.info(
                `[picklist sync] loaded ${key}: ${picklist?.teamOrder?.length ?? 0} teams, ` +
                    `${picklist?.customFields?.length ?? 0} custom fields`
            );

            subscription = getClient()
                .subscribe({ query: PicklistUpdatedDocument, variables: { season, eventCode } })
                .subscribe((update) => {
                    let updated = update.data?.picklistUpdated;
                    if (!updated) return;
                    picklistState.update((state) => ({
                        loaded: true,
                        teamOrder: updated?.teamOrder ?? state.teamOrder,
                        customFields: updated?.customFields ?? state.customFields,
                        customValues: updated?.customValues ?? state.customValues,
                    }));
                });
        })
        .catch((error) => {
            console.error(`[picklist sync] load failed for ${key}:`, error);
            if (!stopped) picklistState.update((state) => ({ ...state, loaded: true }));
        });

    return {
        stop() {
            if (stopped) return;
            stopped = true;
            subscription?.unsubscribe();
            console.info(`[picklist sync] stop ${key}`);
        },
    };
}

let lastToken = getTeamToken();
team.subscribe(() => {
    let token = getTeamToken();
    if (token == lastToken) return;
    lastToken = token;
    if (!activeSession) return;

    console.info(`[picklist sync] team changed, restarting ${activeSession.key}`);
    activeSession.run.stop();
    resetSubscriptionConnection();
    picklistState.set(EMPTY_STATE);
    activeSession.run = startRun(activeSession.season, activeSession.eventCode);
});

function acquirePicklistSync(season: Season, eventCode: string): () => void {
    let key = `${season}:${eventCode}`;
    if (activeSession?.key !== key) {
        activeSession?.run.stop();
        picklistState.set(EMPTY_STATE);
        activeSession = { key, season, eventCode, refs: 0, run: startRun(season, eventCode) };
    }

    let session = activeSession;
    session.refs += 1;

    return () => {
        session.refs -= 1;
        if (session.refs > 0) return;
        session.run.stop();
        if (activeSession === session) {
            activeSession = null;
            picklistState.set(EMPTY_STATE);
        }
    };
}

export function createPicklistSyncHandle() {
    let release = () => {};
    return {
        sync(season: Season, eventCode: string) {
            let nextRelease = acquirePicklistSync(season, eventCode);
            release();
            release = nextRelease;
        },
        stop() {
            release();
            release = () => {};
        },
    };
}
