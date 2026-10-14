import { DATA_SOURCE } from "../db/data-source";

const REBUILD_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_PAIR_ATTEMPTS = 50;

type TeamComponents = {
    builtAt: number;
    rootOf: Map<number, number>;
    connectableTeams: number[];
};

let cached: TeamComponents | null = null;
let building: Promise<TeamComponents> | null = null;

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

async function buildTeamComponents(): Promise<TeamComponents> {
    let startMs = Date.now();
    let matches: { teams: number[] }[] = await DATA_SOURCE.query(
        "SELECT array_agg(team_number) AS teams FROM team_match_participation GROUP BY season, event_code, match_id"
    );

    let parent = new Map<number, number>();
    for (let { teams } of matches) {
        for (let team of teams) if (!parent.has(team)) parent.set(team, team);
        let first = findRoot(parent, teams[0]);
        for (let i = 1; i < teams.length; i++) {
            parent.set(findRoot(parent, teams[i]), first);
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
        `[game] components matches=${matches.length} teams=${rootOf.size} connectable=${connectableTeams.length} components=${sizes.size} largest=${Math.max(...sizes.values())} ms=${Date.now() - startMs}`
    );
    return { builtAt: Date.now(), rootOf, connectableTeams };
}

export async function getTeamComponents(): Promise<TeamComponents> {
    if (cached && Date.now() - cached.builtAt < REBUILD_AFTER_MS) return cached;
    building ??= buildTeamComponents()
        .then((c) => (cached = c))
        .finally(() => (building = null));
    return building;
}

export async function randomConnectedPair(): Promise<{ pair: [number, number]; attempts: number }> {
    let { rootOf, connectableTeams } = await getTeamComponents();
    let random = () => connectableTeams[Math.floor(Math.random() * connectableTeams.length)];

    for (let attempts = 1; attempts <= MAX_PAIR_ATTEMPTS; attempts++) {
        let a = random();
        let b = random();
        if (rootOf.get(a) === rootOf.get(b)) return { pair: [a, b], attempts };
    }
    throw new Error(`No connected pair found in ${MAX_PAIR_ATTEMPTS} attempts.`);
}
