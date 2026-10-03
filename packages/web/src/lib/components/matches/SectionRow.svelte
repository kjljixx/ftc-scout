<script lang="ts">
    export let name: string;
</script>

<tr>
    <td class="name">{name}</td>
    {#if $$slots.default}
        <td class="action"><slot /></td>
    {/if}
</tr>

<style>
    tr {
        display: grid;
        grid-template-columns: var(--trad-match-cols);
        align-items: center;
        padding: calc(var(--lg-pad) * 2) 0 var(--sm-pad);
    }

    td {
        display: block;
    }

    .action {
        grid-column: 4;
        grid-row: 1;
        justify-self: end;
        padding-right: var(--md-pad);
    }

    .name {
        grid-column: 3;
        justify-self: center;
        white-space: nowrap;

        font-size: 1em;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-color);
    }
</style>
