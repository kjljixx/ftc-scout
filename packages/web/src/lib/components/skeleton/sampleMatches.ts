import {
    Alliance,
    AllianceRole,
    Station,
    TournamentLevel,
    type FullMatchFragment,
} from "$lib/graphql/generated/graphql-operations";

const SAMPLE_SEASON = 2025;
export const SAMPLE_EVENT_CODE = "SAMPLE";

export const SAMPLE_MATCH_TEAMS = [
    { number: 12345, name: "Gear Gladiators" },
    { number: 8802, name: "Circuit Breakers" },
    { number: 19044, name: "Null Pointers" },
    { number: 6001, name: "The Hexagons" },
    { number: 16072, name: "Quantum Quacks" },
    { number: 2901, name: "Purple Gears" },
    { number: 30369, name: "Voltz" },
    { number: 3587, name: "Hot Wired" },
];

function participation(matchId: number, slot: number) {
    const team = SAMPLE_MATCH_TEAMS[(matchId * 4 + slot) % SAMPLE_MATCH_TEAMS.length];
    return {
        season: SAMPLE_SEASON,
        eventCode: SAMPLE_EVENT_CODE,
        matchId,
        station: slot % 2 == 0 ? Station.One : Station.Two,
        allianceRole: AllianceRole.Captain,
        alliance: slot < 2 ? Alliance.Red : Alliance.Blue,
        teamNumber: team.number,
        surrogate: false,
        noShow: false,
        dq: false,
        onField: true,
        team: { number: team.number, name: team.name },
    };
}

function sampleScores(matchId: number) {
    const alliance = (offset: number) => ({
        season: SAMPLE_SEASON,
        eventCode: SAMPLE_EVENT_CODE,
        matchId,
        totalPoints: 100 + ((matchId * 37 + offset) % 90),
    });
    return {
        __typename: "MatchScores2025",
        season: SAMPLE_SEASON,
        eventCode: SAMPLE_EVENT_CODE,
        matchId,
        red: alliance(0),
        blue: alliance(11 + 20 * (matchId % 2)),
    };
}

export function sampleMatches(count: number): FullMatchFragment[] {
    return Array.from({ length: count }, (_, i) => {
        const id = i + 1;
        return {
            season: SAMPLE_SEASON,
            eventCode: SAMPLE_EVENT_CODE,
            id,
            matchNum: id,
            series: 0,
            description: `Q-${id}`,
            tournamentLevel: TournamentLevel.Quals,
            scheduledStartTime: null,
            actualStartTime: null,
            videoTimestamps: [],
            scores: sampleScores(id),
            teams: [0, 1, 2, 3].map((slot) => participation(id, slot)),
        } as unknown as FullMatchFragment;
    });
}

export const SAMPLE_MATCH_EVENT = {
    season: SAMPLE_SEASON,
    code: SAMPLE_EVENT_CODE,
    started: true,
    published: true,
    timezone: "America/New_York",
    remote: false,
    allianceCount: 4,
};
