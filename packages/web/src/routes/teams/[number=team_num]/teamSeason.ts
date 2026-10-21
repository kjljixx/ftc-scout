import type { Writable } from "svelte/store";
import type { Season } from "@ftc-scout/common";

export const TEAM_SEASON_CTX = {};

export type TeamSeasonStore = Writable<Season | "overall">;
