<script lang="ts">
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import Head from "$lib/components/Head.svelte";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import GameTeam from "$lib/components/game/GameTeam.svelte";
    import RouteView from "$lib/components/game/RouteView.svelte";
    import {
        fetchBestRoute,
        fetchPair,
        formatClock,
        game,
        resetGame,
        setBestRoute,
        startGame,
        startUrl,
        type GameMode,
        type GamePair,
    } from "$lib/game/game-store";

    const STEP_OPTIONS = [3, 5, 7];

    let mode: GameMode = "global";
    let steps = STEP_OPTIONS[0];
    let pair: GamePair | null = null;
    let loading = false;
    let error: string | null = null;

    let bestFailed = false;

    async function loadBestRoute(pair: GamePair) {
        bestFailed = false;
        try {
            setBestRoute(pair, await fetchBestRoute(pair));
        } catch (e) {
            console.error("[game] could not load the best route:", e);
            bestFailed = true;
        }
    }

    onMount(() => {
        if ($game.status == "playing" && $game.currentUrl) goto($game.currentUrl);
        else if ($game.pair && !$game.best && ($game.status == "won" || $game.status == "gaveUp"))
            loadBestRoute($game.pair);
    });

    function select(newMode: GameMode, newSteps = steps) {
        if (newMode == mode && newSteps == steps) return;
        mode = newMode;
        steps = newSteps;
        pair = null;
    }

    async function generate() {
        loading = true;
        error = null;
        try {
            pair = await fetchPair(mode, steps);
        } catch (e) {
            console.error("[game] could not generate a pair:", e);
            error = "Could not generate a pair. Try again.";
        } finally {
            loading = false;
        }
    }

    function start() {
        if (!pair) return;
        startGame(pair);
        goto(startUrl(pair));
    }

    $: ended = $game.status == "won" || $game.status == "gaveUp";
    $: gaveUp = $game.status == "gaveUp";
    $: hops = $game.path.length - 1;
    $: best = $game.best;
    $: matchedBest = !gaveUp && !!best && hops <= best.hops;
    $: extraHops = best ? hops - best.hops : 0;
    $: if (best && !gaveUp && hops < best.hops) {
        console.error(`[game] route of ${hops} hops beats the best route of ${best.hops} hops`);
    }
    $: yourBadge = gaveUp
        ? { text: "Gave up", good: false }
        : matchedBest
        ? { text: "Best route", good: true }
        : extraHops > 0
        ? { text: `+${extraHops} ${extraHops == 1 ? "hop" : "hops"}`, good: false }
        : null;
</script>

<Head title="Team Speedrun | 2iLScout" description="Race from one FTC team to another." />

