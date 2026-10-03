<script lang="ts">
    import { longestCommonPrefix, type Season } from "@ftc-scout/common";
    import type { EventPageQuery } from "$lib/graphql/generated/graphql-operations";
    import Card from "$lib/components/Card.svelte";
    import { sortString } from "$lib/util/sorters";

    type RelatedEvent = NonNullable<EventPageQuery["eventByCode"]>["relatedEvents"][number];

    export let relatedEvents: RelatedEvent[];
    export let thisEventName: string;
    export let thisEventCode: string;
    export let season: Season;
    export let tab: string;

    $: allEvents = [{ name: thisEventName, code: thisEventCode }, ...relatedEvents];
    $: mainEventName = longestCommonPrefix(allEvents.map((e) => e.name));
    $: divisions = [...allEvents].sort((a, b) => sortString(a.code, b.code));

    function shortName(name: string): string {
        return name
            .slice(mainEventName.length)
            .trim()
            .replace(/\-\s*/, "")
            .replace(/\s*division$/i, "");
    }

    function isFinals(name: string): boolean {
        return /^(finals?)?$/i.test(shortName(name));
    }

    $: finals = divisions.find((d) => isFinals(d.name));
    $: others = divisions.filter((d) => d != finals);
    $: groups = finals ? [[finals], others] : [others];
</script>

{#if relatedEvents.length}
    <Card vis={false}>
        <nav aria-label="Divisions">
            {#each groups as group}
                <div class="group">
                    {#each group as division}
                        <a
                            href="/events/{season}/{division.code}/{tab}"
                            class:selected={division.code == thisEventCode}
                            class:finals={division == finals}
                            aria-current={division.code == thisEventCode ? "page" : undefined}
                        >
                            {shortName(division.name) || "Finals"}
                        </a>
                    {/each}
                </div>
            {/each}
        </nav>
    </Card>
{/if}

<style>
    nav {
        display: flex;
        flex-wrap: wrap;
        gap: var(--md-gap);
    }

    .group {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 2px;
        padding: 2px;

        background: var(--fg-color);
        border-radius: 8px;
    }

    a {
        padding: var(--md-pad) calc(var(--lg-pad) * 1.5);
        border-radius: 6px;

        color: var(--grayed-out-text-color);
        font-weight: 500;
        text-decoration: none;
        text-transform: capitalize;
    }

    a:hover {
        background: var(--hover-color);
        color: var(--text-color);
    }

    a.finals {
        font-weight: 600;
    }

    a.selected {
        background: var(--sep-color);
        color: var(--text-color);
        font-weight: 600;
    }
</style>
