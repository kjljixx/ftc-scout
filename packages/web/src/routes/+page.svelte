<script lang="ts">
    import Card from "$lib/components/Card.svelte";
    import Location from "$lib/components/Location.svelte";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import MatchTable from "$lib/components/matches/MatchTable.svelte";
    import SkeletonRow from "$lib/components/skeleton/SkeletonRow.svelte";
    import { prettyPrintDateRange } from "$lib/printers/dateRange";
    import {
        faBolt,
        faChartLine,
        faHashtag,
        faHouse,
        faList,
        faQuestionCircle,
        faTrophy,
    } from "@fortawesome/free-solid-svg-icons";
    import Fa from "svelte-fa";
    import { CURRENT_SEASON, notEmpty, type Season } from "@ftc-scout/common";
    import Head from "$lib/components/Head.svelte";
    import { createTippy } from "svelte-tippy";
    import { tippyTheme } from "$lib/components/nav/DarkModeToggle.svelte";
    import Select from "$lib/components/ui/form/Select.svelte";
    import Loading from "$lib/components/Loading.svelte";
    import TabbedCard from "$lib/components/tabs/TabbedCard.svelte";
    import TabContent from "$lib/components/tabs/TabContent.svelte";
    import { setContext } from "svelte";
    import { TEAM_CLICK_ACTION_CTX } from "$lib/components/matches/MatchTeam.svelte";
    import FocusedTeam from "$lib/components/stats/FocusedTeam.svelte";
    import { isNonCompetition } from "$lib/util/event-type";
    import type { EventPageQuery } from "$lib/graphql/generated/graphql-operations";
    import Rankings from "./events/[season=season]/[code]/[tab=event_tab]/Rankings.svelte";
    import Teams from "./events/[season=season]/[code]/[tab=event_tab]/Teams.svelte";
    import Preview from "./events/[season=season]/[code]/[tab=event_tab]/Preview.svelte";
    import Picklist from "./events/[season=season]/[code]/[tab=event_tab]/Picklist.svelte";
    // import AlertBar from "$lib/components/nav/AlertBar.svelte";

    export let data;
    $: homeStore = data.home;
    $: latestEventStore = data.latestEvent;

    $: activeTeamsCount = $homeStore?.data?.activeTeamsCount;
    $: matchesPlayedCount = $homeStore?.data?.matchesPlayedCount;
    $: events = $homeStore?.data?.eventsOnDate;

    $: wr = $homeStore?.data.tradWorldRecord;
    $: wrWithPens = $homeStore?.data.tradWorldRecordWithPenalties;

    $: showHomeTeamView = !!data.homeTeam && !!data.latestEvent;

    $: event = $latestEventStore?.data?.eventByCode!;
    $: season = (data.latestSeason ?? CURRENT_SEASON) as Season;

    $: stats = event?.teams?.filter((t) => notEmpty(t.stats)) ?? [];
    type PreviewStat = {
        teamNumber: number;
        npOpr: number | null;
        stats: NonNullable<EventPageQuery["eventByCode"]>["teams"][number]["stats"] | null;
        event: { name: string; code: string; start: string; end: string } | null;
    };
    type PreviewTeam = NonNullable<EventPageQuery["eventByCode"]>["teams"][number] & {
        quickOpr: number | null;
    };
    $: previewStats = ((event as any)?.previewStats ?? []) as PreviewStat[];
    $: previewStatMap = new Map<number, PreviewStat>(previewStats.map((s) => [s.teamNumber, s]));
    $: previewTeams = (event?.teams ?? [])
        .map((team) => ({
            ...team,
            quickOpr: previewStatMap.get(team.teamNumber)?.npOpr ?? null,
            stats: previewStatMap.get(team.teamNumber)?.stats ?? team.stats,
            event: previewStatMap.get(team.teamNumber)?.event ?? null,
        }))
        .sort((a, b) => {
            if (a.quickOpr == null && b.quickOpr == null) return a.teamNumber - b.teamNumber;
            if (a.quickOpr == null) return 1;
            if (b.quickOpr == null) return -1;
            let diff = (b.quickOpr ?? 0) - (a.quickOpr ?? 0);
            return diff == 0 ? a.teamNumber - b.teamNumber : diff;
        }) as PreviewTeam[];

    $: hasPreviewData = previewTeams.some((team) => team.quickOpr != null);
    $: eventHasMatches = (event?.matches?.length ?? 0) > 0;
    $: scheduledEventDate = event?.end ?? event?.start ?? null;
    $: eventHasPassedScheduledDate = scheduledEventDate
        ? Date.now() > new Date(scheduledEventDate).getTime() + 86400000
        : false;
    $: shouldShowPreviewTab =
        (event?.teams?.length ?? 0) > 0 &&
        hasPreviewData &&
        !eventHasMatches &&
        !eventHasPassedScheduledDate;

    let selectedTab = "home_matches";
    let focusedTeam: number | null = null;
    $: focusedTeamData =
        event?.teams?.find((t) => t.teamNumber == focusedTeam) ??
        event?.awards?.find((a) => a.teamNumber == focusedTeam)!;
    setContext(TEAM_CLICK_ACTION_CTX, (t: number) => (focusedTeam = focusedTeam == t ? null : t));

    let tippy = createTippy({});
    let wrMode = "wo-penalties";
