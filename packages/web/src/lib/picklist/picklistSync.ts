import { writable } from "svelte/store";
import type { Season } from "@ftc-scout/common";
import { getClient } from "$lib/graphql/client";
import {
    EventPicklistDocument,
    PicklistUpdatedDocument,
} from "$lib/graphql/generated/graphql-operations";

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

type Session = { key: string; refs: number; stop: () => void };

let activeSession: Session | null = null;

function startSession(season: Season, eventCode: string): Session {
    let key = `${season}:${eventCode}`;
    let stopped = false;
    let subscription: { unsubscribe(): void } | null = null;
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
        key,
        refs: 0,
        stop() {
            if (stopped) return;
            stopped = true;
            subscription?.unsubscribe();
            console.info(`[picklist sync] stop ${key}`);
        },
    };
}

function acquirePicklistSync(season: Season, eventCode: string): () => void {
    let key = `${season}:${eventCode}`;
    if (activeSession?.key !== key) {
        activeSession?.stop();
        picklistState.set(EMPTY_STATE);
        activeSession = startSession(season, eventCode);
    }

    let session = activeSession;
    session.refs += 1;

    return () => {
        session.refs -= 1;
        if (session.refs > 0) return;
        session.stop();
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
