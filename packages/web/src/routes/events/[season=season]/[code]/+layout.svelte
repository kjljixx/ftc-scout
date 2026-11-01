<script lang="ts">
    import { DESCRIPTORS, type Season } from "@ftc-scout/common";
    import ErrorPage from "$lib/components/ErrorPage.svelte";
    import Loading from "$lib/components/Loading.svelte";
    import SkulletReveal from "$lib/components/skeleton/SkulletReveal.svelte";
    import EventHeader from "./EventHeader.svelte";
    import { SAMPLE_EVENT } from "./sampleEvent";
    import EventBodySkeleton from "./EventBodySkeleton.svelte";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import Head from "$lib/components/Head.svelte";
    import { page } from "$app/stores";

    export let data;

    $: headerStore = data.header;
    $: event = $headerStore?.data?.eventByCode!;

    $: season = +$page.params.season as Season;
    $: errorMessage = `No ${DESCRIPTORS[season].seasonName} event with code ${$page.params.code}`;
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
        <SkulletReveal slot="loading" label="Loading event">
            <EventHeader event={SAMPLE_EVENT} />
            <EventBodySkeleton tab={$page.params.tab ?? "matches"} />
        </SkulletReveal>
        <ErrorPage slot="error" status={404} message={errorMessage}>
            (Try searching for events on <a href="/events">the events page</a>)
        </ErrorPage>

        <EventHeader {event} />

        <slot />
    </Loading>
</WidthProvider>
