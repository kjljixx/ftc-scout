<script lang="ts" context="module">
    import { Color, NonRankStatColumn, StatSet, StatType } from "@ftc-scout/common";

    const LOCKED_LOCATION = "—";

    const locationStat = new NonRankStatColumn<any>({
        color: Color.White,
        id: "location",
        columnName: "Location",
        dialogName: "Location",
        titleName: "Location",
        sqlExpr: "teamNumber",
        ty: StatType.String,
        getNonRankValue: (d) => {
            const location = d.team.location;
            return {
                ty: "string",
                val: location
                    ? `${location.city.trim()}, ${location.state.trim()}, ${location.country.trim()}`
                    : LOCKED_LOCATION,
            };
        },
    });
</script>

<script lang="ts">
    import type { EventPageQuery } from "$lib/graphql/generated/graphql-operations";
    import { DESCRIPTORS, getTepStatSet, SortDir, type Season } from "@ftc-scout/common";
    import LocalStatTableControls from "$lib/components/stats/LocalStatTableControls.svelte";
    import { radarReach } from "$lib/game/game-store";

    type DataTy = NonNullable<EventPageQuery["eventByCode"]>["teams"][number];

    export let season: Season;
    export let remote: boolean;
    export let eventName: string;
    export let data: DataTy[];
    export let focusedTeam: number | null;

    function hideLockedLocations(rows: DataTy[], roster: number[] | null): DataTy[] {
        if (!roster) return rows;
        return rows.map((row) =>
            roster.includes(row.teamNumber)
                ? row
                : {
                      ...row,
                      team: {
                          ...row.team,
                          location: null as unknown as DataTy["team"]["location"],
                      },
                  }
        );
    }

    $: descriptor = DESCRIPTORS[season];
    $: baseStats = getTepStatSet(season, remote);
    $: stats = $radarReach
        ? new StatSet(baseStats.id, [...baseStats.allStats, locationStat], baseStats.sections)
        : baseStats;
    $: shownData = hideLockedLocations(data, $radarReach);
    $: if ($radarReach) {
        console.info(
            `[game] Radar locations shown=${$radarReach.length} hidden=${
                data.length - $radarReach.length
            }`
        );
    }
    $: totalPoints = descriptor.pensSubtract || remote ? "totalPoints" : "totalPointsNp";
    $: defaultStats = [
        "eventRank",
        "team",
        ...($radarReach ? ["location"] : []),
        "rankingScore",
        "tb1",
        "played",
        totalPoints + "Avg",
        ...(remote ? [] : [totalPoints + "Opr"]),
        totalPoints + "Max",
    ];

    $: saveId = `eventPageTep${season}${remote ? "Remote" : "Trad"}${$radarReach ? "Radar" : ""}`;

    $: underscoreEventName = eventName.replace(" ", "_");
    $: filename = `${season}_${underscoreEventName}_Team_Stats`;
    $: title = `${season} ${eventName} Team Stats`;
    $: csv = { filename, title };
</script>

<LocalStatTableControls
    {saveId}
    data={shownData}
    {focusedTeam}
    {stats}
    {defaultStats}
    defaultSort={{ id: "eventRank", dir: SortDir.Asc }}
    hideRankStats={[
        "eventRank",
        "rankingScore",
        ...(descriptor.rankings.rp == "Record" ? ["record"] : ["totalPointsAvg", "totalPointsTot"]),
    ]}
    {csv}
/>
