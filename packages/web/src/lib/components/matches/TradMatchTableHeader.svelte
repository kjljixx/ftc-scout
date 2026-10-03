<thead>
    <tr>
        <th class="match">Match</th>
        <th class="red">Red Alliance</th>
        <th class="score">Score / Pred</th>
        <th class="blue">Blue Alliance</th>
    </tr>
</thead>

<style>
    thead {
        display: block;
    }

    tr {
        display: grid;
        grid-template-columns: var(--trad-match-cols);
        align-items: center;

        min-height: 40px;
    }

    th {
        display: block;

        font-size: 1em;
        font-weight: 600;
        color: var(--secondary-text-color);
    }

    .match {
        text-align: left;
        padding-left: var(--md-gap);
    }

    .red,
    .blue,
    .score {
        text-align: center;
    }

    @media (max-width: 640px) {
        th {
            font-size: 0.85em;
        }
    }
</style>
