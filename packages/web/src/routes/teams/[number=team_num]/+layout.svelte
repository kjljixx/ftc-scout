<script lang="ts">
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import Card from "$lib/components/Card.svelte";
    import Loading from "$lib/components/Loading.svelte";
    import ErrorPage from "$lib/components/ErrorPage.svelte";
    import Head from "$lib/components/Head.svelte";
    import Location from "$lib/components/Location.svelte";
    import AdditionalInfo from "$lib/components/AdditionalInfo.svelte";
    import { page } from "$app/stores";
    import { prettyPrintURL } from "$lib/printers/url";
    import { ALL_SEASONS } from "@ftc-scout/common";
    import { onDestroy, setContext } from "svelte";
    import { get } from "svelte/store";
    import { globalSeason, parseSeason, teamInactiveSeasons } from "$lib/season-store";
    import { queryParam } from "$lib/util/search-params/search-params";
    import { TEAM_SEASON_CTX, type TeamSeasonStore } from "./teamSeason";

    export let data;

    $: headerStore = data.header;
    $: team = $headerStore?.data?.teamByNumber!;
    $: $teamInactiveSeasons = team
        ? ALL_SEASONS.filter((s) => !(team.activeSeasons ?? []).includes(s))
        : [];
    onDestroy(() => teamInactiveSeasons.set([]));

    const season: TeamSeasonStore = queryParam("season", {
        encode: (val) => "" + val,
        decode: (val) => (val == "overall" ? val : parseSeason(val) ?? get(globalSeason)),
        pushState: true,
        killHash: true,
    });
    setContext(TEAM_SEASON_CTX, season);

    function shiftTeamContent(node: HTMLElement) {
        let cards: HTMLElement[] = [];
        let frame = 0;
        let lastSummary = "";

        function scheduleLayout() {
            if (!frame) frame = requestAnimationFrame(updateLayout);
        }

        const resizeObserver = new ResizeObserver(scheduleLayout);

        function updateLayout() {
            frame = 0;
            const nextCards = [...node.querySelectorAll<HTMLElement>("[data-card]")].filter(
                (card) => !card.parentElement?.closest("[data-card]")
            );
            if (
                nextCards.length !== cards.length ||
                nextCards.some((card, i) => card !== cards[i])
            ) {
                cards = nextCards;
                resizeObserver.disconnect();
                resizeObserver.observe(node);
                cards.forEach((card) => resizeObserver.observe(card));
            }
            if (!cards.length) return;

            const requestedShift = Math.max(
                0,
                parseFloat(getComputedStyle(node).getPropertyValue("--team-content-shift")) || 0
            );
            const pageLeft = node.getBoundingClientRect().left;
            const availableShift = Math.max(
                0,
                Math.min(
                    ...cards.map((card) => {
                        const currentOffset = parseFloat(card.style.left) || 0;
                        const sideGap =
                            parseFloat(getComputedStyle(card).getPropertyValue("--side-gap")) || 0;
                        return (
                            card.getBoundingClientRect().left - currentOffset - pageLeft - sideGap
                        );
                    })
                )
            );
            const appliedShift = Math.min(requestedShift, availableShift);
            cards.forEach((card) => {
                const offset = `${-appliedShift}px`;
                if (card.style.left !== offset) card.style.left = offset;
            });
            node.dispatchEvent(new CustomEvent("team-layout-change", { bubbles: true }));

            const summary = `requested=${requestedShift}px applied=${appliedShift}px cards=${cards.length}`;
            if (summary !== lastSummary) {
                console.info(`[team-layout] ${summary}`);
                lastSummary = summary;
            }
        }

        const mutationObserver = new MutationObserver((records) => {
            if (
                records.some(
                    (record) =>
                        record.type === "childList" ||
                        record.target === node ||
                        (record.target as HTMLElement).hasAttribute("data-card")
                )
            ) {
                scheduleLayout();
            }
        });
        mutationObserver.observe(node, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style"],
        });
        resizeObserver.observe(node);
        scheduleLayout();

        return {
            destroy() {
                cancelAnimationFrame(frame);
                resizeObserver.disconnect();
                mutationObserver.disconnect();
            },
        };
    }
</script>

<Head
    title={!!team ? `${team.number} ${team.name} | 2iLScout` : "Team Page | 2iLScout"}
    description={!!team
        ? `Information and matches for team ${team.number} ${team.name}.`
        : `Information and matches for team ${$page.params.number}`}
    image="https://api.ftcscout.org/banners/teams/{$page.params.number}"
    canonical={`/teams/${$page.params.number}`}
/>

<div class="team-page" use:shiftTeamContent>
    <WidthProvider>
        <Loading store={$headerStore} checkExists={(t) => !!t.teamByNumber}>
            <ErrorPage
                slot="error"
                status={404}
                message="No team with number {$page.params.number}"
            >
                (Try searching for teams on <a href="/teams">the teams page</a>)
            </ErrorPage>

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
                            <button
                                class:selected={$season != "overall"}
                                on:click={() => ($season = $globalSeason)}
                            >
                                Season
                            </button>
                            <button
                                class:selected={$season == "overall"}
                                on:click={() => ($season = "overall")}
                            >
                                Overall
                            </button>
                        </div>
                    </div>
                </div>
            </Card>

            <slot />
        </Loading>
    </WidthProvider>
</div>

<style>
    .team-page {
        --team-content-shift: 64px;
    }

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
        text-decoration: underline;
        text-decoration-color: color-mix(in srgb, currentColor 65%, transparent);
        text-underline-offset: 2px;
    }

    .meta :global(a:hover) {
        color: var(--text-color);
        text-decoration-color: currentColor;
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
