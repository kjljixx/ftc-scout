<script lang="ts">
    import { fly } from "svelte/transition";

    export let position: "top-right" | "bottom-center";
    export let href: string | null = null;

    const flyParams =
        position == "top-right" ? { x: 100, duration: 200 } : { y: 40, duration: 200 };
</script>

<svelte:element
    this={href ? "a" : "div"}
    class="toast {position}"
    {href}
    {...$$restProps}
    transition:fly|global={flyParams}
>
    <slot />
</svelte:element>

<style>
    .toast {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--md-gap) var(--vl-gap);
        text-decoration: none;

        position: fixed;
        box-sizing: border-box;
        z-index: var(--toast-zi);

        background: var(--raised-bg-color);
        color: var(--text-color);
        border-radius: 12px;
        box-shadow: inset 0 0 0 2px var(--focused-team-ring-color), 0 16px 32px rgba(0, 0, 0, 0.45),
            0 2px 6px rgba(0, 0, 0, 0.4);
    }

    .top-right {
        top: calc(var(--navbar-size) + var(--md-gap));
        right: var(--md-gap);
        width: min(340px, calc(100% - var(--md-gap) * 2));
        padding: var(--lg-pad) calc(var(--vl-gap) + var(--md-font-size)) var(--lg-pad)
            var(--vl-gap);
    }

    .bottom-center {
        bottom: var(--vl-gap);
        left: 50%;
        transform: translateX(-50%);
        max-width: calc(100vw - 24px);
        padding: var(--md-pad) var(--vl-gap);
        text-align: center;
    }

    @media (max-width: 600px) {
        .top-right {
            padding: var(--lg-pad) calc(var(--lg-pad) + var(--md-font-size)) var(--lg-pad)
                var(--lg-pad);
        }
    }
</style>
