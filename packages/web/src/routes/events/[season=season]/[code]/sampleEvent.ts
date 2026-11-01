import {
    EventType,
    type EventHeaderQuery,
    type EventPageQuery,
} from "$lib/graphql/generated/graphql-operations";
import { SAMPLE_MATCH_EVENT, SAMPLE_MATCH_TEAMS } from "$lib/components/skeleton/sampleMatches";

export const SAMPLE_EVENT: NonNullable<EventHeaderQuery["eventByCode"]> = {
    season: 2025,
    code: "SAMPLE",
    name: "Southeast Raleigh High School Qualifier",
    type: EventType.Qualifier,
    remote: false,
    allianceCount: 4,
    start: "2026-02-15",
    end: "2026-02-15",
    started: true,
    published: true,
    timezone: "America/New_York",
    website: "https://example.org",
    liveStreamURL: null,
    relatedEvents: [],
    location: { venue: "Southeast Raleigh High School", city: "Raleigh", state: "NC", country: "USA" },
    livestreamsByDay: [],
};

export const SAMPLE_EVENT_TEAMS = Array.from({ length: 24 }, (_, i) => {
    const team = SAMPLE_MATCH_TEAMS[i % SAMPLE_MATCH_TEAMS.length];
    return {
        season: SAMPLE_MATCH_EVENT.season,
        eventCode: SAMPLE_MATCH_EVENT.code,
        teamNumber: team.number,
        team: { ...team, location: { city: "Raleigh", state: "NC", country: "USA" } },
    };
}) as unknown as NonNullable<EventPageQuery["eventByCode"]>["teams"];
