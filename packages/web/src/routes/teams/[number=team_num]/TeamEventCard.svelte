<script lang="ts">
    import Card from "$lib/components/Card.svelte";
    import Location from "$lib/components/Location.svelte";
    import Award from "$lib/components/Award.svelte";
    import MatchTable from "$lib/components/matches/MatchTable.svelte";
    import { prettyPrintDateRangeString } from "$lib/printers/dateRange";
    import { isFinalsDivision, type Season } from "@ftc-scout/common";
    import type {
        FullMatchFragment,
        TeamEventDetailsQuery,
        TeamQuery,
    } from "$lib/graphql/generated/graphql-operations";
    import TeamEventStats from "./TeamEventStats.svelte";

    type TeamEvent = NonNullable<NonNullable<TeamQuery["teamByNumber"]>["events"]>[number];
    type EventDetails = NonNullable<
        NonNullable<TeamEventDetailsQuery["teamByNumber"]>["events"]
    >[number]["event"];
    type EventTeams = EventDetails["teams"];

    export let tep: Omit<TeamEvent, "event"> & {
        event: Omit<TeamEvent["event"], "relatedEvents"> & {
            teams?: EventTeams | undefined;
            matches?: FullMatchFragment[] | undefined;
            relatedEvents?:
                | (NonNullable<TeamEvent["event"]["relatedEvents"]>[number] & {
                      teams?: EventTeams | undefined;
                  })[]
                | undefined;
        };
    };
    export let focusedTeam: number | null;
    export let hinted = false;
    export let crosshairCode: string | null = null;

    $: event = tep.event;
    $: season = event.season as Season;
    $: href = `/events/${event.season}/${event.code}/matches`;
    $: isEventFinalsDivision = isFinalsDivision(
        event.name,
        (event.relatedEvents ?? []).map((re) => re.name)
    );
    $: matchTableTeams = isEventFinalsDivision
        ? (event.relatedEvents ?? []).flatMap((re) =>
              (re.teams ?? []).map((t) => ({
                  ...t,
                  teamNumber: t.team.number,
                  season: re.season,
                  eventCode: re.code,
              }))
          )
        : event.teams ?? [];
</script>

<Card
    panel
    style={`margin-top: var(--md-gap); ${
        hinted
            ? "outline: 2px solid var(--inline-theme-color); outline-offset: 3px;"
            : ""
    }`}
>
    <div
        class="event-head"
        class:hinted
        id={hinted && crosshairCode ? `crosshair-${crosshairCode}` : undefined}
    >
        <h3 id={event.code} tabindex="-1"><a {href}>{event.name}</a></h3>

        <div class="meta-line">
            <span>{prettyPrintDateRangeString(event.start, event.end)}</span>
            <span class="sep">&middot;</span>
            <Location {...event.location} />
        </div>

        {#if tep.stats || tep.awards.length}
            <div class="performance">
                <TeamEventStats
                    stats={tep.stats}
                    {season}
                    remote={event.remote}
                />

                {#if tep.awards.length}
                    <div>
                        {#each tep.awards as award, i}
                            <Award
                                {award}
                                comma={i != tep.awards.length - 1}
                                season={event.season}
                            />
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <MatchTable
        matches={tep.matches.map((m) => m.match)}
        allMatches={event.matches ?? []}
        {event}
        {focusedTeam}
        eventTeams={matchTableTeams}
    />
</Card>

<style>
    .event-head {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        margin-bottom: var(--md-gap);
    }

    .event-head.hinted {
        scroll-margin-top: calc(var(--hud-size) + 24px);
    }

    .event-head :global(.meta-line a) {
        color: inherit;
        text-underline-offset: 2px;
    }

    .meta-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0 var(--md-gap);
        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }

    .performance {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        margin-top: var(--lg-gap);
    }

    h3 {
        margin: 0;
        font-size: calc(var(--lg-font-size) * 1.1);
        font-weight: 600;
        line-height: 1.3;
        scroll-margin-top: 24px;
    }

    :global(#content.game) h3 {
        scroll-margin-top: calc(var(--hud-size) + 24px);
    }

    h3 a {
        color: inherit;
    }
</style>
