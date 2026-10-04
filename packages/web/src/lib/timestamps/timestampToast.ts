import { writable } from "svelte/store";
import { notEmpty } from "@ftc-scout/common";
import { getClient } from "$lib/graphql/client";
import {
    EventLivestreamsDocument,
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
    failure: string | null;
};

export const timestampToast = writable<TimestampToast | null>(null);

export const knownVideoUrls = writable(new Map<string, string>());

export function matchKey(season: number, eventCode: string, matchId: number): string {
    return `${season}-${eventCode}-${matchId}`;
}

const POLL_INTERVAL_MS = 500;
const GIVE_UP_AFTER_MS = 10 * 60 * 1000;
const SECONDS_PER_VIDEO = 10;
const PROGRESS_TIME_CONSTANT_S = SECONDS_PER_VIDEO / 3;
const MAX_PROGRESS_PER_VIDEO = 0.99;
const YOUTUBE_ID_PATTERN = /(?:v=|youtu\.be\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/;

type VideoTimestamp = FullMatchFragment["videoTimestamps"][number];

let currentRun = 0;
let retryMatch: FullMatchFragment | null = null;

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

export function livestreamVideoIds(
    livestreamsByDay: { day: string | Date; liveStreamURL?: string | null }[],
    liveStreamURL?: string | null
): string[] {
    let byDay = [...livestreamsByDay].sort(
        (a, b) => new Date(a.day).getTime() - new Date(b.day).getTime()
    );
    let urls = [...byDay.map((l) => l.liveStreamURL), liveStreamURL];
    return [...new Set(urls.map((url) => youtubeVideoId(url)).filter(notEmpty))];
}

async function loadLivestreamVideoIds(match: FullMatchFragment): Promise<string[]> {
    let { data } = await getClient().query({
        query: EventLivestreamsDocument,
        variables: { season: match.season, code: match.eventCode },
    });
    return livestreamVideoIds(
        data.eventByCode?.livestreamsByDay ?? [],
        data.eventByCode?.liveStreamURL
    );
}

export function requestMatchTimestamp(match: FullMatchFragment, knownVideoIds?: string[]) {
    let run = ++currentRun;
    retryMatch = match;
    timestampToast.set({
        description: match.description,
        videoNumber: 1,
        videoCount: knownVideoIds?.length || 1,
        progress: 0,
        readyUrl: null,
        readyStartSeconds: null,
        failure: null,
    });
    startRun(run, match, knownVideoIds).catch((error) => {
        failWith(run, error?.message || "Something went wrong.");
    });
}

async function startRun(run: number, match: FullMatchFragment, knownVideoIds?: string[]) {
    let videoIds = knownVideoIds ?? (await loadLivestreamVideoIds(match));
    if (run != currentRun) return;
    if (videoIds.length == 0) {
        failWith(run, "No livestream is listed for this event.");
        return;
    }
    timestampToast.update((t) => (t ? { ...t, videoCount: videoIds.length } : t));
    await followProgress(run, match, videoIds);
}

export function submitLivestreamLink(link: string) {
    let videoId = youtubeVideoId(link);
    if (!videoId) {
        timestampToast.update((t) => (t ? { ...t, failure: "That doesn't look like a YouTube link." } : t));
        return;
    }
    if (retryMatch) requestMatchTimestamp(retryMatch, [videoId]);
}

function failWith(run: number, message: string) {
    if (run == currentRun) timestampToast.update((t) => (t ? { ...t, failure: message } : t));
}

function describeJobError(error: string | null | undefined): string {
    let text = error ?? "";
    if (/private video/i.test(text)) return "This video is private.";
    if (/not available|unavailable/i.test(text)) return "This video is unavailable.";
    let cleaned = text.replace(/^\w*Error: /, "").replace(/ERROR: \[\w+\] \S+: /, "").trim();
    return cleaned ? `${cleaned}.` : "The timestamper couldn't read this video.";
}

function describeFailure(
    jobs: { videoId: string; status: TimestampJobStatus; error?: string | null }[],
    videoIds: string[]
): string {
    for (let videoId of videoIds) {
        let failedJob = jobs.find((j) => j.videoId == videoId && j.status == TimestampJobStatus.Failed);
        if (failedJob) return describeJobError(failedJob.error);
    }
    return "This match wasn't found in the stream.";
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
        rememberVideoUrls(match.season, match.eventCode, data.eventByCode?.matches ?? [], videoIds);
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
        if (finishedCount == videoIds.length) {
            failWith(run, describeFailure(data.timestampJobs ?? [], videoIds));
            return;
        }

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

    failWith(run, "Timed out waiting for the timestamper.");
}

function rememberVideoUrls(
    season: number,
    eventCode: string,
    matches: { id: number; videoTimestamps: VideoTimestamp[] }[],
    videoIds: string[]
) {
    let found = new Map<string, string>();
    for (let m of matches) {
        let timestamp = firstTimestamp(m.videoTimestamps, videoIds);
        if (timestamp) found.set(matchKey(season, eventCode, m.id), timestamp.url);
    }
    if (found.size > 0) knownVideoUrls.update((known) => new Map([...known, ...found]));
}

function firstTimestamp(timestamps: VideoTimestamp[], videoIds: string[]): VideoTimestamp | null {
    for (let videoId of videoIds) {
        let found = timestamps.find((t) => t.videoId == videoId);
        if (found) return found;
    }
    return timestamps[0] ?? null;
}