</script>

<Head title="2iLScout" />

<!-- <AlertBar
    message="Watch the FTC World Championships live on YouTube!"
    link="https://www.youtube.com/watch?v=abjNLBFk1N8"
/> -->

<WidthProvider>
    {#if showHomeTeamView}
        <Loading store={$latestEventStore} checkExists={(e) => !!e.eventByCode}>
            {#if focusedTeam && focusedTeamData}
                <FocusedTeam team={focusedTeamData} remote={event.remote} />
            {/if}

            <Card>
                <h2>
                    <a href="/events/{event.season}/{event.code}/matches" class="norm-link">
                        {event.name}
                    </a>
                </h2>
                <p>
                    Latest Event -
                    <a href="/teams/{data.homeTeam}" class="norm-link">
                        Team {data.homeTeam}
                    </a>
                </p>
            </Card>

            <TabbedCard
                tabs={[
                    [faChartLine, "Preview", "preview", shouldShowPreviewTab],
                    [
                        faHouse,
                        "Our Matches",
                        "home_matches",
                        (data?.teamMatches?.length ?? 0) > 0 && (event?.matches?.length ?? 0) > 0,
                    ],
                    [faTrophy, "Rankings", "rankings", !!stats.length],
                    [faList, "Picklist", "picklist", !!event.teams.length],
                    [faHashtag, `Teams (${event.teams.length})`, "teams", !!event.teams.length],
                    [faBolt, "All Matches", "matches", (event?.matches?.length ?? 0) > 0],
                ]}
                bind:selectedTab
            >
                <Card slot="empty">
                    <div class="empty">
                        {#if isNonCompetition(event.type)}
                            <p>This event is not a competition; no matches will be played.</p>
                        {:else}
                            <b>No information has been published about this event.</b>
                            <p>Please check back later.</p>
                        {/if}
                    </div>
                </Card>

                <TabContent name="home_matches">
                    <MatchTable
                        matches={data.teamMatches ?? []}
                        {event}
                        focusedTeam={data.homeTeam}
                        eventTeams={event.teams}
                    />
                </TabContent>

                <TabContent name="matches">
                    <MatchTable
                        matches={event.matches}
                        {event}
                        {focusedTeam}
                        eventTeams={event.teams}
                    />
                </TabContent>

                <TabContent name="preview">
                    <Preview
                        teams={previewTeams}
                        {focusedTeam}
                        eventName={event.name}
                        eventCode={event.code}
                        {season}
                        remote={event.remote}
                    />
                </TabContent>

                <TabContent name="rankings">
                    <Rankings
                        {season}
                        remote={event.remote}
                        eventName={event.name}
                        data={stats}
                        {focusedTeam}
                    />
                </TabContent>

                <TabContent name="picklist">
                    <Picklist
                        {season}
                        remote={event.remote}
                        eventName={event.name}
                        data={stats}
                        {focusedTeam}
                    />
                </TabContent>

                <TabContent name="teams">
                    <Teams teams={event.teams} {focusedTeam} />
                </TabContent>
            </TabbedCard>
        </Loading>
    {:else}
        <Card vis={false}>
            <div class="title">
                <h1>2iL<em>Scout</em></h1>
                <p>A new way to track and scout <em>FIRST</em> Tech Challenge</p>
            </div>

            <div class="infos">
                <a class="info-box" href="/teams">
                    <div class="icon"><Fa icon={faHashtag} /></div>
                    <b class="count">{activeTeamsCount ?? "..."}</b>
                    <p class="name">Active Teams</p>
                </a>
                <a class="info-box" href="/events/{CURRENT_SEASON}">
                    <div class="icon"><Fa icon={faBolt} /></div>
                    <b class="count">{matchesPlayedCount ?? "..."}</b>
                    <p class="name">Matches Played</p>
                </a>
            </div>

            <div class="events">
                <div class="head">
                    <h2>Today's Events</h2>
                    <p>{prettyPrintDateRange(new Date(), new Date())}</p>
                </div>

                <hr />

                {#if events && events.length}
                    <ul>
                        {#each events as e}
                            <li>
                                <a href="/events/{e.season}/{e.code}/matches">
                                    <span>{e.name}</span>
                                    <em class="loc"><Location {...e.location} link={false} /></em>
                                </a>
                            </li>
                        {/each}
                    </ul>
                {:else if events}
                    <p class="no-events">There are no events scheduled for today.</p>
                {:else}
                    <SkeletonRow header={false} card={false} rows={10} />
                {/if}
            </div>

            <div class="wr wr-merged">
                <div class="wr-section">
                    <h2>
                        <Select
                            bind:value={wrMode}
                            options={[
                                { value: "wo-penalties", name: "World Record" },
                                {
                                    value: "w-penalties",
                                    name: "World Record (including penalty points)",
                                },
                            ]}
                            nonForm
                            style="font-size: inherit; font-weight: 600; width: max-content; max-width: calc(100% - 16px);"
                        />
                        <span
                            class="help"
                            use:tippy={{
                                content: `Top score in a FIRST-sponsored event. The "true world record" does not include penalty points, but you can view the penalty-inclusive WR using the dropdown menu.`,
                                theme: $tippyTheme,
                            }}
                        >
                            <Fa icon={faQuestionCircle} />
                        </span>
                    </h2>
                    <hr />

                    {#if wr && wrMode == "wo-penalties"}
                        <a href="/events/{wr.event.season}/{wr.event.code}/matches"
                            >{wr.event.name}</a
                        >
                        <MatchTable
                            matches={[wr]}
                            event={wr.event}
                            showNonPenaltyScores
                            showHeartLegend={false}
                        />
                    {:else if wrWithPens && wrMode == "w-penalties"}
                        <a href="/events/{wrWithPens.event.season}/{wrWithPens.event.code}/matches">
                            {wrWithPens.event.name}
                        </a>
                        <MatchTable
                            matches={[wrWithPens]}
                            event={wrWithPens.event}
                            showHeartLegend={false}
                        />
                    {:else}
                        <SkeletonRow header card={false} rows={2} />
                    {/if}
                </div>
            </div>
        </Card>
    {/if}
</WidthProvider>

<style>
    .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--md-gap);
        text-align: center;
    }

    h1,
    h2 {
        margin-top: var(--sm-gap);
        margin-bottom: var(--lg-gap);
    }

    .title {
        display: flex;
        flex-direction: column;
        align-items: center;

        margin-bottom: var(--xl-gap);
    }

    .title h1 {
        font-weight: 600;
        font-size: calc(var(--xl-font-size) * 1.5);
        margin: var(--md-gap);
    }

    .title p {
        margin: 0;
        font-size: var(--vl-font-size);
        font-style: normal;

        text-align: center;
    }

    .infos {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--lg-gap);

        margin-bottom: var(--vl-gap);
    }

    .info-box {
        display: grid;
        grid-template-columns: min-content auto;
        grid-template-rows: auto auto;
        gap: var(--sm-gap) var(--lg-gap);

        background: var(--fg-color);
        border-radius: 8px;
        border: 1px solid var(--sep-color);
        padding: var(--lg-pad);
        font-size: var(--lg-font-size);

        color: inherit;
    }

    .info-box:hover {
        text-decoration: none;
        background: var(--hover-color);
    }

    .info-box .icon {
        background: var(--theme-color);
        color: var(--theme-text-color);
        border-radius: var(--pill-border-radius);
        padding: var(--lg-pad);
        font-size: var(--vl-font-size);

        display: flex;
        align-items: center;
        justify-content: center;
        grid-row: span 2;
        width: calc(var(--lg-font-size) * 3);
        height: calc(var(--lg-font-size) * 3);
    }

    @media (max-width: 800px) {
        .info-box {
            font-size: calc(var(--md-font-size) * 1.1);
        }

        .info-box .icon {
            font-size: var(--lg-font-size);
            width: calc(var(--md-font-size) * 3);
            height: calc(var(--md-font-size) * 3);
        }
    }

    .info-box .count {
        display: flex;
        align-items: end;
    }

    .info-box .name {
        display: flex;
        align-items: start;
        color: var(--secondary-text-color);
    }

    .events {
        padding: var(--lg-pad);
        border-radius: 8px;
        border: 1px solid var(--sep-color);
        background: var(--fg-color);

        margin-bottom: var(--vl-gap);
    }

    .events .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--md-gap);
    }

    .events hr {
        margin-bottom: var(--md-gap);
    }

    .no-events {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--md-pad);
        color: var(--secondary-text-color);
    }

    .events ul {
        list-style: none;
    }

    .events ul a {
        color: inherit;
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        padding: var(--md-pad);
        border-radius: 8px;
    }

    .events ul a:hover {
        text-decoration: none;
        background: var(--hover-color);
    }

    .events ul a .loc {
        color: var(--secondary-text-color);
    }

    .wr {
        background: var(--fg-color);
        border-radius: 8px;
        border: 1px solid var(--sep-color);
        padding: var(--lg-pad);
    }

    .wr-merged {
        display: flex;
        flex-direction: column;
    }

    .wr h2 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sm-gap);
        margin-bottom: var(--md-gap);
    }

    .wr hr {
        margin-bottom: var(--lg-gap);
    }

    .wr a {
        color: inherit;
        font-weight: bold;
        display: block;
        margin-bottom: var(--md-gap);
    }

    .help {
        font-size: calc(var(--md-font-size));
    }
</style>
