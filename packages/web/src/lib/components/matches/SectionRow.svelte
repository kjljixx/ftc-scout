<script lang="ts">
    export let name: string;
</script>

<tr>
    <td>{name}</td>
</tr>

<style>
    tr {
        display: grid;
        grid-template-columns: var(--trad-match-cols);
        padding: calc(var(--lg-pad) * 2) 0 var(--sm-pad);
    }

    td {
        display: block;
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
