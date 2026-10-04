import { GraphQLFieldConfig, GraphQLObjectType } from "graphql";
import { DateTimeTy, IntTy, Season, StrTy, list, makeGQLEnum, nn, nullTy } from "@ftc-scout/common";
import { Event } from "../../db/entities/Event";
import { MatchVideoTimestamp } from "../../db/entities/MatchVideoTimestamp";
import { TimestampJob, TimestampJobStatus } from "../../db/entities/TimestampJob";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const RECENT_JOB_COUNT = 20;
const MAX_QUEUED_JOBS = 20;
const REPEAT_COOLDOWN_MS = 10 * 60 * 1000;

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
            resolve: (t: MatchVideoTimestamp) =>
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
            if (latestJob && isActiveOrRecentlyFinished(latestJob)) return latestJob;

            let queuedJobs = await TimestampJob.countBy({ status: TimestampJobStatus.Queued });
            if (queuedJobs >= MAX_QUEUED_JOBS) throw new Error("Too many timestamp jobs are waiting. Try again later.");

            return TimestampJob.create({ season, eventCode, videoId }).save();
        },
    },
};
