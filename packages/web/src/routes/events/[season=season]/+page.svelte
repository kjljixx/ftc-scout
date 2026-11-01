<script lang="ts">
    import { page } from "$app/stores";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import {
        DESCRIPTORS,
        EventTypeOption,
        RegionOption,
        type FuzzyResult,
        type Season,
        fuzzySearch,
    } from "@ftc-scout/common";
    import Card from "$lib/components/Card.svelte";
    import Loading from "$lib/components/Loading.svelte";
    import SkulletReveal from "$lib/components/skeleton/SkulletReveal.svelte";
    import { mod } from "$lib/util/number";
    import { addDays, dateToStr, daysBetween } from "$lib/util/date";
    import { sortString } from "$lib/util/sorters";
    import EventWeek from "./EventWeek.svelte";
    import { SAMPLE_WEEKS } from "./sampleWeeks";
    import Options from "./Options.svelte";
    import { queryParam } from "$lib/util/search-params/search-params";
    import { REGION_EC_DC } from "$lib/util/search-params/region";
    import { regionMatches } from "$lib/util/regions";
    import { EVENT_TY_EC_DC } from "$lib/util/search-params/event-ty";
    import { eventTyMatches } from "$lib/util/event-type";
    import { DATE_EC_DC } from "$lib/util/search-params/date";
    import { browser } from "$app/environment";
    import { STRING_EC_DC } from "$lib/util/search-params/string";
    import InfiniteScroll from "svelte-infinite-scroll";
    import Head from "$lib/components/Head.svelte";

    export let data;
    $: eventsStore = data.events;
    $: events = $eventsStore?.data.eventsSearch ?? [];

    $: sortedEvents = [...events]
        .sort((a, b) => sortString(a.name, b.name))
        .sort((a, b) => new Date(a.start).valueOf() - new Date(b.start).valueOf());

    $: season = +$page.params.season as Season;

    function calcFirstMonday(season: Season): Date {
        let firstDate = DESCRIPTORS[season].kickoff;
        let minDow = firstDate.getDay();
        let mondayZero = mod(minDow - 1, 7);
        let mondayAdjust = (mondayZero - 7) % 7;
        return addDays(firstDate, mondayAdjust);
    }

    $: firstMonday = calcFirstMonday(season);

    function groupEvents(es: FuzzyResult<(typeof events)[number]>[]) {
        if (es.length == 0) return [];

        let weeks: [number, FuzzyResult<(typeof events)[number]>[]][] = [];
        let currWeekNum = 0;
        let currWeek = [];

        for (let e of es) {
            let start = new Date(e.document.start);
            let daysSinceFirstMonday = daysBetween(firstMonday, start);
            let weekNum = Math.floor(daysSinceFirstMonday / 7);

            if (weekNum > currWeekNum) {
                if (currWeek.length) weeks.push([currWeekNum, currWeek]);
                currWeekNum = weekNum;
                currWeek = [];
            }

            currWeek.push(e);
        }
        weeks.push([currWeekNum, currWeek]);

        return weeks;
    }

    let region = queryParam<RegionOption>("regions", REGION_EC_DC);
    let eventTy = queryParam<EventTypeOption>("event-types", EVENT_TY_EC_DC);
    let start = queryParam("start", DATE_EC_DC);
    let end = queryParam("end", DATE_EC_DC);
    let searchText = queryParam<string>("search", STRING_EC_DC);

    function eventMatches(
        r: RegionOption,
        ty: EventTypeOption,
        st: Date | null,
        end: Date | null
    ): (_: (typeof events)[number]) => boolean {
        let stStr = dateToStr(st);
        let endStr = dateToStr(end);
        return (e) =>
            regionMatches(r, e.regionCode ?? "") &&
            eventTyMatches(ty, e.type) &&
            (!stStr || e.start >= stStr) &&
            (!endStr || e.end <= endStr);
    }

    let elementScroll = (browser ? document.getElementById("content") : null)!;
    let take = 10;
    $: {
        $searchText;
        $region;
        $eventTy;
        $start;
        $end;
        take = 10;
    }

    $: filteredEvents = sortedEvents.filter(eventMatches($region, $eventTy, $start, $end));
    $: searchedEvents = fuzzySearch(filteredEvents, $searchText, Infinity, "name");
    $: grouped = groupEvents(searchedEvents);
</script>

<Head
    title="Events | 2iLScout"
    description="Find and search for FTC events in the {$page.params.season} season."
/>

<WidthProvider width={"850px"}>
    <Card>
        <h1>{DESCRIPTORS[season].seasonName} Events</h1>
        <Options
            {season}
            bind:region={$region}
            bind:eventType={$eventTy}
            bind:start={$start}
            bind:end={$end}
            bind:searchText={$searchText}
        />
    </Card>
</WidthProvider>

<WidthProvider>
    <Loading store={$eventsStore} checkExists={() => true}>
        <SkulletReveal slot="loading" label="Loading events">
            <Card>
                {#each SAMPLE_WEEKS as { weekNum, events } (weekNum)}
                    <EventWeek
                        {weekNum}
                        start={addDays(firstMonday, 7 * weekNum)}
                        end={addDays(firstMonday, 7 * weekNum + 6)}
                        {events}
                    />
                {/each}
            </Card>
        </SkulletReveal>

        <Card>
            {#each grouped.slice(0, take) as [week, es] (week)}
                <EventWeek
                    weekNum={week}
                    start={addDays(firstMonday, 7 * week)}
                    end={addDays(firstMonday, 7 * week + 6)}
                    events={es}
                />
            {:else}
                <div class="no-events">
                    <b> No matching events. </b>
                    <p class="no-events-help">Try modifying your filters.</p>
                </div>
            {/each}

            <InfiniteScroll threshold={500} on:loadMore={() => (take += 10)} {elementScroll} />
        </Card>
    </Loading>
</WidthProvider>

<style>
    h1 {
        margin-top: var(--sm-gap);
        margin-bottom: var(--lg-gap);
    }

    .no-events {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--md-gap);

        width: 100%;
    }
</style>
