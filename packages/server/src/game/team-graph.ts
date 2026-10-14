import { DATA_SOURCE } from "../db/data-source";

const REBUILD_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_PAIR_ATTEMPTS = 50;

export type TeamGraph = {
    builtAt: number;
    rootOf: Map<number, number>;
    connectableTeams: number[];
    matchTeams: number[][];
    teamMatches: Map<number, number[]>;
};

let cached: TeamGraph | null = null;
let building: Promise<TeamGraph> | null = null;

function findRoot(parent: Map<number, number>, team: number): number {
    let root = team;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(team) !== root) {
        let next = parent.get(team)!;
        parent.set(team, root);
        team = next;
    }
    return root;
}

async function buildTeamGraph(): Promise<TeamGraph> {
    let startMs = Date.now();
    let matches: { teams: number[] }[] = await DATA_SOURCE.query(
        "SELECT array_agg(team_number) AS teams FROM team_match_participation GROUP BY season, event_code, match_id"
    );

    let parent = new Map<number, number>();
    let matchTeams: number[][] = [];
    let teamMatches = new Map<number, number[]>();
    for (let { teams } of matches) {
        for (let team of teams) if (!parent.has(team)) parent.set(team, team);
        if (teams.length < 2) continue;

        let first = findRoot(parent, teams[0]);
        for (let i = 1; i < teams.length; i++) {
            parent.set(findRoot(parent, teams[i]), first);
        }

        let matchIndex = matchTeams.push(teams) - 1;
        for (let team of teams) {
            let indexes = teamMatches.get(team);
            if (indexes) indexes.push(matchIndex);
            else teamMatches.set(team, [matchIndex]);
        }
    }

    let rootOf = new Map<number, number>();
    let sizes = new Map<number, number>();
    for (let team of parent.keys()) {
        let root = findRoot(parent, team);
        rootOf.set(team, root);
        sizes.set(root, (sizes.get(root) ?? 0) + 1);
    }
    let connectableTeams = [...rootOf.keys()].filter((t) => sizes.get(rootOf.get(t)!)! > 1);

    console.info(
        `[game] graph matches=${matches.length} multiTeamMatches=${matchTeams.length} teams=${
            rootOf.size
        } connectable=${connectableTeams.length} components=${sizes.size} largest=${Math.max(
            ...sizes.values()
        )} ms=${Date.now() - startMs}`
    );
    return { builtAt: Date.now(), rootOf, connectableTeams, matchTeams, teamMatches };
}

export async function getTeamGraph(): Promise<TeamGraph> {
    if (cached && Date.now() - cached.builtAt < REBUILD_AFTER_MS) return cached;
    building ??= buildTeamGraph()
        .then((g) => (cached = g))
        .finally(() => (building = null));
    return building;
}

export async function randomConnectedPair(): Promise<{ pair: [number, number]; attempts: number }> {
    let { rootOf, connectableTeams } = await getTeamGraph();
    let random = () => connectableTeams[Math.floor(Math.random() * connectableTeams.length)];

    for (let attempts = 1; attempts <= MAX_PAIR_ATTEMPTS; attempts++) {
        let a = random();
        let b = random();
        if (rootOf.get(a) === rootOf.get(b)) return { pair: [a, b], attempts };
    }
    throw new Error(`No connected pair found in ${MAX_PAIR_ATTEMPTS} attempts.`);
}
