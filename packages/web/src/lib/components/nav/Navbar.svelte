<script>
    import DarkModeToggle from "./DarkModeToggle.svelte";
    import Hamburger from "./Hamburger.svelte";
    import Logo from "./Logo.svelte";
    import Searchbar from "./search/Searchbar.svelte";
    import { gameActive } from "$lib/game/game-store";
</script>

<nav>
    <div class="left">
        <div class="hamburger" class:hidden={$gameActive}><Hamburger /></div>
        <Logo />
    </div>

    <div class="right">
        <Searchbar disabled={$gameActive} />
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

    .right {
        display: flex;
        align-items: center;
        gap: calc(var(--lg-gap) * 1.75);
    }
</style>
