<script lang="ts">
    import { browser } from "$app/environment";
    import { faCopy } from "@fortawesome/free-solid-svg-icons";
    import * as QRCode from "qrcode";
    import Fa from "svelte-fa";

    export let token: string;

    const qrOptions: QRCode.QRCodeToStringOptions = {
        type: "svg",
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
    };

    let qrSvg = "";
    let copied = false;

    $: url = browser ? `${location.origin}/join/${token}` : "";
    $: if (url) {
        QRCode.toString(url, qrOptions)
            .then((svg) => (qrSvg = svg))
            .catch((error) => console.error("[team] qr code failed", error));
    }

    async function copy() {
        await navigator.clipboard.writeText(url);
        copied = true;
        setTimeout(() => (copied = false), 1500);
    }
</script>

<div class="share">
    <div class="qr">{@html qrSvg}</div>
    <div class="link">
        <input readonly value={url} on:focus={(e) => e.currentTarget.select()} />
        <button on:click={copy}>
            <Fa icon={faCopy} />
            {copied ? "Copied" : "Copy"}
        </button>
    </div>
</div>

<style>
    .share {
        display: flex;
        flex-direction: column;
        gap: var(--lg-gap);
        width: 460px;
        max-width: 100%;
    }

    .qr {
        width: min(240px, 100%);
        aspect-ratio: 1;
        margin: 0 auto;
        border-radius: 8px;
        overflow: hidden;
        background: white;
    }

    .qr :global(svg) {
        display: block;
        width: 100%;
        height: 100%;
    }

    .link {
        display: flex;
        gap: var(--md-gap);
    }

    input {
        flex: 1;
        min-width: 0;
    }

    button {
        display: flex;
        align-items: center;
        gap: var(--md-gap);
        border: none;
        border-radius: 8px;
        padding: var(--md-pad) var(--lg-pad);
        background: var(--raised-bg-color);
        color: var(--text-color);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }
</style>
