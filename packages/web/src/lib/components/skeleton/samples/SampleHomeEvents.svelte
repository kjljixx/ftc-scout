<script lang="ts">
    const EVENTS = [
        ["Northern Virginia League Meet 1", "Fairfax, VA, USA"],
        ["Greater Pittsburgh Qualifier", "Pittsburgh, PA, USA"],
        ["Silicon Valley Super Qualifier", "San Jose, CA, USA"],
        ["Ontario Provincial Championship", "Toronto, ON, Canada"],
        ["Houston West League Meet 3", "Houston, TX, USA"],
    ];
</script>

<ul>
    {#each EVENTS as [name, location]}
        <li>
            <span class="name">{name}</span>
            <em class="loc">{location}</em>
        </li>
    {/each}
</ul>

<style>
    ul {
        list-style: none;
    }

    li {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        padding: var(--md-pad);
    }

    .loc {
        color: var(--secondary-text-color);
    }
</style>
