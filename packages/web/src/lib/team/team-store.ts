import { browser } from "$app/environment";
import { get, writable } from "svelte/store";
import { serialize } from "cookie";
import { HOME_TEAM_COOKIE_AGE, HOME_TEAM_COOKIE_NAME } from "$lib/constants";

const STORAGE_KEY = "ftc-scout:team";

export type JoinedTeam = { token: string; teamNumber: number; name: string };

function storedTeam(): JoinedTeam | null {
    if (!browser) return null;
    try {
        let parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (
            typeof parsed?.token == "string" &&
            typeof parsed?.teamNumber == "number" &&
            typeof parsed?.name == "string"
        ) {
            return parsed;
        }
    } catch {}
    return null;
}

export const team = writable<JoinedTeam | null>(storedTeam());
export const teamModal = writable<"create" | "team" | null>(null);

if (browser) {
    console.info(`[team] initial team=${get(team)?.teamNumber ?? "none"}`);
    team.subscribe((t) => {
        if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
        else localStorage.removeItem(STORAGE_KEY);
    });
    window.addEventListener("storage", (e) => {
        if (e.key == STORAGE_KEY) team.set(storedTeam());
    });
}

export function getTeamToken(): string | null {
    return get(team)?.token ?? null;
}

export function forgetTeam(reason: string) {
    if (!get(team)) return;
    console.info(`[team] forgetting team ${get(team)?.teamNumber}: ${reason}`);
    team.set(null);
}

export function setHomeTeamCookie(teamNumber: number) {
    document.cookie = serialize(HOME_TEAM_COOKIE_NAME, String(teamNumber), {
        path: "/",
        maxAge: HOME_TEAM_COOKIE_AGE,
    });
}
