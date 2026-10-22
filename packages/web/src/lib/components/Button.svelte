<script lang="ts">
    export let variant: "primary" | "secondary" | "danger" = "primary";
    export let href: string | null = null;
    export let type: "button" | "submit" = "button";
    export let disabled = false;
</script>

{#if href}
    <a class="btn {variant}" {href} {...$$restProps} on:click><slot /></a>
{:else}
    <button class="btn {variant}" {type} {disabled} {...$$restProps} on:click><slot /></button>
{/if}

<style>
    .btn {
        display: inline-block;
        border: none;
        border-radius: 8px;
        padding: var(--md-pad) var(--lg-pad);
        font: inherit;
        font-size: calc(var(--md-font-size) * 1.0625);
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
    }

    .btn:disabled {
        opacity: var(--form-disabled-opacity);
        cursor: default;
    }

    .primary {
        background: var(--primary-button-color);
        color: var(--primary-button-text-color);
    }

    .secondary {
        background: var(--raised-bg-color);
        color: var(--text-color);
    }

    .danger {
        background: var(--red-team-color);
        color: white;
    }
</style>
