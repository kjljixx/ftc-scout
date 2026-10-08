<script lang="ts">
    import { CURRENT_SEASON, DESCRIPTORS, Season } from "@ftc-scout/common";
    import type { EventPageQuery } from "$lib/graphql/generated/graphql-operations";
    import Fa from "svelte-fa";
    import StdErrLabel from "./StdErrLabel.svelte";
    import { faXmark } from "@fortawesome/free-solid-svg-icons";
    import { goto, preloadData } from "$app/navigation";
    import { fly } from "svelte/transition";
    import { createEventDispatcher } from "svelte";
    import { prettyPrintFloat, prettyPrintOrdinal } from "$lib/printers/number";

    type Team = Omit<NonNullable<EventPageQuery["eventByCode"]>["teams"][number], "__typename">;

    export let team: Pick<Team, "stats" | "season"> & { eventCode?: string | undefined } & {
        team: { name: string; number: number };
    };
    export let remote: boolean;

    $: season = team.season as Season;
    $: code = team.eventCode;
    $: number = team.team.number;
    $: name = team.team.name;

    $: seasonPart = season == CURRENT_SEASON ? "" : `?season=${season}`;
    $: codePart = code ? "#" + code : "";
    $: href = `/teams/${number}${seasonPart}${codePart}`;
    $: preloadData(href);

    $: stats = team.stats;
    $: useNp = !(DESCRIPTORS[season].pensSubtract || remote);
    $: npStat = useNp ? ("totalPointsNp" as const) : ("totalPoints" as const);
    $: oprStdErr = (stats?.oprSe as Record<string, number | null | undefined> | undefined)?.[
        npStat
    ];

    const dispatch = createEventDispatcher<{ close: void }>();

    function onKeydown(e: KeyboardEvent) {
        let target = e.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable]")) return;
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

        if (e.key == "Escape") dispatch("close");
        if (e.key == "Enter" && !target?.closest("button, a")) goto(href);
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="card" transition:fly={{ y: 100, duration: 300 }}>
    <a {href}>
        <div class="team">
            <span class="name">{name}</span>
            <span class="number">{number}</span>
        </div>

        {#if stats}
            <div class="stats">
                <div class="stat">
                    <span class="label">Rank</span>
                    <span class="value">{prettyPrintOrdinal(stats.rank)}</span>
                </div>
                {#if "wins" in stats}
                    <div class="stat">
                        <span class="label">W-L-T</span>
                        <span class="value">{stats.wins}-{stats.losses}-{stats.ties}</span>
                    </div>
                {/if}
                <div class="stat">
                    <span class="label">{useNp ? "np OPR" : "OPR"}</span>
                    <span class="value">
                        {prettyPrintFloat(stats.opr[npStat])}
                        <StdErrLabel stdErr={oprStdErr} inline />
                    </span>
                </div>
                <div class="stat">
                    <span class="label">{useNp ? "np AVG" : "AVG"}</span>
                    <span class="value">{prettyPrintFloat(stats.avg[npStat])}</span>
                </div>
            </div>
        {/if}
    </a>

    <button class="close" title="Deselect team (Esc)" on:click={() => dispatch("close")}>
        <Fa icon={faXmark} />
    </button>
</div>

<style>
    .card {
        position: fixed;
        bottom: 0;
        margin: var(--md-gap);
        --team-bar-width: 390px;
        --team-bar-ss: var(--sidebar-size);
        left: max(0px, calc(50% + var(--team-bar-ss) / 2 - var(--team-bar-width)));
        right: max(0px, calc(50% + var(--team-bar-ss) / 2 + var(--team-bar-width)));
        width: min(
            calc(var(--team-bar-width) * 2),
            calc(100% - var(--md-gap) * 2 - var(--team-bar-ss))
        );

        background: var(--raised-bg-color);
        color: var(--text-color);

        border-radius: 12px;
        box-shadow: inset 0 0 0 2px var(--focused-team-ring-color), 0 16px 32px rgba(0, 0, 0, 0.45),
            0 2px 6px rgba(0, 0, 0, 0.4);

        z-index: var(--focused-team-zi);

        outline-color: var(--focused-team-ring-color);
    }

    @media (max-width: 1500px) {
        .card {
            --team-bar-ss: 0px;
        }
    }

    a {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--md-gap) var(--vl-gap);
        text-decoration: none;
        color: inherit;

        padding: var(--lg-pad) var(--vl-gap);
        border-radius: 12px;
    }

    .close {
        position: absolute;
        top: var(--sm-gap);
        right: var(--sm-gap);

        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;

        border: none;
        border-radius: 50%;
        background: none;
        color: var(--grayed-out-text-color);
        cursor: pointer;
    }

    .close:hover {
        background: color-mix(in srgb, currentColor 15%, transparent);
        color: var(--text-color);
    }

    .team {
        display: flex;
        align-items: baseline;
        gap: var(--md-gap);

        flex: 1;
        min-width: 0;
        padding-right: 1.5rem;
    }

    .name {
        font-size: var(--lg-font-size);
        font-weight: 600;
        line-height: 1.2;

        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
    }

    .number {
        font-size: var(--md-font-size);
        color: var(--grayed-out-text-color);
    }

    .stats {
        order: 2;
        display: flex;
        gap: var(--vl-gap);
        flex-basis: 100%;
    }

    .stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .label {
        font-size: var(--sm-font-size);
        color: var(--grayed-out-text-color);
    }

    .value {
        font-size: var(--lg-font-size);
        font-weight: 600;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
    }

    @media (max-width: 600px) {
        a {
            padding: var(--lg-pad);
        }

        .name {
            font-size: var(--lg-font-size);
        }

        .number,
        .label {
            font-size: var(--md-font-size);
        }

        .stats {
            justify-content: space-between;
            gap: var(--md-gap);
        }

        .value {
            font-size: var(--lg-font-size);
        }
    }
</style>
