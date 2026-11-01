import {
    Alliance,
    AwardType,
    Station,
    type TeamHeaderQuery,
    type TeamQuery,
} from "$lib/graphql/generated/graphql-operations";
import { SAMPLE_MATCH_EVENT, sampleMatches } from "$lib/components/skeleton/sampleMatches";
import type { ComponentProps } from "svelte";
import type TeamEventCard from "./TeamEventCard.svelte";

export const SAMPLE_TEAM: NonNullable<TeamHeaderQuery["teamByNumber"]> = {
    number: 16072,
    name: "Quantum Quacks",
    website: "https://quantumquacks.org",
    schoolName: "Holly Springs High School",
    sponsors: [],
    rookieYear: 2019,
    activeSeasons: [],
    location: { city: "Holly Springs", state: "NC", country: "USA" },
};

export const SAMPLE_QUICK_STATS = {
    tot: { value: 31.18, rank: 4508, stdErr: null },
    count: 9763,
} as unknown as NonNullable<NonNullable<TeamQuery["teamByNumber"]>["quickStats"]>;

type TeamEvent = NonNullable<NonNullable<TeamQuery["teamByNumber"]>["events"]>[number];

export function sampleTeamEvent(matchCount: number) {
    const matches = sampleMatches(matchCount);
    return {
        event: {
            ...SAMPLE_MATCH_EVENT,
            name: "Southeast Raleigh High School Qualifier",
            start: "2026-02-15",
            end: "2026-02-15",
            location: { city: "Raleigh", state: "NC", country: "USA" },
            relatedEvents: [],
            teams: [],
            matches,
        },
        stats: {
            rank: 19,
            wins: 1,
            losses: 4,
            ties: 0,
            rp: 1.6,
            opr: { totalPointsNp: 31.18 },
            avg: { totalPointsNp: 65.4 },
        },
        awards: [{ type: AwardType.Inspire, placement: 3, personName: null }],
        matches: matches.map((match) => ({ alliance: Alliance.Red, station: Station.One, match })),
    } as unknown as TeamEvent & ComponentProps<TeamEventCard>["tep"];
}
