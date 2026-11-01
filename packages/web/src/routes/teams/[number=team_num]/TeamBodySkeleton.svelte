<script lang="ts">
    import QuickStats from "./QuickStats.svelte";
    import TeamEventsHeading from "./TeamEventsHeading.svelte";
    import TeamEventCard from "./TeamEventCard.svelte";
    import { SAMPLE_QUICK_STATS, sampleTeamEvent } from "./sampleTeam";
    import { CURRENT_SEASON } from "@ftc-scout/common";

    const tep = sampleTeamEvent(5);
</script>

<QuickStats stats={SAMPLE_QUICK_STATS} events={[tep]} season={CURRENT_SEASON} />
<TeamEventsHeading />
<TeamEventCard {tep} focusedTeam={null} />
