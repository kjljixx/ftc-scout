import { DATA_SOURCE } from "../db/data-source";

const REBUILD_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_PAIR_ATTEMPTS = 50;
const DISORIENT_MAX_HOPS = 2;

export type TeamGraph = {
    builtAt: number;
    rootOf: Map<number, number>;
    connectableTeams: number[];
    matchTeams: number[][];
    matchEvents: string[];
    eventKeys: Set<string>;
    teamMatches: Map<number, number[]>;
};

export const eventKey = (season: number, code: string) => `${season}/${code}`;

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
    let matches: { season: number; event_code: string; teams: number[] }[] = await DATA_SOURCE.query(
        "SELECT season, event_code, array_agg(team_number) AS teams FROM team_match_participation GROUP BY season, event_code, match_id"
    );

    let parent = new Map<number, number>();
    let matchTeams: number[][] = [];
    let matchEvents: string[] = [];
    let pooledKeys = new Map<string, string>();
    let teamMatches = new Map<number, number[]>();
    for (let { season, event_code, teams } of matches) {
        let raw = eventKey(season, event_code);
        let key = pooledKeys.get(raw) ?? (pooledKeys.set(raw, raw), raw);
        for (let team of teams) if (!parent.has(team)) parent.set(team, team);
        if (teams.length < 2) continue;

        let first = findRoot(parent, teams[0]);
        for (let i = 1; i < teams.length; i++) {
            parent.set(findRoot(parent, teams[i]), first);
        }

        let matchIndex = matchTeams.push(teams) - 1;
        matchEvents.push(key);
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
    return {
        builtAt: Date.now(),
        rootOf,
        connectableTeams,
        matchTeams,
        matchEvents,
        eventKeys: new Set(pooledKeys.keys()),
        teamMatches,
    };
}

export async function getTeamGraph(): Promise<TeamGraph> {
    if (cached && Date.now() - cached.builtAt < REBUILD_AFTER_MS) return cached;
    building ??= buildTeamGraph()
        .then((g) => (cached = g))
        .finally(() => (building = null));
    return building;
}

export function sharedEvents(graph: TeamGraph, from: number, to: number): Set<string> {
    let events = new Set<string>();
    for (let match of graph.teamMatches.get(from) ?? []) {
        if (graph.matchTeams[match].includes(to)) events.add(graph.matchEvents[match]);
    }
    return events;
}

export function teamDistances(graph: TeamGraph, from: number, maxDepth = Infinity, stopAt?: number): Map<number, number> {
  const distances = new Map<number, number>([[from, 0]]);
  const seenMatches = new Set<number>();
  let frontier = [from];
  for (let depth = 1; depth <= maxDepth && frontier.length && (stopAt === undefined || !distances.has(stopAt)); depth++) {
    const next: number[] = [];
    for (const team of frontier) {
      for (const match of graph.teamMatches.get(team) ?? []) {
        if (seenMatches.has(match)) continue;
        seenMatches.add(match);
        for (const other of graph.matchTeams[match]) {
          if (distances.has(other)) continue;
          distances.set(other, depth);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return distances;
}

export type DisorientPick = { team: number; distance: number; candidates: number };

export function pickDisorientTarget(graph: TeamGraph, current: number, destination: number): DisorientPick | null {
  const fromDestination = teamDistances(graph, destination, Infinity, current);
  const distance = fromDestination.get(current);
  if (distance === undefined) return null;
  const candidates = [...teamDistances(graph, current, DISORIENT_MAX_HOPS)]
    .filter(([team, hops]) => hops > 0 && fromDestination.get(team) === distance)
    .map(([team]) => team);
  if (!candidates.length) return null;
  return { team: candidates[Math.floor(Math.random() * candidates.length)], distance, candidates: candidates.length };
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
