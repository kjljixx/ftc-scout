import {
    Alliance,
    TournamentLevel,
    type FullMatchFragment,
} from "../../graphql/generated/graphql-operations";

type Teams = FullMatchFragment["teams"];

function matchesPlayedSoFar(allMatches: FullMatchFragment[], teamNumber: number): number {
    return allMatches.filter(
        (m) =>
            m.tournamentLevel === TournamentLevel.Quals &&
            m.scores !== null &&
            m.teams.some((t) => t.teamNumber === teamNumber && !t.noShow && !t.dq && t.onField)
    ).length;
}

function weightedOpr(allMatches: FullMatchFragment[], eventTeams: any[], teamNumber: number) {
    const matchEventTeam = eventTeams.find((et) => et.team.number === teamNumber);
    const previousBestOpr = matchEventTeam?.previousBestOpr ?? null;
    const currentOpr = matchEventTeam?.stats?.opr?.totalPointsNp ?? null;
    if (currentOpr !== null && previousBestOpr == null) return currentOpr;
    if (currentOpr == null && previousBestOpr !== null) return previousBestOpr;
    if (currentOpr == null && previousBestOpr == null) return 0;

    const currentWeight =
        allMatches.filter((m) => m.tournamentLevel === TournamentLevel.Quals).length > 0
            ? Math.min(matchesPlayedSoFar(allMatches, teamNumber) / 5, 1)
            : 1;
    return currentWeight * currentOpr + (1 - currentWeight) * previousBestOpr;
}

function allianceOprSum(allMatches: FullMatchFragment[], eventTeams: any[], teams: Teams) {
    return teams
        .map((t) =>
            t.noShow || t.dq || !t.onField ? 0 : weightedOpr(allMatches, eventTeams, t.teamNumber)
        )
        .reduce((a, b) => a + b, 0);
}

export function predictScores(
    match: FullMatchFragment,
    allMatches: FullMatchFragment[],
    eventTeams: any[]
) {
    return {
        red: allianceOprSum(
            allMatches,
            eventTeams,
            match.teams.filter((t) => t.alliance == Alliance.Red)
        ),
        blue: allianceOprSum(
            allMatches,
            eventTeams,
            match.teams.filter((t) => t.alliance == Alliance.Blue)
        ),
    };
}
