<script lang="ts">
    import Navbar from "$lib/components/nav/Navbar.svelte";
    import { browser } from "$app/environment";
    import Sidebar from "$lib/components/nav/Sidebar.svelte";
    import TimestampToast from "$lib/components/TimestampToast.svelte";
    import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import { sendAnalyticsRequest } from "./analytics";
    import GameHud from "$lib/components/game/GameHud.svelte";
    import GameToast from "$lib/components/game/GameToast.svelte";
    import {
        blockedNavigation,
        blockedShortcut,
        game,
        gameActive,
        isAllowedPath,
    } from "$lib/game/game-store";

    if (browser) {
        // Svelte uses window.scrollTo to emulate the scroll resetting when navigation. However we
        // have overflow hidden on the body (so the scrollbar is under the navbar). Therefore
        // instead of scrolling the window we scroll the content div.
        // This is pretty hacky but seems to work.
        window.scrollTo = (x: any, y?: any) => {
            document.getElementById("content")?.scrollTo(x, y);
        };
        // Similarly sveltekit uses these props to figure out the current scroll of the document.
        Object.defineProperties(window, {
            pageXOffset: { get: () => document.getElementById("content")?.scrollLeft },
            pageYOffset: { get: () => document.getElementById("content")?.scrollTop },
        });
    }

    afterNavigate(sendAnalyticsRequest);

    beforeNavigate(({ to, cancel }) => {
        if (!$gameActive || !to || to.url.origin != location.origin) return;
        if (isAllowedPath(to.url.pathname)) return;
        cancel();
        blockedNavigation(to.url.pathname);
    });

    onMount(() => {
        if ($gameActive && !isAllowedPath(location.pathname) && $game.currentUrl) {
            goto($game.currentUrl);
        }
    });

    $: if ($game.status == "won" && $page.url.pathname != "/speedrun") goto("/speedrun");

    function blockFind(e: KeyboardEvent) {
        if (!$gameActive) return;
        let findShortcut = (e.ctrlKey || e.metaKey) && (e.key == "f" || e.key == "g");
        if (!findShortcut && e.key != "F3") return;
        e.preventDefault();
        blockedShortcut("find");
    }
</script>

<svelte:head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" />
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap"
        rel="stylesheet"
    />
</svelte:head>

<svelte:window on:keydown={blockFind} />

<Navbar />
{#if !$gameActive}
    <Sidebar />
{/if}
<GameHud />
<GameToast />
<TimestampToast />

<!-- Autofocus allows the document to be scrolled immediately without having to click. -->
<!-- svelte-ignore a11y-autofocus -->
<div id="content" tabindex="-1" autofocus class:game={$gameActive}>
    <slot />
</div>

<style>
    @import "/static/css/global.css";
    @import "/static/css/form-reset.css";

    #content {
        position: relative;

        margin-top: var(--navbar-size);
        margin-left: var(--sidebar-size);
        padding: var(--md-pad);
        padding-bottom: 80px;

        overflow: auto;
        max-height: calc(100vh - var(--navbar-size));
        scrollbar-gutter: stable both-edges;

        scroll-padding-top: var(--lg-gap);
    }

    @media (max-width: 1500px) {
        #content {
            margin-left: 0;
        }
    }

    @media (max-width: 550px) {
        #content {
            padding-left: 0;
            padding-right: 0;
            scrollbar-gutter: initial;
        }
    }

    #content.game {
        margin-left: 0;
        padding-top: calc(var(--md-pad) + var(--hud-size));
    }

    :global(body) {
        --hud-size: 72px;
    }

    #content:focus,
    #content:focus-visible {
        outline: none;
    }

    :global(body) {
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        position: fixed;
        overflow: hidden;

        background: var(--bg-color);
    }
</style>
