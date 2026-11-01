<script lang="ts">
    import MatchTable from "$lib/components/matches/MatchTable.svelte";
    import { SAMPLE_MATCH_EVENT, sampleMatches } from "../sampleMatches";

    const matches = sampleMatches(1);
</script>

<MatchTable {matches} event={SAMPLE_MATCH_EVENT} showNonPenaltyScores showHeartLegend={false} />
