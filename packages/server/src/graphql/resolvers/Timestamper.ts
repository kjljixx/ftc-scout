import { GraphQLFieldConfig, GraphQLObjectType } from "graphql";
import { DateTimeTy, IntTy, Season, StrTy, list, makeGQLEnum, nn, nullTy } from "@ftc-scout/common";
import { Event } from "../../db/entities/Event";
import { EventVideo } from "../../db/entities/EventVideo";
import { TimestampJob, TimestampJobStatus } from "../../db/entities/TimestampJob";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const RECENT_JOB_COUNT = 20;
const MAX_QUEUED_JOBS = 20;
const REPEAT_COOLDOWN_MS = 60 * 1000;
const MIN_VISIBLE_S = 30;

export type VideoTimestamp = {
    videoId: string;
    startSeconds: number;
    frames: number;
    agreeingFrames: number;
    source: string;
};

export function videoTimestampsFor(
    videos: EventVideo[],
    actualStartTime: Date | null,
    nowMs = Date.now()
): VideoTimestamp[] {
    if (!actualStartTime) return [];
    return videos.flatMap((video) => {
        let startSeconds = Math.round((actualStartTime.getTime() - video.wallStart.getTime()) / 1000);
        let durationS = video.durationS ?? (nowMs - video.wallStart.getTime()) / 1000;
        if (startSeconds < 0 || startSeconds > durationS - MIN_VISIBLE_S) return [];
        return [{ videoId: video.videoId, startSeconds, frames: 0, agreeingFrames: 0, source: "predicted" }];
    });
}

export async function eventVideosFor(events: { season: Season; eventCode: string }[]): Promise<EventVideo[][]> {
    let unique = [
        ...new Map(
            events.map((e) => [`${e.season}|${e.eventCode}`, { season: e.season, eventCode: e.eventCode }])
        ).values(),
    ];
    let divisions = await Event.find({
        where: unique.map((e) => ({ season: e.season, divisionCode: e.eventCode })),
    });
    let sources = [...unique, ...divisions.map((d) => ({ season: d.season, eventCode: d.code }))];
    let videos = await EventVideo.find({ where: sources });
    return events.map((e) => {
        let divisionCodes = divisions
            .filter((d) => d.season == e.season && d.divisionCode == e.eventCode)
            .map((d) => d.code);
        let own = videos.filter((v) => v.season == e.season && v.eventCode == e.eventCode);
        let borrowed = videos.filter((v) => v.season == e.season && divisionCodes.includes(v.eventCode));
        return [...own, ...borrowed];
    });
}

function isActiveOrRecentlyFinished(job: TimestampJob): boolean {
    if (job.status == TimestampJobStatus.Queued || job.status == TimestampJobStatus.Running) return true;
    return job.finishedAt != null && Date.now() - job.finishedAt.getTime() < REPEAT_COOLDOWN_MS;
}

export const TimestampJobStatusGQL = makeGQLEnum(TimestampJobStatus, "TimestampJobStatus");

export const MatchVideoTimestampGQL = new GraphQLObjectType({
    name: "MatchVideoTimestamp",
    fields: {
        videoId: StrTy,
        startSeconds: IntTy,
        frames: IntTy,
        agreeingFrames: IntTy,
        source: StrTy,
        url: {
            ...StrTy,
            resolve: (t: VideoTimestamp) =>
                `https://www.youtube.com/watch?v=${t.videoId}&t=${t.startSeconds}s`,
        },
    },
});

export const TimestampJobGQL = new GraphQLObjectType({
    name: "TimestampJob",
    fields: {
        id: IntTy,
        season: IntTy,
        eventCode: StrTy,
        videoId: StrTy,
        status: { type: nn(TimestampJobStatusGQL) },
        matchesFound: nullTy(IntTy),
        error: nullTy(StrTy),
        createdAt: DateTimeTy,
        startedAt: nullTy(DateTimeTy),
        finishedAt: nullTy(DateTimeTy),
    },
});

export const TimestamperQueries: Record<string, GraphQLFieldConfig<any, any>> = {
    timestampJob: {
        type: TimestampJobGQL,
        args: { id: IntTy },
        resolve: (_, { id }) => TimestampJob.findOneBy({ id }),
    },
    timestampJobs: {
        type: list(nn(TimestampJobGQL)),
        args: { season: IntTy, eventCode: StrTy },
        resolve: (_, { season, eventCode }) =>
            TimestampJob.find({
                where: { season, eventCode },
                order: { id: "DESC" },
                take: RECENT_JOB_COUNT,
            }),
    },
};

export const TimestamperMutations: Record<string, GraphQLFieldConfig<any, any>> = {
    requestTimestamps: {
        type: nn(TimestampJobGQL),
        args: { season: IntTy, eventCode: StrTy, videoId: StrTy },
        resolve: async (
            _,
            { season, eventCode, videoId }: { season: Season; eventCode: string; videoId: string }
        ) => {
            if (!VIDEO_ID_PATTERN.test(videoId)) throw new Error(`Invalid YouTube video id: ${videoId}`);
            if (!(await Event.findOneBy({ season, code: eventCode }))) {
                throw new Error(`No event ${eventCode} in season ${season}.`);
            }

            let latestJob = await TimestampJob.findOne({
                where: { season, eventCode, videoId },
                order: { id: "DESC" },
            });
            if (latestJob && (await EventVideo.countBy({ season, eventCode, videoId })) > 0) return latestJob;
            if (latestJob && isActiveOrRecentlyFinished(latestJob)) return latestJob;

            let queuedJobs = await TimestampJob.countBy({ status: TimestampJobStatus.Queued });
            if (queuedJobs >= MAX_QUEUED_JOBS) throw new Error("Too many timestamp jobs are waiting. Try again later.");

            return TimestampJob.create({ season, eventCode, videoId }).save();
        },
    },
    clearTimestamps: {
        ...IntTy,
        args: { season: IntTy, eventCode: StrTy },
        resolve: async (_, { season, eventCode }: { season: Season; eventCode: string }) => {
            let videos = await EventVideo.delete({ season, eventCode });
            let jobs = await TimestampJob.delete({ season, eventCode });
            console.log(`Cleared timestamps for ${season} ${eventCode}: ${videos.affected} videos, ${jobs.affected} jobs`);
            return (videos.affected ?? 0) + (jobs.affected ?? 0);
        },
    },
};
