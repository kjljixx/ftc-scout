<script lang="ts">
    import { onMount } from "svelte";

    let header: HTMLElement;
    let stuck = false;

    onMount(() => {
        const content = document.getElementById("content");
        if (!content) return;
        const update = () => {
            stuck = header.getBoundingClientRect().top <= content.getBoundingClientRect().top;
        };
        update();
        content.addEventListener("scroll", update, { passive: true });
        return () => content.removeEventListener("scroll", update);
    });

    function scrollToTop() {
        document.getElementById("content")?.scrollTo({ top: 0, behavior: "smooth" });
    }
</script>

<thead bind:this={header} class:stuck>
    <tr
        role="button"
        tabindex="0"
        on:click={scrollToTop}
        on:keydown={(e) => e.key == "Enter" && scrollToTop()}
    >
        <th class="match">Match</th>
        <th class="red">Red Alliance</th>
        <th class="score">Score / Pred</th>
        <th class="blue">Blue Alliance</th>
    </tr>
</thead>

<style>
    thead {
        display: block;

        position: sticky;
        top: calc(var(--md-pad) * -1);
        z-index: 3;

        background: var(--raised-bg-color);
        border-radius: 8px;
        box-shadow:
            0 4px 12px rgba(0, 0, 0, 0.35),
            0 1px 2px rgba(0, 0, 0, 0.3);
    }

    thead.stuck {
        border-radius: 0 0 8px 8px;
    }

    tr {
        display: grid;
        grid-template-columns: var(--trad-match-cols);
        align-items: center;

        min-height: 40px;

        cursor: pointer;
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
