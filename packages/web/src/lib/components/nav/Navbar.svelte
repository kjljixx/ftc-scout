<script lang="ts">
    import DarkModeToggle from "./DarkModeToggle.svelte";
    import Hamburger from "./Hamburger.svelte";
    import Logo from "./Logo.svelte";
    import Searchbar from "./search/Searchbar.svelte";
    import { gameActive } from "$lib/game/game-store";
    import SeasonSelect from "$lib/components/ui/form/SeasonSelect.svelte";
    import { changeSeason, globalSeason } from "$lib/season-store";
    import type { Season } from "@ftc-scout/common";

    const onSeasonChange = (e: Event) =>
        changeSeason(+(e.currentTarget as HTMLSelectElement).value as Season);
</script>

<nav>
    <div class="left">
        <div class="hamburger" class:hidden={$gameActive}><Hamburger /></div>
        <Logo />
    </div>

    <div class="right">
        <div class="search-group">
            <div class="season-select" class:hidden={$gameActive}>
                <SeasonSelect
                    season={$globalSeason}
                    nonForm
                    id="navbar-season-select"
                    on:change={onSeasonChange}
                />
            </div>
            <Searchbar disabled={$gameActive} />
        </div>
        <DarkModeToggle />
    </div>
</nav>

<style>
    nav {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: var(--navbar-size);

        padding: var(--md-pad);

        background: var(--navbar-bg-color);
        z-index: var(--navbar-zi);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);

        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .left {
        display: flex;
        align-items: center;
    }

    .hidden {
        visibility: hidden;
    }

    .search-group {
        display: flex;
        align-items: stretch;
        gap: 8px;
    }

    .season-select {
        display: flex;
    }

    .season-select :global(select) {
        width: auto;
        border-radius: 4px;
        padding: 10px 30px 10px 12px;
        background-color: var(--fg-color);
    }

    .season-select :global(select:hover) {
        background-color: var(--hover-color);
    }

    .right {
        display: flex;
        align-items: center;
        gap: calc(var(--lg-gap) * 1.75);
    }
</style>
