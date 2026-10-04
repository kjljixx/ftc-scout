<script lang="ts" context="module">
    export const TEAM_CLICK_ACTION_CTX = {};
    export const SHOW_REMOTE_FOCUS_CTX = {};
</script>

<script lang="ts">
    import { CURRENT_SEASON } from "@ftc-scout/common";
    import { Alliance, type FullMatchFragment } from "../../graphql/generated/graphql-operations";
    import { getContext } from "svelte";
    import { browser } from "$app/environment";

    export let team: FullMatchFragment["teams"][number];
    export let eventCode: string;
    export let season: number;
    export let focusedTeam: number | null;
    export let winner: boolean;
    export let span: number;
    export let trad = false;
    export let benched = false;
    export let compact = false;
    export let tinted = false;

    $: number = team.team.number;
    $: name = team.team.name;

    $: surrogate = team.surrogate;
    $: dq = team.dq;
    $: noShow = team.noShow;
    $: onField = team.onField;

    $: showRemoteFocus = getContext<boolean>(SHOW_REMOTE_FOCUS_CTX) ?? true;

    $: title =
        `${number} ${name}` +
        (noShow ? " (No Show)" : "") +
        (dq && !noShow ? " (Disqualified)" : "") +
        (!onField && !dq && !noShow ? " (Not on Field)" : "") +
        (surrogate ? " (Surrogate)" : "");

    let clickAction = getContext(TEAM_CLICK_ACTION_CTX) as
        | ((num: number, name: string) => void)
        | undefined;
</script>

<td
    style:--span={span}
    class:red={team.alliance == Alliance.Red}
    class:blue={team.alliance == Alliance.Blue}
    class:solo={team.alliance == Alliance.Solo}
    class:not-on-field={!onField}
    class:focused={focusedTeam == number && (showRemoteFocus || team.alliance != Alliance.Solo)}
    class:winner
    class:trad
    class:benched
    class:compact
    class:tinted
    {title}
>
    <a
        class="inner"
        href="/teams/{number}{season == CURRENT_SEASON ? '' : `?season=${season}`}#{eventCode}"
        role={browser && clickAction ? "button" : "link"}
        on:click={(e) => {
            if (clickAction) {
                e.preventDefault();
                clickAction(number, name);
            }
        }}
    >
        <span class="num" class:dq={dq || noShow}>{number}{surrogate ? "*" : ""}</span>
        <em class="name">{name}</em>
    </a>
</td>

<style>
    td {
        grid-column: span var(--span);
        display: block;

        height: 100%;

        outline: transparent solid 2px;
        transition: outline 0.12s ease 0s;
    }

    .inner {
        display: flex;
        flex-direction: column;
        align-items: flex-start;

        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        padding: var(--sm-pad) var(--md-pad);

        cursor: pointer;

        color: inherit;
        text-decoration: none;

        height: 100%;
    }

    :global(.hearts) + td .inner {
        padding-left: var(--sm-gap);
    }

    .red {
        background: var(--red-team-bg-color);
    }
    .blue {
        background: var(--blue-team-bg-color);
    }

    td:hover {
        z-index: 1;
    }
    .red:hover {
        outline: 2px solid var(--red-team-color);
    }
    .blue:hover {
        outline: 2px solid var(--blue-team-color);
    }
    .solo:hover {
        outline: 2px solid var(--neutral-team-color);
    }

    .focused.red {
        background: var(--red-team-focus-bg-color);
        color: var(--team-text-color);
    }
    .focused.blue {
        background: var(--blue-team-focus-bg-color);
        color: var(--team-text-color);
    }
    .focused.solo {
        background: var(--neutral-team-color);
        color: var(--team-text-color);
    }

    .winner {
        font-weight: 600;
    }

    .not-on-field {
        color: var(--grayed-out-text-color);
    }
    .dq {
        text-decoration: line-through;
    }

    td.trad {
        grid-column: auto;
        border-radius: 6px;
        font-weight: 500;
    }

    td.trad.red,
    td.trad.blue,
    td.trad.focused.red,
    td.trad.focused.blue {
        background: transparent;
        color: inherit;
    }

    td.trad .inner {
        border-radius: 6px;
        padding: var(--md-pad) var(--lg-pad);
    }

    td.trad .name {
        order: -1;
        font-style: normal;
        font-size: 1.05em;
        font-weight: 500;
        color: inherit;
    }

    td.trad .num {
        font-size: 0.85em;
        font-weight: 400;
        color: var(--grayed-out-text-color);
    }

    td.trad.tinted .name {
        color: var(--alliance-text-color);
    }

    td.trad.compact .inner {
        padding: var(--compact-pad-y, 2px) var(--md-pad);
    }

    td.trad.focused .inner {
        box-shadow: inset 0 0 0 2px var(--focused-team-ring-color);
    }

    td.trad.focused .name {
        font-weight: 600;
    }

    td.benched .inner {
        flex-direction: row;
        align-items: baseline;
        gap: var(--md-gap);
        padding: var(--sm-pad) var(--lg-pad);
        font-size: 0.85em;
        color: var(--faint-text-color);
    }

    td.trad.benched .name,
    td.trad.benched .num {
        font-size: inherit;
        font-weight: 500;
        color: inherit;
    }

    td.trad.benched .name {
        order: -1;
    }

    td.trad.benched .num {
        order: 0;
        font-weight: 400;
    }

    @media (max-width: 1000px) {
        td:not(.trad) .name {
            display: none;
        }

        td:not(.trad) .inner {
            align-items: center;
            justify-content: center;
        }
    }

    @media (max-width: 640px) {
        td.trad .name {
            font-size: 1.15em;
            order: 0;
            min-width: 0;
            overflow: hidden;
            text-overflow: clip;
        }

        td.trad .num {
            font-size: 0.85em;
            font-weight: 400;
            color: var(--grayed-out-text-color);
        }

        td.trad .inner {
            padding: 2px var(--md-pad);
            text-overflow: clip;
            flex-direction: row;
            align-items: baseline;
            justify-content: flex-start;
            gap: var(--sm-gap);
        }
    }

    @media (max-width: 640px) {
        td.trad.compact .name {
            order: -1;
            font-size: 1.15em;
            text-overflow: ellipsis;
        }

        td.trad.compact .inner {
            flex-direction: column;
            align-items: flex-start;
            gap: 0;
            text-overflow: ellipsis;
        }
    }
</style>
