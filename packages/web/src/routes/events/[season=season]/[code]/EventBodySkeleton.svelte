<script lang="ts">
    import {
        faBolt,
        faHashtag,
        faLightbulb,
        faList,
        faMedal,
        faTrophy,
    } from "@fortawesome/free-solid-svg-icons";
    import TabbedCard from "$lib/components/tabs/TabbedCard.svelte";
    import MatchTable from "$lib/components/matches/MatchTable.svelte";
    import SampleDataTable from "$lib/components/skeleton/samples/SampleDataTable.svelte";
    import { SAMPLE_MATCH_EVENT, sampleMatches } from "$lib/components/skeleton/sampleMatches";
    import Teams from "./[tab=event_tab]/Teams.svelte";
    import { SAMPLE_EVENT_TEAMS } from "./sampleEvent";

    export let tab: string;

    let selectedTab = tab;

    const TABS: [typeof faBolt, string, string, boolean][] = [
        [faBolt, "Matches", "matches", true],
        [faTrophy, "Rankings", "rankings", true],
        [faList, "Picklist", "picklist", true],
        [faLightbulb, "Insights", "insights", true],
        [faMedal, "Awards", "awards", true],
        [faHashtag, "Teams (24)", "teams", true],
    ];

    const TEAMS = ["Gear Gladiators", "Circuit Breakers", "Null Pointers", "The Hexagons"];
    const SCORES = ["312.4", "298.1", "287.7", "270.3", "251.9"];

    const RANKINGS = [
        { label: "Rank", samples: ["1", "2", "3", "10"] },
        { label: "Team", samples: TEAMS },
        { label: "NP OPR", samples: SCORES, align: "right" as const },
        { label: "Avg", samples: SCORES, align: "right" as const },
        { label: "W-L-T", samples: ["9-0-0", "8-1-0", "7-2-0"], align: "right" as const },
    ];

    const matches = sampleMatches(10);
</script>

<TabbedCard tabs={TABS} bind:selectedTab>
    {#if tab == "matches"}
        <MatchTable {matches} allMatches={matches} event={SAMPLE_MATCH_EVENT} />
    {:else if tab == "teams"}
        <Teams teams={SAMPLE_EVENT_TEAMS} focusedTeam={null} />
    {:else}
        <SampleDataTable columns={RANKINGS} rows={14} />
    {/if}
</TabbedCard>
