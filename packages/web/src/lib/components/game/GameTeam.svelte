<script lang="ts">
    import type { GameTeam } from "$lib/game/game-store";
    import Location from "../Location.svelte";

    export let team: GameTeam;
    export let size: "hud" | "pair" = "pair";
    export let align: "left" | "right" = "left";
    export let showYears = true;
</script>

<div class="team {size}" class:right={align == "right"}>
    <div class="title">
        <h1>{team.name}</h1>
        <span class="number">{team.number}</span>
    </div>
    <div class="meta">
        <Location city={team.city} state={team.state} country={team.country} link={false} />
        {#if showYears && team.seasons.length}
            <span class="sep">&middot;</span>
            <span>{team.seasons.join(", ")}</span>
        {/if}
    </div>
</div>

<style>
    .team {
        min-width: 0;
    }

    .title,
    .meta {
        display: flex;
        align-items: baseline;
        gap: 0 var(--md-gap);
    }

  @media (max-width: 550px) {
    .hud .number,
    .hud .meta {
      display: none;
    }
    .hud h1 {
      font-size: 14px;
    }
  }

    .right {
        text-align: right;
    }

    .right .title,
    .right .meta {
        justify-content: flex-end;
    }

    h1 {
        margin: 0;
        font-size: calc(var(--xl-font-size) * 0.85);
        font-weight: 600;
        line-height: 1.15;

        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .hud h1 {
      font-size: calc(var(--lg-font-size) * 1.2);
    }

    .number {
        flex: none;
        font-size: var(--lg-font-size);
    }

    .meta {
        margin-top: var(--sm-gap);
        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }
</style>
