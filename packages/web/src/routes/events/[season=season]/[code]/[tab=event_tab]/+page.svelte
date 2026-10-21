<script lang="ts">
    import RelatedEvents from "./RelatedEvents.svelte";

    import { Season, notEmpty, isFinalsDivision } from "@ftc-scout/common";
    import Loading from "$lib/components/Loading.svelte";
    import { page } from "$app/stores";
    import Card from "$lib/components/Card.svelte";
    import {
        faBolt,
        faChartLine,
        faHashtag,
        faLightbulb,
        faList,
        faMedal,
        faTrophy,
    } from "@fortawesome/free-solid-svg-icons";
    import TabbedCard from "$lib/components/tabs/TabbedCard.svelte";
    import TabContent from "$lib/components/tabs/TabContent.svelte";
    import MatchTable from "$lib/components/matches/MatchTable.svelte";
    import { goto, invalidateAll } from "$app/navigation";
    import { browser } from "$app/environment";
    import { onDestroy, setContext } from "svelte";
    import { writable } from "svelte/store";
    import {
        LIVESTREAM_VIDEOS_CTX,
        clearEventTimestamps,
        eventKnownVideos,
        type LivestreamVideos,
    } from "$lib/timestamps/timestampToast";
    import { createPicklistSyncHandle } from "$lib/picklist/picklistSync";
    import { TEAM_CLICK_ACTION_CTX } from "$lib/components/matches/MatchTeam.svelte";
    import FocusedTeam from "$lib/components/stats/FocusedTeam.svelte";
    import { divisionShortName } from "$lib/printers/division";
    import Teams from "./Teams.svelte";
    import Picklist from "./Picklist.svelte";
    import Rankings from "./Rankings.svelte";
    import Awards from "./Awards.svelte";
    import Preview from "./Preview.svelte";
    import { isNonCompetition } from "$lib/util/event-type";
    import { RADAR_REACH, confirmRadarVisit, endRadar, game, gameActive, isRadarEvent, showToast, teamUrl } from "$lib/game/game-store";
    import { tryHop } from "$lib/game/duel-store";
    import Insights from "./Insights.svelte";
    import { getMatchScores } from "$lib/components/stats/getMatchScores";
    // import { unsubscribe, watchEvent } from "./watchEvent";
    // import { getClient } from "../../../../../lib/graphql/client";
    // import { getDataSync } from "../../../../../lib/graphql/getData";
    import type { EventPageQuery } from "../../../../../lib/graphql/generated/graphql-operations";

    export let data;

    $: eventStore = data.event;
    $: event = $eventStore?.data?.eventByCode!;
    $: headerStore = data.header;
    $: header = $headerStore?.data?.eventByCode;

    $: season = +$page.params.season as Season;

    $: radarMode = $gameActive && !!$game.radarVisit;
    $: radarTeams = radarMode
        ? [...(event?.teams ?? [])]
              .filter((team) => notEmpty(team.stats))
              .sort((a, b) => a.stats!.rank - b.stats!.rank || a.teamNumber - b.teamNumber)
              .slice(0, RADAR_REACH)
              .map((team) => team.teamNumber)
        : [];

    $: if (browser && event && event.code === $page.params.code && event.season === season && radarTeams.length) {
      confirmRadarVisit(
        { season, code: event.code, name: event.name },
        radarTeams,
        $page.url.pathname + $page.url.search
      );
    }

    $: if (browser && radarMode && event && event.code === $page.params.code && !radarTeams.length) {
      showToast("This event has no rankings. Radar is still available.");
      returnFromRadar();
    }

    $: if (browser && $gameActive && $game.radarVisit && $eventStore && !event) {
      showToast($game.lifelines.radar ? "Could not load this event. Returning to your team." : "Could not open this event. Radar is still available.");
      returnFromRadar();
    }

    async function returnFromRadar() {
      const url = endRadar();
      if (url) await goto(url);
    }

    const picklistSync = createPicklistSyncHandle();
    $: if (event?.code) picklistSync.sync(season, event.code);
    onDestroy(picklistSync.stop);

    $: stats = event?.teams?.filter((t) => notEmpty(t.stats)) ?? [];
    $: insights = event?.matches?.flatMap(getMatchScores) ?? [];
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

    function gotoTab(tab: string) {
        if (browser) {
            let url = $page.url.searchParams.size ? `${tab}?${$page.url.searchParams}` : tab;
            goto(url, { replaceState: true });
        }
    }

    let selectedTab = $page.params.tab;
    $: gotoTab(selectedTab);

    let focusedTeam: number | null = null;
    $: focusedTeamData =
        (isEventFinalsDivision
            ? matchTableTeams.find((t) => t.teamNumber == focusedTeam)
            : undefined) ??
        event?.teams?.find((t) => t.teamNumber == focusedTeam) ??
        event?.awards?.find((a) => a.teamNumber == focusedTeam)!;
    $: focusedTeamDivision =
        focusedTeamData && "eventCode" in focusedTeamData
            ? (event?.relatedEvents ?? []).find((re) => re.code == focusedTeamData.eventCode)
            : undefined;
    async function handleEventTeamClick(number: number) {
      if ($gameActive) {
        if (!isRadarEvent($page.url.pathname, $game) || !$game.radarVisit?.roster?.includes(number)) {
          showToast(`Radar only accesses the top ${RADAR_REACH} teams.`);
          return;
        }
        const name = event?.teams?.find((team) => team.teamNumber === number)?.team.name ?? "";
        const radarHop = { kind: "radar" as const, eventName: event.name, eventCode: event.code, season };
        if (!(await tryHop(number, name, radarHop))) return;
        goto(teamUrl(number, season));
        return;
      }
      focusedTeam = focusedTeam === number ? null : number;
    }
    setContext(TEAM_CLICK_ACTION_CTX, handleEventTeamClick);

    // $: if (event && !event.remote) watchEvent(event, refresh);
    // onMount(() => {
    //     return unsubscribe;
    // });

    // async function refresh() {
    //     let args = {
    //         season: +$page.params.season as Season,
    //         code: $page.params.code,
    //     };

    //     data = { event: getDataSync(getClient(fetch), EventPageDocument, args) };
    // }

    type EventLivestreamDay = {
        day: string | Date;
        liveStreamURL?: string | null;
        webcasts?: string[] | null;
        label?: string | null;
    };

    $: livestreamsByDay = (event?.livestreamsByDay ?? []) as EventLivestreamDay[];

    const livestreamVideos = writable<LivestreamVideos | undefined>(undefined);
    setContext(LIVESTREAM_VIDEOS_CTX, livestreamVideos);
    $: livestreamVideos.set(
        event
            ? {
                  eventCode: event.code,
                  ...eventKnownVideos({ ...event, livestreamsByDay }),
              }
            : undefined
    );

    $: isEventFinalsDivision =
        !!event &&
        isFinalsDivision(
            event.name,
            (event.relatedEvents ?? []).map((re) => re.name)
        );

    async function clearTimestamps() {
        await clearEventTimestamps(season, event.code);
        await invalidateAll();
    }

    $: matchTableTeams = isEventFinalsDivision
        ? (event?.relatedEvents ?? []).flatMap((re) =>
              (re.teams ?? []).map((t) => ({
                  ...t,
                  teamNumber: t.team.number,
                  season: re.season,
                  eventCode: re.code,
              }))
          )
        : event?.teams ?? [];
