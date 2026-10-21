<script lang="ts">
    import { DESCRIPTORS, type Season } from "@ftc-scout/common";
    import ErrorPage from "$lib/components/ErrorPage.svelte";
    import Loading from "$lib/components/Loading.svelte";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import Card from "$lib/components/Card.svelte";
    import Head from "$lib/components/Head.svelte";
    import Location from "$lib/components/Location.svelte";
    import AdditionalInfo from "$lib/components/AdditionalInfo.svelte";
    import { page } from "$app/stores";
    import { prettyPrintDateRangeString } from "$lib/printers/dateRange";
    import { prettyPrintURL } from "$lib/printers/url";

    export let data;

    $: headerStore = data.header;
    $: event = $headerStore?.data?.eventByCode!;

    $: season = +$page.params.season as Season;
    $: errorMessage = `No ${DESCRIPTORS[season].seasonName} event with code ${$page.params.code}`;

    type EventLivestreamDay = {
        day: string | Date;
        liveStreamURL?: string | null;
        webcasts?: string[] | null;
        label?: string | null;
    };

    let showAllLivestreams = false;

    $: livestreamsByDay = (event?.livestreamsByDay ?? []) as EventLivestreamDay[];

    function parseLocalDate(iso: string): Date {
        const [y, m, d] = iso.split("-").map(Number);
        return new Date(y, m - 1, d);
    }

    function getDateOnly(date: string | Date): Date {
        const d = date instanceof Date ? date : parseLocalDate(date);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function formatLivestreamDay(day: string | Date): string {
        try {
            const dateObj = day instanceof Date ? day : new Date(day);
            return dateObj.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
            });
        } catch {
            return String(day);
        }
    }

    $: todayDate = new Date();
    $: todayDateOnly = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());

    $: sortedLivestreams = [...livestreamsByDay].sort((a, b) => {
        const aDate = getDateOnly(a.day).getTime();
        const bDate = getDateOnly(b.day).getTime();
        return aDate - bDate;
    });

    $: currentDayLivestream =
        livestreamsByDay.find((ls) => {
            const lsDateOnly = getDateOnly(ls.day).getTime();
            return lsDateOnly === todayDateOnly.getTime();
        }) ??
        sortedLivestreams[0] ??
        (event
            ? {
                  day: event.start,
                  liveStreamURL: event?.liveStreamURL ?? null,
              }
            : null);

    $: if ($page.url) {
        showAllLivestreams = false;
    }
</script>

<Head
    title={!!event ? `${event.name} | 2iLScout` : "Event Page | 2iLScout"}
    description={!!event
        ? `Matches, awards, and statistics for the ${new Date(event.start).getFullYear()} ${
              event.name
          }.`
        : "Matches, awards, and statistics for an event."}
    image="https://api.ftcscout.org/banners/events/{$page.params.season}/{$page.params.code}"
    canonical={`/events/${season}/${$page.params.code}`}
/>

