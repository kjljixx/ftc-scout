<script lang="ts">
    type Column = { label: string; samples: string[]; align?: "left" | "right" };

    export let columns: Column[];
    export let rows = 12;
</script>

<table>
    <thead>
        <tr>
            {#each columns as { label, align }}
                <th class:right={align == "right"}>{label}</th>
            {/each}
        </tr>
    </thead>
    <tbody>
        {#each Array(rows) as _, i}
            <tr>
                {#each columns as { samples, align }}
                    <td class:right={align == "right"}>{samples[i % samples.length]}</td>
                {/each}
            </tr>
        {/each}
    </tbody>
</table>

<style>
    table {
        width: 100%;
        border-collapse: collapse;
    }

    th,
    td {
        padding: var(--md-pad);
        text-align: left;
        white-space: nowrap;
    }

    th {
        font-weight: 600;
    }

    tbody tr {
        border-top: 1px solid var(--sep-color);
    }

    .right {
        text-align: right;
    }
</style>
