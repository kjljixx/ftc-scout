<script lang="ts">
    import Card from "$lib/components/Card.svelte";
</script>

<Card vis={false} style="margin-bottom: 0">
    <h2 class="section-title">Events</h2>
</Card>

<style>
    @media (max-width: 550px) {
        .section-title {
            padding-left: var(--md-pad);
        }
    }

    .section-title {
        margin: var(--sm-gap) 0 0;
        font-size: calc(var(--lg-font-size) * 1.4);
        font-weight: 600;
    }
</style>
