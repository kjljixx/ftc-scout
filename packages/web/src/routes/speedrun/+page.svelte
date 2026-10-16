<script lang="ts">
    import { goto } from "$app/navigation";
    import { onDestroy, onMount } from "svelte";
    import { page } from "$app/stores";
    import Head from "$lib/components/Head.svelte";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import GameTeam from "$lib/components/game/GameTeam.svelte";
    import RouteView from "$lib/components/game/RouteView.svelte";
  import GameCustomSetup from "$lib/components/game/GameCustomSetup.svelte";
  import LifelineIcon from "$lib/components/game/LifelineIcon.svelte";
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
        showToast,
        type GamePair,
    } from "$lib/game/game-store";
    import {
        createDuel,
        duelLink,
        duelMe,
        duelOpponent,
        duelSession,
        duelView,
        joinDuel,
        leaveDuel,
        requestRematch,
        startDuel,
    } from "$lib/game/duel-store";

    const STEP_OPTIONS = [3, 5, 7];

    let mode: GameMode = "global";
    let steps = STEP_OPTIONS[0];
    let pair: GamePair | null = null;
    let loading = false;
  let customBusy = false;
    let error: string | null = null;

    let bestFailed = false;
  let duelMode = false;
  let joinCode = "";
  let duelBusy = false;
  let now = Date.now();
  let ticker: ReturnType<typeof setInterval> | undefined;
  const lifelines = [
    { id: "radar", name: "Radar" },
    { id: "crosshair", name: "Crosshair" },
    { id: "beacon", name: "Beacon" },
  ] as const;

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
    const code = $page.url.searchParams.get("duel");
    if (!code || $game.status === "playing" || $duelSession) return;
    duelMode = true;
    joinDuel(code).then(() => goto("/speedrun", { replaceState: true }));
  });

  onDestroy(() => clearInterval(ticker));

  async function makeDuel(duelPair: GamePair) {
    duelBusy = true;
    await createDuel(duelPair);
    duelBusy = false;
  }

  async function submitJoin() {
    if (!joinCode.trim()) return;
    duelBusy = true;
    await joinDuel(joinCode);
    duelBusy = false;
  }

  async function copyLink(code: string) {
    await navigator.clipboard.writeText(duelLink(code));
    showToast("Link copied");
  }

  function leaveGame() {
    leaveDuel();
    resetGame();
  }

    onMount(() => {
        if ($game.status == "playing" && $game.currentUrl) goto($game.currentUrl);
        else if ($game.pair && !$game.best && ($game.status == "won" || $game.status == "gaveUp"))
            loadBestRoute($game.pair);
    });

    function select(newMode: GameMode, newSteps = steps) {
      if (loading || customBusy) return;
        if (newMode == mode && newSteps == steps) return;
        mode = newMode;
        steps = newSteps;
        pair = null;
    }

    async function generate() {
      if (mode === "custom") return;
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

  $: view = $duelView;
  $: ownPath = view?.paths
    ? $game.path.map((stop, index) => {
        const sabotages = view?.paths?.[$duelSession?.you ?? 0]?.[index]?.sabotages;
        return sabotages ? { ...stop, sabotages } : stop;
      })
    : $game.path;
  $: you = $duelSession?.you ?? 0;
  $: duelOutcome = view?.status === "done" ? (view.winner === you ? "won" : "lost") : null;
  $: if (view?.status === "countdown" && !ticker) {
    now = Date.now();
    ticker = setInterval(() => (now = Date.now()), 250);
  }
  $: if (view?.status !== "countdown" && ticker) {
    clearInterval(ticker);
    ticker = undefined;
  }
  $: countdown = view?.countdownEndsAt
    ? Math.max(0, Math.ceil((view.countdownEndsAt - view.serverNow - (now - view.receivedAt)) / 1000))
    : null;
  $: rematchNote = $duelOpponent?.left
    ? "Your opponent left."
    : $duelMe?.rematch
    ? "Waiting for your opponent…"
    : $duelOpponent?.rematch
    ? "Your opponent wants a rematch."
    : "";
  $: opponentText = !$duelOpponent ? "Waiting for a player…" : $duelOpponent.connected ? "Ready" : "Disconnected";
  $: duelReason = view?.reason === "gaveUp"
    ? `${view.winner === you ? "Your opponent" : "You"} gave up.`
    : view?.reason === "disconnected"
    ? `${view.winner === you ? "Your opponent" : "You"} disconnected.`
    : "";
    $: ended = $game.status == "won" || $game.status == "gaveUp";
  $: if (view?.status === "done" && !ended) leaveDuel();
    $: gaveUp = $game.status == "gaveUp";
    $: hops = $game.path.length - 1;
    $: best = $game.best;
    $: usedRadarHop = $game.path.some((stop) => stop.hop?.kind === "radar");
  $: lifelinesUsed = lifelines.filter((lifeline) => !!$game.lifelines[lifeline.id]);
  $: matchedBest = !gaveUp && !!best && hops <= best.hops;
    $: extraHops = best ? hops - best.hops : 0;
    $: if (best && !gaveUp && !usedRadarHop && hops < best.hops) {
        console.error(`[game] route of ${hops} hops beats the best route of ${best.hops} hops`);
    }
    $: yourBadge = duelOutcome
        ? { text: duelOutcome === "won" ? "Winner" : "Lost", good: duelOutcome === "won" }
        : gaveUp
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
            {#if duelOutcome}
                <div>
                    <span class="label">Result</span>
                    <span class="value">{duelOutcome === "won" ? "Won" : "Lost"}</span>
                </div>
            {/if}
            <div>
                <span class="label">Time</span>
                <span class="value">{formatClock($game.elapsedMs ?? 0)}</span>
            </div>
            <div>
                <span class="label">Hops</span>
                <span class="value">{hops}</span>
            </div>
            {#if duelOutcome && view?.paths}
                <div>
                    <span class="label">Opponent hops</span>
                    <span class="value">{view.players[1 - you].hops}</span>
                </div>
            {/if}
        </div>

      {#if duelReason}<div class="lifelines-used">{duelReason}</div>{/if}

      <div class="lifelines-used">
        <span>Lifelines used:</span>
        {#each lifelinesUsed as lifeline}
          <span class="lifeline" role="img" aria-label={lifeline.name} title={lifeline.name}><LifelineIcon name={lifeline.id} /></span>
        {:else}
          <span>None</span>
        {/each}
      </div>
        <RouteView title="Your route" path={ownPath} badge={yourBadge} stuckAtEnd={gaveUp} />
        {#if duelOutcome && view?.paths}
            <RouteView
                title="Opponent's route"
                path={view.paths[1 - you]}
                badge={duelOutcome === "lost" ? { text: "Winner", good: true } : null}
                stuckAtEnd={duelOutcome === "won"}
            />
        {/if}
        {#if !matchedBest}
            <RouteView
                title="Best route"
                path={best?.path ?? null}
                note={bestFailed ? "Unavailable" : "Finding…"}
            />
        {/if}

        <div class="actions">
            {#if view}
                <button class="pill big" on:click={leaveGame}>Leave</button>
                <button
                    class="pill primary"
                    disabled={view.status !== "done" || !!$duelMe?.rematch || !!$duelOpponent?.left}
                    on:click={requestRematch}
                >
                    Rematch
                </button>
            {:else}
                <button class="pill primary" on:click={leaveGame}>Play again</button>
            {/if}
        </div>
        {#if view && rematchNote}<div class="sub waiting">{rematchNote}</div>{/if}
    {:else if view && view.status !== "done"}
        <div class="header">
            <h1>Team Speedrun</h1>
            <div class="sub">Duel &middot; the first player to reach the destination wins.</div>
        </div>

        <div class="pair">
            <GameTeam team={view.pair.start} align="right" />
            <svg class="arrow" width="64" height="32" viewBox="0 0 64 32" aria-hidden="true">
                <path d="M4 16h54M44 4l14 12-14 12" />
            </svg>
            <GameTeam team={view.pair.destination} />
        </div>

        <div class="modes two">
            <div class="mode static" class:on={view.players[you]?.connected}>
                <h3>You</h3>
                <span class="desc">{you === 0 ? "Host" : "Guest"}</span>
            </div>
            <div class="mode static" class:on={!!$duelOpponent?.connected}>
                <h3>Opponent</h3>
                <span class="desc">{opponentText}</span>
            </div>
        </div>

        <div class="results">
            <div>
                <span class="label">Code</span>
                <span class="value">{view.code}</span>
            </div>
            {#if view.status === "countdown" || view.status === "racing"}
                <div>
                    <span class="label">Starting in</span>
                    <span class="value">{countdown ?? 0}</span>
                </div>
            {/if}
        </div>

        <div class="actions">
            <button class="pill big" disabled={view.status !== "lobby"} on:click={leaveDuel}>Leave</button>
            <button class="pill big" on:click={() => copyLink(view?.code ?? "")}>Copy link</button>
            {#if you === 0}
                <button
                    class="pill primary"
                    disabled={view.status !== "lobby" || !$duelOpponent?.connected}
                    on:click={startDuel}
                >
                    Start
                </button>
            {/if}
        </div>
        {#if you === 1}<div class="sub waiting">Waiting for the host to start…</div>{/if}
    {:else}
        <div class="header">
            <h1>Team Speedrun</h1>
            <div class="sub">Click through matches to reach the destination team.</div>
        </div>

        <div class="play-type" role="radiogroup" aria-label="Players">
            <button class="pill" class:on={!duelMode} disabled={loading || customBusy} on:click={() => (duelMode = false)}>
                Solo
            </button>
            <button class="pill" class:on={duelMode} disabled={loading || customBusy} on:click={() => (duelMode = true)}>
                Duel
            </button>
        </div>

        <div class="modes" role="radiogroup" aria-label="Game mode">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div
                class="mode"
                class:on={mode == "global"}
                role="radio"
                aria-checked={mode == "global"}
                aria-disabled={loading || customBusy}
                tabindex={loading || customBusy ? -1 : 0}
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
                aria-disabled={loading || customBusy}
                tabindex={loading || customBusy ? -1 : 0}
                on:click={() => select("regional")}
                on:keydown={(e) => e.key == "Enter" && select("regional")}
            >
                <h3>Regional</h3>
                <span class="desc">Teams that are close together</span>
                <div class="opts">
                    {#each STEP_OPTIONS as n}
                        <button
                            class="pill"
                            disabled={loading || customBusy}
                            class:on={mode == "regional" && steps == n}
                            on:click|stopPropagation={() => select("regional", n)}
                        >
                            {n}
                        </button>
                    {/each}
                </div>
            </div>

          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div
            class="mode" class:on={mode === "custom"} role="radio"
            aria-checked={mode === "custom"} aria-disabled={loading || customBusy}
            tabindex={loading || customBusy ? -1 : 0}
            on:click={() => select("custom")}
            on:keydown={(event) => event.key === "Enter" && select("custom")}
          >
            <h3>Custom</h3>
            <span class="desc">Choose your start and end teams</span>
          </div>
        </div>

      {#if mode === "custom"}
        <GameCustomSetup duel={duelMode} on:busy={(event) => customBusy = event.detail} on:pair={(event) => makeDuel(event.detail)} />
      {:else}
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
                {#if duelMode}
                    <button class="pill primary" disabled={duelBusy} on:click={() => pair && makeDuel(pair)}>
                        Create duel
                    </button>
                {:else}
                    <button class="pill primary" on:click={start}>Start</button>
                {/if}
            {:else}
                <button class="pill primary" disabled={loading} on:click={generate}>
                    Generate
                </button>
            {/if}
        </div>
      {/if}

      {#if duelMode}
        <form class="join" on:submit|preventDefault={submitJoin}>
          <span class="sub">Have a code?</span>
          <input bind:value={joinCode} maxlength="5" placeholder="Code" aria-label="Duel code" autocomplete="off" />
          <button class="pill" type="submit" disabled={duelBusy || !joinCode.trim()}>Join duel</button>
        </form>
      {/if}
    {/if}
</WidthProvider>

<style>
    .lifelines-used {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      max-width: 1000px;
      margin: 20px auto 0;
      color: var(--grayed-out-text-color);
      text-align: center;
      font-size: 13px;
    }

  .lifelines-used .lifeline {
    display: flex;
    color: var(--inline-theme-color);
  }

    .header,
    .modes,
    .play-type,
    .join,
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

    .play-type {
        display: flex;
        gap: var(--md-gap);
        margin-top: var(--lg-gap);
    }

    .join {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--md-gap);
        margin-top: var(--vl-gap);
    }

    .join input {
        width: 7em;
        text-align: center;
        text-transform: uppercase;
    }

    .waiting {
        text-align: center;
    }

    .modes.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .mode.static {
        cursor: default;
    }

    .modes {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
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

  .mode[aria-disabled="true"] {
    cursor: default;
  }

  @media (max-width: 600px) {
    .modes {
      grid-template-columns: 1fr;
      gap: 10px;
    }
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