<WidthProvider>
    {#if ended && $game.pair}
        <div class="pair">
            <GameTeam team={$game.pair.start} align="right" />
            <svg class="arrow" width="64" height="32" viewBox="0 0 64 32" aria-hidden="true">
                <path d="M4 16h54M44 4l14 12-14 12" />
            </svg>
            <GameTeam team={$game.pair.destination} />
        </div>

        <div class="results">
            <div>
                <span class="label">Time</span>
                <span class="value">{formatClock($game.elapsedMs ?? 0)}</span>
            </div>
            <div>
                <span class="label">Hops</span>
                <span class="value">{hops}</span>
            </div>
        </div>

        <RouteView title="Your route" path={$game.path} badge={yourBadge} stuckAtEnd={gaveUp} />
        {#if !matchedBest}
            <RouteView
                title="Best route"
                path={best?.path ?? null}
                note={bestFailed ? "Unavailable" : "Finding…"}
            />
        {/if}

        <div class="actions">
            <button class="pill primary" on:click={resetGame}>Play again</button>
        </div>
    {:else}
        <div class="header">
            <h1>Team Speedrun</h1>
            <div class="sub">Click through matches to reach the destination team.</div>
        </div>

        <div class="modes">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div
                class="mode"
                class:on={mode == "global"}
                role="radio"
                aria-checked={mode == "global"}
                tabindex="0"
                on:click={() => select("global")}
                on:keydown={(e) => e.key == "Enter" && select("global")}
            >
                <h3>Global</h3>
                <span class="desc">Any two connected teams</span>
            </div>

            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div
                class="mode"
                class:on={mode == "regional"}
                role="radio"
                aria-checked={mode == "regional"}
                tabindex="0"
                on:click={() => select("regional")}
                on:keydown={(e) => e.key == "Enter" && select("regional")}
            >
                <h3>Regional</h3>
                <span class="desc">Teams that are close together</span>
                <div class="opts">
                    {#each STEP_OPTIONS as n}
                        <button
                            class="pill"
                            class:on={mode == "regional" && steps == n}
                            on:click|stopPropagation={() => select("regional", n)}
                        >
                            {n}
                        </button>
                    {/each}
                </div>
            </div>
        </div>

        {#if pair}
            <div class="pair">
                <GameTeam team={pair.start} align="right" />
                <svg class="arrow" width="64" height="32" viewBox="0 0 64 32" aria-hidden="true">
                    <path d="M4 16h54M44 4l14 12-14 12" />
                </svg>
                <GameTeam team={pair.destination} />
            </div>
        {/if}

        {#if error}<div class="error">{error}</div>{/if}

        <div class="actions">
            {#if pair}
                <button class="pill big" disabled={loading} on:click={generate}>Regenerate</button>
                <button class="pill primary" on:click={start}>Start</button>
            {:else}
                <button class="pill primary" disabled={loading} on:click={generate}>
                    Generate
                </button>
            {/if}
        </div>
    {/if}
</WidthProvider>

<style>
    .header,
    .modes,
    .pair,
    .results,
    .actions,
    .error {
        max-width: 1000px;
        margin-left: auto;
        margin-right: auto;
    }

    .header {
        margin-top: var(--lg-gap);
    }

    h1 {
        margin: 0;
        font-size: var(--xl-font-size);
        font-weight: 600;
        line-height: 1.15;
    }

    .sub {
        margin-top: var(--md-gap);
        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }

    .modes {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--lg-gap);
        margin-top: var(--lg-gap);
        margin-bottom: var(--vl-gap);
    }

    .mode {
        display: flex;
        flex-direction: column;
        gap: var(--md-gap);

        background: var(--fg-color);
        border: 1px solid var(--sep-color);
        border-radius: 12px;
        padding: var(--lg-pad);

        cursor: pointer;
    }

    .mode.on {
        border-color: var(--focused-team-ring-color);
        box-shadow: 0 0 0 1px var(--focused-team-ring-color);
    }

    h3 {
        margin: 0;
        font-size: calc(var(--lg-font-size) * 1.2);
        font-weight: 600;
    }

    .desc {
        color: var(--grayed-out-text-color);
    }

    .opts {
        display: flex;
        gap: var(--md-gap);
        margin-top: auto;
    }

    .pair {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        gap: var(--vl-gap);
        align-items: center;
        margin-top: var(--vl-gap);
        margin-bottom: var(--vl-gap);
    }

    .arrow {
        display: block;
        fill: none;
        stroke: var(--grayed-out-text-color);
        stroke-width: 3;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .results {
        display: flex;
        justify-content: center;
        gap: calc(var(--xl-gap) * 2);
        text-align: center;
    }

    .label,
    .value {
        display: block;
    }

    .value {
        font-size: calc(var(--xl-font-size) * 1.25);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }

    .actions {
        display: flex;
        justify-content: center;
        gap: var(--md-gap);
        margin-top: var(--vl-gap);
    }

    .error {
        text-align: center;
        color: var(--red-team-color);
    }

    .pill {
        font-family: inherit;
        font-size: inherit;
        color: inherit;

        background: var(--form-bg-color);
        border: 1px solid var(--sep-color);
        border-radius: var(--pill-border-radius);
        padding: calc(var(--md-pad) * 0.9) calc(var(--md-pad) * 2);

        white-space: nowrap;
        cursor: pointer;
    }

    .pill:hover:not(:disabled) {
        background: var(--form-hover-bg-color);
    }

    .pill:disabled {
        opacity: var(--form-disabled-opacity);
        cursor: not-allowed;
    }

    .pill.on {
        border-color: var(--focused-team-ring-color);
        box-shadow: 0 0 0 1px var(--focused-team-ring-color) inset;
    }

    .pill.big,
    .pill.primary {
        font-size: calc(var(--md-font-size) * 1.15);
        font-weight: 600;
        padding: 11px 30px;
    }

    .pill.primary {
        background: var(--inline-theme-color);
        border-color: transparent;
        color: #17111f;
    }

    .pill.primary:hover:not(:disabled) {
        background: var(--inline-theme-color);
        filter: brightness(1.12);
    }
</style>
