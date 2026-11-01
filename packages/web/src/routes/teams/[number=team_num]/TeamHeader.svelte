<script lang="ts">
    import Card from "$lib/components/Card.svelte";
    import Location from "$lib/components/Location.svelte";
    import AdditionalInfo from "$lib/components/AdditionalInfo.svelte";
    import { prettyPrintURL } from "$lib/printers/url";
    import type { TeamHeaderQuery } from "$lib/graphql/generated/graphql-operations";
    import { createEventDispatcher } from "svelte";

    export let team: NonNullable<TeamHeaderQuery["teamByNumber"]>;
    export let overall: boolean;

    const dispatch = createEventDispatcher<{ selectSeason: void; selectOverall: void }>();
</script>

<Card vis={false}>
    <div class="header">
        <div class="identity">
            <div class="title">
                <h1>{team.name}</h1>
                <span class="number">{team.number}</span>
            </div>

            <div class="meta">
                <div class="meta-line">
                    <Location {...team.location} />
                    {#if team.website}
                        <span class="sep">&middot;</span>
                        <a href={team.website} target="_blank" rel="noreferrer">
                            {prettyPrintURL(team.website)}
                        </a>
                    {/if}
                </div>
                <AdditionalInfo>
                    <div class="meta-line">
                        <span>Rookie year {team.rookieYear}</span>
                    </div>
                    <div class="meta-line">
                        <span>{team.schoolName}</span>
                        {#if team.sponsors.length}
                            <span class="sep">&middot;</span>
                            <span>{team.sponsors.join(", ")}</span>
                        {/if}
                    </div>
                </AdditionalInfo>
            </div>
        </div>

        <div class="actions">
            <div class="view-switch" role="group" aria-label="Stats view">
                <button class:selected={!overall} on:click={() => dispatch("selectSeason")}>
                    Season
                </button>
                <button class:selected={overall} on:click={() => dispatch("selectOverall")}>
                    Overall
                </button>
            </div>
        </div>
    </div>
</Card>

<style>
    .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--lg-gap);
        flex-wrap: wrap;
        margin-top: var(--sm-gap);
    }

    .identity {
        display: flex;
        flex-direction: column;
        gap: var(--md-gap);
        min-width: 0;
    }

    .title {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0 var(--md-gap);
    }

    h1 {
        margin: 0;
        font-size: var(--xl-font-size);
        font-weight: 600;
        line-height: 1.15;
    }

    .number {
        font-size: var(--lg-font-size);
        color: var(--text-color);
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
        text-underline-offset: 2px;
    }

    .meta :global(a:hover) {
        color: var(--text-color);
    }

    .view-switch {
        display: inline-flex;
        gap: 2px;
        padding: 2px;

        background: var(--raised-bg-color);
        border-radius: 8px;
    }

    .view-switch button {
        padding: var(--md-pad) calc(var(--lg-pad) * 1.5);
        border: none;
        border-radius: 6px;

        background: transparent;
        color: var(--grayed-out-text-color);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
    }

    .view-switch button:hover {
        background: var(--hover-color);
        color: var(--text-color);
    }

    .view-switch button.selected {
        background: var(--sep-color);
        color: var(--text-color);
        font-weight: 600;
    }

    .actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--md-gap);
    }

    @media (max-width: 550px) {
        .header {
            padding-left: var(--md-pad);
        }
    }
</style>
