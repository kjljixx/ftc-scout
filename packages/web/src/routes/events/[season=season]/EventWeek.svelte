<script lang="ts">
    import type { EventsSearchEventFragment } from "$lib/graphql/generated/graphql-operations";
    import { prettyPrintDateRange } from "$lib/printers/dateRange";
    import type { FuzzyResult } from "@ftc-scout/common";
    import SingleEvent from "./SingleEvent.svelte";

    export let weekNum: number;
    export let start: Date;
    export let end: Date;
    export let events: FuzzyResult<NonNullable<EventsSearchEventFragment>>[];
</script>

<section>
    <h2>
        Week {weekNum + 1}
        <span class="date-range">{prettyPrintDateRange(start, end)}</span>
    </h2>

    <ul>
        {#each events as event}
            <SingleEvent {event} />
        {/each}
    </ul>
</section>

<style>
    section:not(:last-child) {
        margin-bottom: var(--vl-gap);
    }

    h2 {
        display: flex;
        justify-content: space-between;
        align-items: center;

        font-size: var(--lg-font-size);
        background: var(--hover-color);

        padding: var(--md-gap);
        margin-bottom: var(--md-gap);
        border-radius: 8px;
    }

    .date-range {
        font-style: italic;
        font-weight: normal;
        font-size: var(--md-font-size);
    }

    ul {
        column-count: 2;
        column-gap: var(--lg-gap);
    }

    @media (max-width: 900px) {
        ul {
            column-count: 1;
        }
    }
</style>