</script>

{#if header && !radarMode}
    <RelatedEvents
        relatedEvents={header.relatedEvents}
        thisEventName={header.name}
        thisEventCode={header.code}
        {season}
        tab={selectedTab}
    />
{/if}

<Loading store={$eventStore} checkExists={(e) => !!e.eventByCode}>
    {#if focusedTeam && focusedTeamData}
        <FocusedTeam
            team={focusedTeamData}
            division={focusedTeamDivision &&
                divisionShortName(focusedTeamDivision.name, [
                    event.name,
                    ...event.relatedEvents.map((re) => re.name),
                ])}
            remote={event.remote}
            on:close={() => (focusedTeam = null)}
        />
    {/if}

    <TabbedCard
        tabs={[
            [faChartLine, "Preview", "preview", !radarMode && shouldShowPreviewTab],
            [faBolt, "Matches", "matches", !radarMode && (event?.matches?.length ?? 0) > 0],
            [faTrophy, "Rankings", "rankings", !!stats.length],
            [faList, "Picklist", "picklist", !radarMode && !!event.teams.length && !isEventFinalsDivision],
            [faLightbulb, "Insights", "insights", !radarMode && !!insights.length],
            [faMedal, "Awards", "awards", !radarMode && (event?.awards?.length ?? 0) > 0],
            [faHashtag, `Teams (${event.teams.length})`, "teams", !radarMode && !!event.teams.length],
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

        <TabContent name="matches">
            <MatchTable
                matches={event.matches}
                allMatches={event.matches ?? []}
                {event}
                {focusedTeam}
                eventTeams={matchTableTeams}
            />
            <button class="clear-timestamps" type="button" on:click={clearTimestamps}>
                Delete video timestamps for this event
            </button>
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
                eventCode={event.code}
                data={previewTeams}
                {focusedTeam}
            />
        </TabContent>

        <TabContent name="insights">
            <Insights
                {season}
                remote={event.remote}
                eventName={event.name}
                data={insights}
                {focusedTeam}
            />
        </TabContent>

        <TabContent name="awards">
            <Awards awards={event.awards} {season} eventCode={event.code} {focusedTeam} />
        </TabContent>

        <TabContent name="teams">
            <Teams teams={event.teams} {focusedTeam} />
        </TabContent>
    </TabbedCard>
</Loading>

<style>
    .clear-timestamps {
        display: block;
        margin: var(--lg-gap) auto 0;
        padding: var(--md-pad) var(--lg-pad);
        border: none;
        border-radius: 8px;
        background: var(--form-bg-color);
        color: var(--grayed-out-text-color);
        font: inherit;
        font-size: var(--md-font-size);
        cursor: pointer;
    }

    .clear-timestamps:hover {
        color: var(--text-color);
    }

    .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--md-gap);
        text-align: center;
    }
</style>