<WidthProvider>
    <Loading store={$headerStore} checkExists={(e) => !!e.eventByCode}>
        <ErrorPage slot="error" status={404} message={errorMessage}>
            (Try searching for events on <a href="/events">the events page</a>)
        </ErrorPage>

        <Card vis={false}>
            <h1>{new Date(event.start).getFullYear()} {event.name}</h1>

            <div class="meta">
                <div class="meta-line">
                    <span>{prettyPrintDateRangeString(event.start, event.end)}</span>
                    <span class="sep">&middot;</span>
                    <Location {...event.location} />
                </div>

                {#if event.website || event.livestreamsByDay?.length || event.liveStreamURL}
                    <AdditionalInfo>
                        <div class="meta-line">
                            {#if event.website}
                                <a
                                    href={event.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="norm-link"
                                >
                                    {prettyPrintURL(event.website)}
                                </a>
                            {/if}
                            {#if event.website && (event.livestreamsByDay?.length || event.liveStreamURL)}
                                <span class="sep">&middot;</span>
                            {/if}
                            {#if event.livestreamsByDay && event.livestreamsByDay.length > 0}
                                <div class="livestream-block">
                                    {#if currentDayLivestream}
                                        <div class="livestream-row">
                                            {#if currentDayLivestream.liveStreamURL}
                                                <a
                                                    href={currentDayLivestream.liveStreamURL}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    class="norm-link"
                                                >
                                                    {prettyPrintURL(currentDayLivestream.liveStreamURL)}
                                                </a>
                                            {/if}
                                            <span class="livestream-day"
                                                >[{formatLivestreamDay(currentDayLivestream.day)}]</span
                                            >
                                            {#if sortedLivestreams.length > 1}
                                                <button
                                                    class="livestream-inline-toggle"
                                                    type="button"
                                                    on:click={() =>
                                                        (showAllLivestreams = !showAllLivestreams)}
                                                    aria-expanded={showAllLivestreams}
                                                >
                                                    {showAllLivestreams ? "Hide" : "Show all"}
                                                </button>
                                            {/if}
                                        </div>
                                    {/if}

                                    {#if showAllLivestreams}
                                        <div class="livestream-list">
                                            {#each sortedLivestreams as livestream (livestream.day)}
                                                {@const isCurrentDay =
                                                    getDateOnly(livestream.day).getTime() ===
                                                    todayDateOnly.getTime()}
                                                {#if !isCurrentDay}
                                                    <div class="livestream-row">
                                                        {#if livestream.liveStreamURL}
                                                            <a
                                                                href={livestream.liveStreamURL}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                class="norm-link"
                                                            >
                                                                {prettyPrintURL(
                                                                    livestream.liveStreamURL
                                                                )}
                                                            </a>
                                                        {:else}
                                                            <span>No livestream URL</span>
                                                        {/if}
                                                        <span class="livestream-day"
                                                            >[{formatLivestreamDay(
                                                                livestream.day
                                                            )}]</span
                                                        >
                                                    </div>
                                                {/if}
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {:else if event.liveStreamURL}
                                <a
                                    href={event.liveStreamURL}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="norm-link"
                                >
                                    {prettyPrintURL(event.liveStreamURL)}
                                </a>
                            {/if}
                        </div>
                    </AdditionalInfo>
                {/if}
            </div>
        </Card>

        <slot />
    </Loading>
</WidthProvider>

<style>
    h1 {
        font-size: var(--xl-font-size);
        margin-top: var(--sm-gap);
        margin-bottom: var(--md-gap);
    }

    @media (max-width: 550px) {
        h1,
        .meta {
            padding-left: var(--md-pad);
        }
    }

    .meta {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);

        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }

    .meta-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0 var(--md-gap);
    }

    .meta :global(a) {
        color: inherit;
        text-decoration: underline;
        text-decoration-color: color-mix(in srgb, currentColor 65%, transparent);
        text-underline-offset: 2px;
    }

    .meta :global(a:hover) {
        color: var(--text-color);
        text-decoration-color: currentColor;
    }

    .livestream-block {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        padding: var(--sm-gap) 0;
    }

    .livestream-inline-toggle {
        background: none;
        border: none;
        color: var(--secondary-text-color);
        cursor: pointer;
        padding: 0.2rem 0.4rem;
        font-size: 0.9em;
        transition: all 0.15s ease;
        margin-left: 0.5rem;
    }

    .livestream-inline-toggle:hover {
        color: var(--text);
    }

    .livestream-list {
        display: flex;
        flex-direction: column;
        gap: var(--xs-gap);
        border-top: 2px solid var(--sep-color);
        padding-top: var(--md-gap);
    }

    .livestream-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        line-height: 1.4;
        border-left: 3px solid transparent;
        border-radius: 2px;
        transition: all 0.15s ease;
    }

    .livestream-day {
        margin-left: 0.3rem;
        color: var(--secondary-text-color);
    }
</style>
