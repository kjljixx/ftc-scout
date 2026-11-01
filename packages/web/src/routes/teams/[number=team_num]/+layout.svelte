<script lang="ts">
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import Loading from "$lib/components/Loading.svelte";
    import SkulletReveal from "$lib/components/skeleton/SkulletReveal.svelte";
    import TeamHeader from "./TeamHeader.svelte";
    import { SAMPLE_TEAM } from "./sampleTeam";
    import TeamBodySkeleton from "./TeamBodySkeleton.svelte";
    import ErrorPage from "$lib/components/ErrorPage.svelte";
    import Head from "$lib/components/Head.svelte";
    import { page } from "$app/stores";
    import { ALL_SEASONS, type Season } from "@ftc-scout/common";
    import { onDestroy, setContext } from "svelte";
    import { get } from "svelte/store";
    import { globalSeason, parseSeason, teamInactiveSeasons } from "$lib/season-store";
    import { queryParam } from "$lib/util/search-params/search-params";
    import { TEAM_SEASON_CTX, teamViewMemory, type TeamSeasonStore } from "./teamSeason";

    export let data;

    $: headerStore = data.header;
    $: team = $headerStore?.data?.teamByNumber!;
    $: $teamInactiveSeasons = team
        ? ALL_SEASONS.filter((s) => !(team.activeSeasons ?? []).includes(s))
        : [];
    onDestroy(() => teamInactiveSeasons.set([]));

    onDestroy(() => (teamViewMemory.overall = false));

    const season: TeamSeasonStore = queryParam("season", {
        encode: (val) => "" + val,
        decode: (val) => {
            let decoded: Season | "overall" =
                val == "overall" || (val == null && teamViewMemory.overall)
                    ? "overall"
                    : parseSeason(val) ?? get(globalSeason);
            teamViewMemory.overall = decoded == "overall";
            return decoded;
        },
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
            <SkulletReveal slot="loading" label="Loading team">
                <TeamHeader team={SAMPLE_TEAM} overall={false} />
                <TeamBodySkeleton />
            </SkulletReveal>
            <ErrorPage
                slot="error"
                status={404}
                message="No team with number {$page.params.number}"
            >
                (Try searching for teams on <a href="/teams">the teams page</a>)
            </ErrorPage>

            <TeamHeader
                {team}
                overall={$season == "overall"}
                on:selectSeason={() => ($season = $globalSeason)}
                on:selectOverall={() => ($season = "overall")}
            />

            <slot />
        </Loading>
    </WidthProvider>
</div>

<style>
    .team-page {
        --team-content-shift: 64px;
    }
</style>
