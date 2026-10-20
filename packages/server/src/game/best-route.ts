import { Alliance } from "@ftc-scout/common";
import { In } from "typeorm";
import { DATA_SOURCE } from "../db/data-source";
import { Match } from "../db/entities/Match";
import { Team } from "../db/entities/Team";
import { getTeamGraph, pickBeaconTeam, type TeamGraph } from "./team-graph";

type Hop = {
    eventCode: string;
    eventName: string;
    season: number;
    match: string;
    relation: "Partners" | "Opponents" | null;
};

export type BestRoute = {
    hops: number;
    path: { number: number; name: string; hop: Hop | null }[];
};

function shortestPath(graph: TeamGraph, from: number, to: number) {
    let parent = new Map<number, number>([[from, from]]);
    let frontier = [from];
    while (frontier.length && !parent.has(to)) {
        let next: number[] = [];
        for (let team of frontier) {
            for (let matchIndex of graph.teamMatches.get(team) ?? []) {
                for (let other of graph.matchTeams[matchIndex]) {
                    if (parent.has(other)) continue;
                    parent.set(other, team);
                    next.push(other);
                }
            }
        }
        frontier = next;
    }
    if (!parent.has(to)) return { path: null, visited: parent.size };

    let path = [to];
    while (path[0] != from) path.unshift(parent.get(path[0])!);
    return { path, visited: parent.size };
}

async function hopBetween(from: number, to: number): Promise<Hop> {
    let [row]: {
        season: number;
        event_code: string;
        match_id: number;
        from_alliance: Alliance;
        to_alliance: Alliance;
    }[] = await DATA_SOURCE.query(
        `SELECT a.season, a.event_code, a.match_id, a.alliance AS from_alliance, b.alliance AS to_alliance
        FROM team_match_participation a
        JOIN team_match_participation b
            ON a.season = b.season AND a.event_code = b.event_code AND a.match_id = b.match_id
        WHERE a.team_number = $1 AND b.team_number = $2
        ORDER BY a.season DESC, a.match_id DESC LIMIT 1`,
        [from, to]
    );
    let match = await Match.findOneOrFail({
        where: {
            eventSeason: row.season as Match["eventSeason"],
            eventCode: row.event_code,
            id: row.match_id,
        },
        relations: { event: true },
    });
    let hasAlliances = row.from_alliance != Alliance.Solo;
    return {
        eventCode: match.eventCode,
        eventName: match.event.name,
        season: match.eventSeason,
        match: match.description,
        relation: hasAlliances
            ? row.from_alliance == row.to_alliance
                ? "Partners"
                : "Opponents"
            : null,
    };
}

export type CrosshairHint = { season: number; code: string; name: string };
export type BeaconHint =
    | { alreadyAdjacent: true; team: null }
    | { alreadyAdjacent: false; team: { number: number; name: string } };

export async function getCrosshairHint(from: number, to: number): Promise<CrosshairHint | null> {
    const started = Date.now();
    const graph = await getTeamGraph();
    const { path, visited } = shortestPath(graph, from, to);
    if (!path || path.length < 2) {
        console.info(`[game] crosshair unavailable ${from}>${to} visited=${visited}`);
        return null;
    }
    const hop = await hopBetween(path[0], path[1]);
    console.info(
        `[game] crosshair ${from}>${to} event=${hop.season}/${
            hop.eventCode
        } visited=${visited} ms=${Date.now() - started}`
    );
    return { season: hop.season, code: hop.eventCode, name: hop.eventName };
}

export async function getBeaconHint(from: number, to: number): Promise<BeaconHint | null> {
    const started = Date.now();
    const graph = await getTeamGraph();
    const pick = pickBeaconTeam(graph, from, to);
    if (!pick || pick.distance < 1) {
        console.info(`[game] beacon unavailable ${from}>${to}`);
        return null;
    }
    const { distance, candidates, pool, preference, visited } = pick;
    if (distance === 1) {
        console.info(
            `[game] beacon already adjacent ${from}>${to} visited=${visited} ms=${
                Date.now() - started
            }`
        );
        return { alreadyAdjacent: true, team: null };
    }
    const team = await Team.findOneByOrFail({ number: pick.team });
    console.info(
        `[game] beacon ${from}>${to} team=${
            team.number
        } hops=${distance} candidates=${candidates} pool=${pool} regionPreference=${preference} weighting=shortest-paths visited=${visited} ms=${
            Date.now() - started
        }`
    );
    return { alreadyAdjacent: false, team: { number: team.number, name: team.name } };
}

export async function bestRoute(from: number, to: number): Promise<BestRoute | null> {
    let startMs = Date.now();
    let graph = await getTeamGraph();
    let { path, visited } = shortestPath(graph, from, to);
    if (!path) {
        console.warn(
            `[game] best route none ${from}>${to} visited=${visited} ms=${Date.now() - startMs}`
        );
        return null;
    }

    let teams = await Team.findBy({ number: In(path) });
    let names = new Map(teams.map((t) => [t.number, t.name]));
    let hops = await Promise.all(path.slice(1).map((team, i) => hopBetween(path![i], team)));

    console.info(
        `[game] best route ${from}>${to} hops=${path.length - 1} visited=${visited} ms=${
            Date.now() - startMs
        } path=${path.join(">")}`
    );
    return {
        hops: path.length - 1,
        path: path.map((number, i) => ({
            number,
            name: names.get(number) ?? `${number}`,
            hop: i == 0 ? null : hops[i - 1],
        })),
    };
}
