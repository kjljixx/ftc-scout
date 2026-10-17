<script lang="ts">
    import { tick } from "svelte";
    import type { EventType } from "@ftc-scout/common";
    import {
        faFlagCheckered,
        faGlobe,
        faHandshake,
        faStar,
        faTrophy,
    } from "@fortawesome/free-solid-svg-icons";
    import Fa from "svelte-fa";
    import { prettyPrintEventTypeLong } from "$lib/printers/eventType";

    type EventLink = { code: string; name: string; type: EventType };

    export let events: EventLink[];

    const eventIcons: Record<EventType, typeof faTrophy> = {
        Championship: faTrophy,
        FIRSTChampionship: faGlobe,
        LeagueTournament: faTrophy,
        Qualifier: faFlagCheckered,
        SuperQualifier: faFlagCheckered,
        LeagueMeet: faFlagCheckered,
        Pilot: faFlagCheckered,
        Premier: faStar,
        InnovationChallenge: faStar,
        Kickoff: faStar,
        DemoExhibition: faStar,
        Scrimmage: faHandshake,
        OffSeason: faHandshake,
        NonAdvancement: faHandshake,
        PracticeDay: faHandshake,
        Workshop: faHandshake,
        VolunteerSignup: faHandshake,
        Other: faHandshake,
    };

    const minIndexWidth = 120;
    const indexGap = 24;
    let visible = false;
    let left = 0;
    let activeCode: string | undefined;

    function trackEvents(node: HTMLElement, entries: EventLink[]) {
        const content = document.getElementById("content");
        const region = node.parentElement;
        const navigation = node.querySelector("nav")!;
        if (!content || !region) {
            console.warn("[team-event-index] page scroll container or event region is missing");
            return;
        }

        let sections: { code: string; heading: HTMLElement; card: HTMLElement }[] = [];
        let frame = 0;
        let destroyed = false;

        function updateLayout() {
            frame = 0;
            if (!sections.length) return;
            const regionBounds = region!.getBoundingClientRect();
            const cardRight = Math.max(
                ...sections.map(({ card }) => card.getBoundingClientRect().right)
            );
            left = cardRight - regionBounds.left + indexGap;
            visible = regionBounds.width - left >= minIndexWidth;
            if (!visible) return;

            const contentBounds = content!.getBoundingClientRect();
            const offset = parseFloat(getComputedStyle(navigation).top) + 32;
            const atBottom =
                content!.scrollTop + content!.clientHeight >= content!.scrollHeight - 1;
            const current = atBottom
                ? sections[sections.length - 1]
                : sections
                      .filter(
                          ({ heading }) =>
                              heading.getBoundingClientRect().top <= contentBounds.top + offset
                      )
                      .pop() ?? sections[0];
            activeCode = current.code;
        }

        function scheduleLayout() {
            if (!frame) frame = requestAnimationFrame(updateLayout);
        }

        const resizeObserver = new ResizeObserver(scheduleLayout);

        async function refresh(next: EventLink[]) {
            await tick();
            if (destroyed) return;
            sections = next.flatMap(({ code }) => {
                const heading = document.getElementById(code);
                const card = heading?.parentElement?.parentElement;
                if (!heading || !card || !region!.contains(heading)) {
                    console.warn(`[team-event-index] event heading is missing code=${code}`);
                    return [];
                }
                return [{ code, heading, card }];
            });
            resizeObserver.disconnect();
            resizeObserver.observe(region!);
            sections.forEach(({ card }) => resizeObserver.observe(card));
            console.info(
                `[team-event-index] ready events=${sections.length} minWidth=${minIndexWidth} gap=${indexGap}`
            );
            scheduleLayout();
        }

        content.addEventListener("scroll", scheduleLayout, { passive: true });
        content.addEventListener("team-layout-change", scheduleLayout);
        window.addEventListener("resize", scheduleLayout);
        refresh(entries);

        return {
            update: refresh,
            destroy() {
                destroyed = true;
                cancelAnimationFrame(frame);
                resizeObserver.disconnect();
                content.removeEventListener("scroll", scheduleLayout);
                content.removeEventListener("team-layout-change", scheduleLayout);
                window.removeEventListener("resize", scheduleLayout);
            },
        };
    }

    function jumpToEvent(code: string) {
        const heading = document.getElementById(code);
        if (!heading) {
            console.warn(`[team-event-index] cannot navigate to missing event code=${code}`);
            return;
        }
        heading.scrollIntoView({ block: "start" });
        heading.focus({ preventScroll: true });
        activeCode = code;
        console.info(`[team-event-index] navigated code=${code}`);
    }
</script>

<aside class="event-index" class:visible style:left="{left}px" use:trackEvents={events}>
    <nav aria-label="Team events">
        {#each events as event}
            <a
                href="#{encodeURIComponent(event.code)}"
                title={`${event.name} · ${prettyPrintEventTypeLong(event.type)}`}
                aria-label={`${event.name}, ${prettyPrintEventTypeLong(event.type)}`}
                aria-current={activeCode === event.code ? "location" : undefined}
                on:click|preventDefault={() => jumpToEvent(event.code)}
            >
                <span class="event-icon"><Fa icon={eventIcons[event.type]} fw /></span>
                <span class="event-name">{event.name}</span>
            </a>
        {/each}
    </nav>
</aside>

<style>
    .event-index {
        display: none;
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        min-width: 120px;
    }

    .event-index.visible {
        display: block;
    }

    nav {
        position: sticky;
        top: 24px;
        max-height: calc(100dvh - var(--navbar-size) - 48px);
        overflow-y: auto;
        scrollbar-width: thin;
    }

    a {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 0 7px 12px;
        border-left: 1px solid var(--sep-color);
        color: var(--secondary-text-color);
        font-size: 1.05em;
        line-height: 1.45;
    }

    .event-icon {
        display: flex;
        flex: none;
    }

    .event-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    a:hover {
        color: var(--text-color);
        text-decoration: none;
    }

    a[aria-current="location"] {
        padding-left: 11px;
        border-left: 2px solid var(--inline-theme-color);
        color: var(--text-color);
    }

    a:focus-visible {
        outline: 2px solid var(--inline-theme-color);
        outline-offset: -2px;
    }

    :global(#content.game) nav {
        top: calc(var(--hud-size) + 24px);
        max-height: calc(100dvh - var(--navbar-size) - var(--hud-size) - 48px);
    }
</style>
