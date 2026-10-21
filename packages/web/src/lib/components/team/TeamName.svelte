<script lang="ts">
    export let name: string;
    export let number: number;
    export let numberSize = "0.625em";
</script>

<span class="team-name" style:--number-size={numberSize}>
    <span class="name">{name}</span>
    <span class="number">{number}</span>
</span>

<style>
    .team-name {
        display: flex;
        align-items: baseline;
        gap: var(--md-gap);
        min-width: 0;
    }

    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }

    .number {
        flex: none;
        font-size: var(--number-size);
        font-weight: 400;
    }
</style>
