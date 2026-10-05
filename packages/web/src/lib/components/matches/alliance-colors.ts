import {
    Alliance,
    TournamentLevel,
    type FullMatchFragment,
} from "../../graphql/generated/graphql-operations";

const PALETTE = [
    "201, 60, 60",
    "184, 92, 15",
    "140, 112, 0",
    "42, 128, 72",
    "19, 126, 140",
    "59, 111, 212",
    "126, 85, 204",
    "181, 61, 181",
];

const WARM_SEEDS = [1, 2];

type FirstRound = Record<number, [number | null, number | null]>;

const FIRST_ROUND: Record<number, FirstRound> = {
    4: { 1: [1, 4], 2: [2, 3] },
    6: { 1: [4, 5], 2: [3, 6], 3: [1, null], 4: [2, null] },
    8: { 1: [1, 8], 2: [4, 5], 3: [2, 7], 4: [3, 6] },
};

export type AllianceSeeds = Map<number, number>;

export function allianceSeeds(matches: FullMatchFragment[], allianceCount: number): AllianceSeeds {
    let seeds: AllianceSeeds = new Map();
    let firstRound = FIRST_ROUND[allianceCount];
    if (!firstRound) return seeds;

    for (let m of matches) {
        if (m.tournamentLevel != TournamentLevel.DoubleElim) continue;
        let [red, blue] = firstRound[m.series] ?? [null, null];
        for (let t of m.teams) {
            let seed = t.alliance == Alliance.Red ? red : t.alliance == Alliance.Blue ? blue : null;
            if (seed != null) seeds.set(t.teamNumber, seed);
        }
    }
    return seeds;
}

export function allianceColorStyle(
    seeds: AllianceSeeds | null,
    match: FullMatchFragment,
    alliance: Alliance
): string | null {
    if (!seeds || match.tournamentLevel != TournamentLevel.DoubleElim) return null;
    let team = match.teams.find((t) => t.alliance == alliance && seeds.has(t.teamNumber));
    if (!team) return null;
    let seed = seeds.get(team.teamNumber)!;
    let warm = WARM_SEEDS.includes(seed) ? "; --alliance-warm: 1" : "";
    return `--alliance-color-vs: ${PALETTE[seed - 1]}${warm}`;
}
