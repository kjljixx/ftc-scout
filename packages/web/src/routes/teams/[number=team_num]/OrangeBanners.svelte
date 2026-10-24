<script lang="ts">
    import Card from "$lib/components/Card.svelte";
    import Award from "$lib/components/Award.svelte";
    import Location from "$lib/components/Location.svelte";
    import { teamUrl } from "$lib/game/game-store";
    import {
        AwardType,
        EventType,
        type TeamQuery,
    } from "$lib/graphql/generated/graphql-operations";
    import { prettyPrintDateRangeString } from "$lib/printers/dateRange";

    type Award = NonNullable<NonNullable<TeamQuery["teamByNumber"]>["awards"]>[number];

    export let teamNumber: number;
    export let awards: Award[];

    const BANNER_EVENT_TYPES: EventType[] = [
        EventType.Championship,
        EventType.SuperQualifier,
        EventType.Premier,
        EventType.FirstChampionship,
        EventType.OffSeason,
    ];

    const atBannerEvent = (a: Award) => BANNER_EVENT_TYPES.includes(a.event.type);
    const newestFirst = (a: Award, b: Award) =>
        new Date(b.event.start).getTime() - new Date(a.event.start).getTime() ||
        a.event.name.localeCompare(b.event.name);
    const awardsAt = (banner: Award) =>
        awards.filter((a) => a.season == banner.season && a.eventCode == banner.eventCode);

    $: inspire = awards
        .filter((a) => a.type == AwardType.Inspire && a.placement == 1 && atBannerEvent(a))
        .sort(newestFirst);
    $: robotGame = awards
        .filter((a) => a.type == AwardType.Winner && atBannerEvent(a))
        .sort(newestFirst);

    $: columns = [
        { label: "Inspire", banners: inspire },
        { label: "Robot Game", banners: robotGame },
    ];
</script>

<Card vis={false}>
    <h2 class="section-title">Orange Banners</h2>
    <div class="columns">
        {#each columns as { label, banners }}
            <div class="column">
                <div class="heading">
                    <span class="label">{label}</span>
                    <span class="value">{banners.length}</span>
                </div>
                {#each banners as banner}
                    {@const event = banner.event}
                    {@const eventAwards = awardsAt(banner)}
                    <div class="event-card">
                        <h3>
                            <a href="{teamUrl(teamNumber, event.season)}#{event.code}"
                                >{event.name}</a
                            >
                        </h3>
                        <div class="meta-line">
                            <span>{prettyPrintDateRangeString(event.start, event.end)}</span>
                            <span class="sep">&middot;</span>
                            <Location {...event.location} />
                        </div>
                        <div class="awards">
                            {#each eventAwards as award, i}
                                <Award
                                    {award}
                                    comma={i != eventAwards.length - 1}
                                    season={event.season}
                                />
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {/each}
    </div>
</Card>

<style>
    .section-title {
        margin: var(--sm-gap) 0 var(--md-gap);
        font-size: calc(var(--lg-font-size) * 1.4);
        font-weight: 600;
    }

    .columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--lg-gap);
        align-items: start;
    }

    @media (max-width: 700px) {
        .columns {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    .column {
        display: flex;
        flex-direction: column;
        gap: var(--md-gap);
    }

    .heading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--sm-gap);
    }

    .label {
        font-size: var(--md-font-size);
        color: var(--text-color);
    }

    .value {
        font-size: var(--xl-font-size);
        font-weight: 600;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
    }

    .event-card {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        padding: var(--lg-pad);
        background-color: var(--fg-color);
        border-radius: 12px;
    }

    h3 {
        margin: 0;
        font-size: calc(var(--lg-font-size) * 1.1);
        font-weight: 600;
        line-height: 1.3;
    }

    h3 a {
        color: inherit;
    }

    .meta-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0 var(--md-gap);
        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }

    .meta-line :global(a) {
        color: inherit;
        text-decoration: underline;
        text-decoration-color: color-mix(in srgb, currentColor 65%, transparent);
        text-underline-offset: 2px;
    }

    .awards {
        margin-top: var(--md-gap);
    }
</style>
