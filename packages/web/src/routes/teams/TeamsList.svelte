<script lang="ts">
    import Card from "$lib/components/Card.svelte";
    import Location from "$lib/components/Location.svelte";
    import { highlight } from "@ftc-scout/common";
    import type { TeamsSearchQuery } from "$lib/graphql/generated/graphql-operations";

    type Team = TeamsSearchQuery["teamsSearch"][number];

    export let rows: { document: Team; highlights: Parameters<typeof highlight>[1] }[];
    export let searchText = "";

    function highlightNum(num: number): string {
        let s = num + "";
        return searchText && s.startsWith(searchText)
            ? "<b>" + searchText + "</b>" + s.slice(searchText.length)
            : s;
    }
</script>

<Card>
    <ul>
        {#each rows as { document: team, highlights } (team.number)}
            <li>
                <a href="/teams/{team.number}">
                    <span class="number"> {@html highlightNum(team.number)} </span>
                    <span class="name">{@html highlight(team.name, highlights)} </span>
                    <em class="location"> <Location {...team.location} link={false} /> </em>
                </a>
            </li>
        {:else}
            <div class="no-teams">
                <b> No matching Teams. </b>
                <p>Try modifying your filters.</p>
            </div>
        {/each}

        <slot />
    </ul>
</Card>

<style>
    ul {
        list-style: none;
        display: grid;
        grid-template-columns: 1fr 1fr;
    }

    @media (max-width: 900px) {
        ul {
            grid-template-columns: 1fr;
        }
    }

    a {
        color: inherit;

        padding: var(--md-pad) 0;
        border-radius: 8px;

        display: grid;
        grid-template-columns: 6ch 1fr;
        grid-template-rows: auto auto;
        gap: var(--sm-gap) var(--lg-gap);

        font-size: var(--lg-font-size);
    }

    a:hover {
        text-decoration: none;
        background: var(--hover-color);
    }

    .number {
        grid-row: span 2;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--lg-font-size);
    }

    .name {
        font-size: var(--md-font-size);
    }

    .location {
        font-size: var(--md-font-size);
        color: var(--secondary-text-color);
    }

    .no-teams {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--md-gap);
        grid-column: span 2;

        width: 100%;
    }
</style>
