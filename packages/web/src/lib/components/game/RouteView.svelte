<script lang="ts">
    import { createTippy } from "svelte-tippy";
    import "tippy.js/dist/tippy.css";
    import { DESCRIPTORS, type Season } from "@ftc-scout/common";
    import { tippyTheme } from "$lib/components/nav/DarkModeToggle.svelte";
    import { HIDDEN_TIP } from "$lib/util/tippy";
    import { teamUrl, type Hop, type PathStop } from "$lib/game/game-store";
  import { faEye, faPersonRifle, faShuffle } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import LifelineIcon from "./LifelineIcon.svelte";

    export let title: string;
    export let path: PathStop[] | null;
    export let note = "";
    export let badge: { text: string; good: boolean } | null = null;
    export let stuckAtEnd = false;
    export let plain = false;
    export let links = true;

    const LIFELINE_NAMES = { radar: "Radar", crosshair: "Crosshair", beacon: "Beacon" } as const;
    const SABOTAGE_ICONS = { sniper: faPersonRifle, disorient: faShuffle, spy: faEye } as const;
    const SABOTAGE_NAMES = { sniper: "Sniper", disorient: "Disorient", spy: "Spy" } as const;
    const TRIGGERED_LABELS = { sniper: "Sniped", disorient: "Disoriented", spy: "Spied" } as const;

    const tippy = createTippy({ placement: "top", touch: ["hold", 500] });

    function hopTip(hop: Hop | undefined, theme: "light" | "dark") {
        if (!hop) return HIDDEN_TIP;
        let lines = [
            hop.eventName,
            `${hop.season} ${DESCRIPTORS[hop.season as Season]?.seasonName ?? ""}${hop.kind === "radar" ? "" : ` · ${hop.match}`}`,
            hop.kind === "radar" ? "Radar roster hop" : hop.relation,
        ];
        let content = document.createElement("div");
        lines.forEach((text, i) => {
            if (!text) return;
            let line = document.createElement("div");
            line.textContent = text;
            if (i == 0) line.style.fontWeight = "600";
            content.append(line);
        });
        return { content, theme, maxWidth: 350 };
    }

    $: hops = path ? path.length - 1 : 0;
    $: hopsText = path ? `${hops} ${hops == 1 ? "hop" : "hops"}` : note;
</script>

<div class="card" class:plain>
    <div class="head">
        <b>{title}</b>
        <span class="hops">{hopsText}</span>
        {#if badge}<span class="badge" class:good={badge.good}>{badge.text}</span>{/if}
    </div>

    {#if path}
        <div class="route">
            {#each path as stop, i}
                {#if i > 0}
                    {#if links && stop.hop?.eventCode}
                        <a
                            class="chev has-hop"
                            href={`/events/${stop.hop.season}/${encodeURIComponent(stop.hop.eventCode)}`}
                            use:tippy={hopTip(stop.hop, $tippyTheme)}
                        >
                            &rsaquo;
                        </a>
                    {:else}
                        <span class="chev" use:tippy={hopTip(stop.hop, $tippyTheme)}>&rsaquo;</span>
                    {/if}
                {/if}
                {@const stuck = stuckAtEnd && i == path.length - 1}
                <div
                    class="stop"
                    class:end={!stuck && (i == 0 || i == path.length - 1)}
                    class:stuck
                >
                    <svelte:element this={links ? "a" : "span"} class="team-link" href={links ? teamUrl(stop.number, stop.hop?.season) : undefined}><b>{stop.number}</b></svelte:element>
                    <svelte:element this={links ? "a" : "span"} class="name" href={links ? teamUrl(stop.number, stop.hop?.season) : undefined}>{stop.name}</svelte:element>
                </div>
                {#each stop.lifelines ?? [] as lifeline}
                    {@const detail = stop.lifelineDetails?.[lifeline]}
                    {@const href = detail?.event
                        ? `/events/${detail.event.season}/${encodeURIComponent(detail.event.code)}`
                        : detail?.team
                        ? teamUrl(detail.team.number)
                        : null}
                    {@const caption = detail?.event?.name ?? (detail?.team ? `${detail.team.number} ${detail.team.name}` : "")}
                    <span class="chev">&rsaquo;</span>
                    <div class="stop">
                        <svelte:element this={href ? "a" : "span"} class="team-link" {href}>
                            <b><span class="lifeline-icon"><LifelineIcon name={lifeline} /></span>{LIFELINE_NAMES[lifeline]}</b>
                        </svelte:element>
                        {#if caption}
                            <svelte:element this={href ? "a" : "span"} class="name" {href}>{caption}</svelte:element>
                        {/if}
                    </div>
                {/each}
                {#each stop.sabotages ?? [] as mark}
                    {@const caption = mark.team ? `${mark.team.number} ${mark.team.name}` : ""}
                    <span class="chev">&rsaquo;</span>
                    <div class="stop">
                        <span class="team-link">
                            <b><span class="sabotage-icon"><Fa icon={SABOTAGE_ICONS[mark.kind]} /></span>{mark.type === "trigger" ? TRIGGERED_LABELS[mark.kind] : SABOTAGE_NAMES[mark.kind]}</b>
                        </span>
                        {#if caption}<span class="name">{caption}</span>{/if}
                    </div>
                {/each}
            {/each}
        </div>
    {/if}
</div>

<style>
    .team-link b {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .lifeline-icon {
        display: flex;
        width: 16px;
        height: 16px;
        color: var(--inline-theme-color);
    }

    .sabotage-icon {
        display: flex;
        width: 14px;
        height: 14px;
        font-size: 14px;
        color: #e0701e;
    }

    .lifeline-icon :global(svg) {
        width: 100%;
        height: 100%;
    }

    .card {
        max-width: 1000px;
        margin: var(--lg-gap) auto;
        padding: var(--lg-pad);

        background: var(--fg-color);
        border: 1px solid var(--sep-color);
        border-radius: 12px;
    }

    .card.plain {
        margin: 0;
        padding: 0;
        border: none;
    }

    .head {
        display: flex;
        align-items: baseline;
        gap: var(--md-gap);
    }

    .head b {
        font-weight: 600;
    }

    .hops {
        color: var(--grayed-out-text-color);
    }

    .badge {
        margin-left: auto;
        padding: 1px 10px;

        border: 1px solid var(--sep-color);
        border-radius: var(--pill-border-radius);

        font-size: 0.9em;
        color: var(--grayed-out-text-color);
    }

    .badge.good {
        border-color: var(--focused-team-ring-color);
        color: var(--text-color);
    }

    .route {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--lg-gap);

        padding-top: var(--md-pad);
    }

    .stop {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.25;
    }

    .stop .name {
        display: block;
        max-width: 130px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        font-size: 0.85em;
        color: var(--grayed-out-text-color);
    }

    .stop a.name,
    .stop a.team-link {
        color: inherit;
    }

    .stop a.name:hover,
    .stop a.team-link:hover {
        text-decoration: underline;
    }

    .stop.end b {
        color: var(--focused-team-ring-color);
    }

    .stop.stuck b {
        color: var(--red-team-color);
    }

    .chev {
        padding: 2px 10px;
        border-radius: 8px;

        font-size: var(--lg-font-size);
        color: var(--grayed-out-text-color);
        user-select: none;
    }

    .chev.has-hop {
        cursor: pointer;
    }

    a.chev:hover {
        text-decoration: none;
    }

    .chev.has-hop:hover,
    .chev.has-hop:focus-visible {
        color: var(--text-color);
        background: var(--hover-color);
        outline: none;
    }
</style>
