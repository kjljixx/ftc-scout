import { writable } from "svelte/store";
import { getClient } from "$lib/graphql/client";
import {
    RequestTimestampsDocument,
    TimestampJobStatus,
    TimestampProgressDocument,
    type FullMatchFragment,
} from "$lib/graphql/generated/graphql-operations";

export const LIVESTREAM_VIDEOS_CTX = {};
export type LivestreamVideos = { eventCode: string; videoIds: string[] };

export type TimestampToast = {
    description: string;
    videoNumber: number;
    videoCount: number;
    progress: number;
    readyUrl: string | null;
    readyStartSeconds: number | null;
};

export const timestampToast = writable<TimestampToast | null>(null);

const POLL_INTERVAL_MS = 2000;
const GIVE_UP_AFTER_MS = 10 * 60 * 1000;
const SECONDS_PER_VIDEO = 10;
const PROGRESS_TIME_CONSTANT_S = SECONDS_PER_VIDEO / 3;
const MAX_PROGRESS_PER_VIDEO = 0.99;
const YOUTUBE_ID_PATTERN = /(?:v=|youtu\.be\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/;

type VideoTimestamp = FullMatchFragment["videoTimestamps"][number];

let currentRun = 0;

export function youtubeVideoId(url: string | null | undefined): string | null {
    return url?.match(YOUTUBE_ID_PATTERN)?.[1] ?? null;
}

export function formatVideoTime(seconds: number): string {
    let h = Math.floor(seconds / 3600);
    let m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    let s = String(seconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

export function dismissTimestampToast() {
    currentRun += 1;
    timestampToast.set(null);
}

export function requestMatchTimestamp(match: FullMatchFragment, videoIds: string[]) {
    let run = ++currentRun;
    timestampToast.set({
        description: match.description,
        videoNumber: 1,
        videoCount: videoIds.length,
        progress: 0,
        readyUrl: null,
        readyStartSeconds: null,
    });
    followProgress(run, match, videoIds).catch(() => {
        if (run == currentRun) timestampToast.set(null);
    });
}

async function followProgress(run: number, match: FullMatchFragment, videoIds: string[]) {
    let client = getClient();
    for (let videoId of videoIds) {
        await client.mutate({
            mutation: RequestTimestampsDocument,
            variables: { season: match.season, eventCode: match.eventCode, videoId },
        });
    }

    let startedAt = Date.now();
    let runningSince = new Map<string, number>();

    while (run == currentRun && Date.now() - startedAt < GIVE_UP_AFTER_MS) {
        let { data } = await client.query({
            query: TimestampProgressDocument,
            variables: { season: match.season, eventCode: match.eventCode },
            fetchPolicy: "network-only",
        });
        if (run != currentRun) return;

        let thisMatch = data.eventByCode?.matches?.find((m) => m.id == match.id);
        let found = firstTimestamp(thisMatch?.videoTimestamps ?? [], videoIds);
        if (found) {
            let { url, startSeconds } = found;
            timestampToast.update((t) =>
                t ? { ...t, progress: 1, readyUrl: url, readyStartSeconds: startSeconds } : t
            );
            return;
        }

        let latestJobs = new Map<string, TimestampJobStatus>();
        for (let job of data.timestampJobs ?? []) {
            if (!latestJobs.has(job.videoId)) latestJobs.set(job.videoId, job.status);
        }
        let isFinished = (id: string) => {
            let status = latestJobs.get(id);
            return status == TimestampJobStatus.Done || status == TimestampJobStatus.Failed;
        };

        let finishedCount = videoIds.filter(isFinished).length;
        if (finishedCount == videoIds.length) break;

        let currentVideoProgress = 0;
        let runningId = videoIds.find((id) => latestJobs.get(id) == TimestampJobStatus.Running);
        if (runningId) {
            let since = runningSince.get(runningId) ?? Date.now();
            runningSince.set(runningId, since);
            let elapsedS = (Date.now() - since) / 1000;
            currentVideoProgress = Math.min(
                1 - Math.exp(-elapsedS / PROGRESS_TIME_CONSTANT_S),
                MAX_PROGRESS_PER_VIDEO
            );
        }

        timestampToast.update((t) =>
            t
                ? {
                      ...t,
                      videoNumber: Math.min(finishedCount + 1, videoIds.length),
                      progress: (finishedCount + currentVideoProgress) / videoIds.length,
                  }
                : t
        );
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (run == currentRun) timestampToast.set(null);
}

function firstTimestamp(timestamps: VideoTimestamp[], videoIds: string[]): VideoTimestamp | null {
    for (let videoId of videoIds) {
        let found = timestamps.find((t) => t.videoId == videoId);
        if (found) return found;
    }
    return timestamps[0] ?? null;
}
