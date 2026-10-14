import { browser } from "$app/environment";
import { PUBLIC_SERVER_ORIGIN } from "$env/static/public";
import { CURRENT_SEASON } from "@ftc-scout/common";
import { derived, get, readable, writable } from "svelte/store";
import { IS_DEV } from "../constants";

export type GameMode = "regional" | "global";

export type GameTeam = {
    number: number;
    name: string;
    city: string;
    state: string;
    country: string;
    seasons: number[];
};

export type GamePair = {
    mode: GameMode;
    steps: number | null;
    start: GameTeam;
    destination: GameTeam;
};

export type Hop = {
    eventName: string;
    season: number;
    match: string;
    relation: "Partners" | "Opponents" | null;
};

export type PathStop = { number: number; name: string; hop?: Hop | undefined };

export type GameState = {
    status: "idle" | "playing" | "won";
    pair: GamePair | null;
    path: PathStop[];
    startedAt: number | null;
    elapsedMs: number | null;
    currentUrl: string | null;
    pendingHop: { number: number; hop: Hop } | null;
};

const STORAGE_KEY = "ftc-scout:speedrun";
const TOAST_MS = 2500;
const SERVER_ORIGIN = PUBLIC_SERVER_ORIGIN.startsWith("http")
    ? PUBLIC_SERVER_ORIGIN
    : `http${IS_DEV ? "" : "s"}://${PUBLIC_SERVER_ORIGIN}`;

const IDLE: GameState = {
    status: "idle",
    pair: null,
    path: [],
    startedAt: null,
    elapsedMs: null,
    currentUrl: null,
    pendingHop: null,
};

function load(): GameState {
    if (!browser) return IDLE;
    try {
        let saved = sessionStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : IDLE;
    } catch (e) {
        console.error("[game] could not read saved game, starting fresh:", e);
        return IDLE;
    }
}

export const game = writable<GameState>(load());

if (browser) {
    game.subscribe((g) => sessionStorage.setItem(STORAGE_KEY, JSON.stringify(g)));
}

export const gameActive = derived(game, (g) => g.status == "playing");

export const clock = readable(Date.now(), (set) => {
    let id = setInterval(() => set(Date.now()), 1000);
    return () => clearInterval(id);
});

export const toast = writable<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string) {
    toast.set(message);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.set(null), TOAST_MS);
}

export async function fetchPair(mode: GameMode, steps: number): Promise<GamePair> {
    let params = new URLSearchParams({ mode, steps: "" + steps });
    let res = await fetch(`${SERVER_ORIGIN}/rest/v1/game/pair?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let pair: GamePair = await res.json();
    console.info(
        `[game] pair mode=${pair.mode} ${pair.start.number} -> ${pair.destination.number} steps=${pair.steps}`
    );
    return pair;
}

export function teamUrl(number: number, season?: number | null): string {
    let seasonPart = season && season != CURRENT_SEASON ? `?season=${season}` : "";
    return `/teams/${number}${seasonPart}`;
}

export function startUrl(pair: GamePair): string {
    let latest = Math.max(...pair.start.seasons, 0);
    return teamUrl(pair.start.number, latest || null);
}

export function isAllowedPath(pathname: string): boolean {
    return /^\/teams\/\d+\/?$/.test(pathname) || /^\/speedrun\/?$/.test(pathname);
}

export function startGame(pair: GamePair) {
    game.set({
        status: "playing",
        pair,
        path: [{ number: pair.start.number, name: pair.start.name }],
        startedAt: Date.now(),
        elapsedMs: null,
        currentUrl: startUrl(pair),
        pendingHop: null,
    });
    console.info(`[game] started ${pair.start.number} -> ${pair.destination.number}`);
}

export function visitTeam(number: number, name: string, url: string) {
    game.update((g) => {
        if (g.status != "playing" || !g.pair) return g;
        if (g.path[g.path.length - 1]?.number == number) return { ...g, currentUrl: url };
        let hop = g.pendingHop?.number == number ? g.pendingHop.hop : undefined;
        let path = [...g.path, { number, name, hop }];
        if (number != g.pair.destination.number) {
            console.info(`[game] visited ${number}, hops=${path.length - 1}, ${describeHop(hop)}`);
            return { ...g, path, currentUrl: url, pendingHop: null };
        }
        let elapsedMs = Date.now() - (g.startedAt ?? Date.now());
        console.info(`[game] won hops=${path.length - 1} elapsedMs=${elapsedMs}`);
        return { ...g, status: "won", path, elapsedMs, currentUrl: url, pendingHop: null };
    });
}

function describeHop(hop: Hop | undefined): string {
    if (!hop) return "no hop details";
    return `via ${hop.eventName} ${hop.season} ${hop.match} ${hop.relation ?? "solo"}`;
}

export function setPendingHop(number: number, hop: Hop) {
    game.update((g) => ({ ...g, pendingHop: { number, hop } }));
}

export function resetGame() {
    let g = get(game);
    console.info(`[game] reset from status=${g.status}`);
    game.set(IDLE);
}

export function blockedNavigation(pathname: string) {
    console.info(`[game] blocked navigation to ${pathname}`);
    showToast("Event pages are locked");
}

export function formatClock(ms: number): string {
    let total = Math.max(0, Math.floor(ms / 1000));
    let seconds = `${total % 60}`.padStart(2, "0");
    return `${Math.floor(total / 60)}:${seconds}`;
}
