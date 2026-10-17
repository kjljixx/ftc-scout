import { browser } from "$app/environment";
import { PUBLIC_SERVER_ORIGIN } from "$env/static/public";
import { CURRENT_SEASON } from "@ftc-scout/common";
import { derived, get, readable, writable } from "svelte/store";
import { IS_DEV } from "../constants";

export type GameMode = "regional" | "global" | "custom";

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
    eventCode?: string;
} & (
  | { kind?: "match"; match: string; relation: "Partners" | "Opponents" | null }
  | { kind: "radar"; match?: never; relation?: never }
);

export type LifelineId = "radar" | "crosshair" | "beacon";
export type LifelineDetail = { event?: GameEvent; team?: { number: number; name: string } };
export type SabotageMark = {
  kind: "sniper" | "disorient" | "spy";
  type: "cast" | "trigger";
  team?: { number: number; name: string };
  event?: { season: number; code: string; name: string };
};
export type PathStop = {
  number: number;
  name: string;
  hop?: Hop | undefined;
  lifelines?: LifelineId[];
  lifelineDetails?: Partial<Record<LifelineId, LifelineDetail>>;
  sabotages?: SabotageMark[];
};

export type BestRoute = { hops: number; path: PathStop[] };

export type GameEvent = { season: number; code: string; name: string };
export type CrosshairHint = { from: number; event: GameEvent };
export type BeaconHint = { from: number; team: { number: number; name: string }; reached?: boolean };
export type BeaconResponse =
  | { alreadyAdjacent: true; team: null }
  | { alreadyAdjacent: false; team: { number: number; name: string } };
export type Lifelines = {
  radar: boolean;
  crosshair: CrosshairHint | null;
  beacon: BeaconHint | null;
};
export type RadarVisit = {
  event: GameEvent;
  sourceTeam: number;
  returnUrl: string;
  roster: number[] | null;
};
export type GamePageContext = { number: number; url: string; events: GameEvent[] };

function createLifelines(): Lifelines {
  return { radar: false, crosshair: null, beacon: null };
}

function markLifelineUsed(path: PathStop[], lifeline: LifelineId, index = path.length - 1, detail?: LifelineDetail): PathStop[] {
  return path.map((stop, stopIndex) => stopIndex !== index ? stop : {
    ...stop,
    lifelines: stop.lifelines?.includes(lifeline) ? stop.lifelines : [...(stop.lifelines ?? []), lifeline],
    ...(detail ? { lifelineDetails: { ...stop.lifelineDetails, [lifeline]: detail } } : {}),
  });
}

function restoredDetail(path: PathStop[], lifeline: LifelineId, index: number, lifelines: Lifelines): LifelineDetail | undefined {
  if (lifeline === "crosshair") return lifelines.crosshair ? { event: lifelines.crosshair.event } : undefined;
  if (lifeline === "beacon") return lifelines.beacon ? { team: lifelines.beacon.team } : undefined;
  const hop = path[index + 1]?.hop;
  return hop?.kind === "radar" && hop.eventCode
    ? { event: { season: hop.season, code: hop.eventCode, name: hop.eventName } }
    : undefined;
}

function restoreLifelineMarkers(path: PathStop[], lifelines: Lifelines): PathStop[] {
  for (const lifeline of ["radar", "crosshair", "beacon"] as const) {
    if (!lifelines[lifeline]) continue;
    const marked = path.findIndex((stop) => stop.lifelines?.includes(lifeline));
    if (marked >= 0 && path[marked].lifelineDetails?.[lifeline]) continue;
    let index = marked;
    if (index < 0) {
      if (lifeline === "radar") {
        const hopIndex = path.findIndex((stop) => stop.hop?.kind === "radar");
        if (hopIndex > 0) index = hopIndex - 1;
      } else {
        const matches = path.flatMap((stop, stopIndex) => stop.number === lifelines[lifeline]?.from ? [stopIndex] : []);
        if (matches.length === 1) index = matches[0];
      }
    }
    if (index >= 0) path = markLifelineUsed(path, lifeline, index, restoredDetail(path, lifeline, index, lifelines));
    else console.warn(`[game] saved ${lifeline} use has no exact route position; showing summary icon only`);
  }
  return path;
}

export type GameState = {
  runId: string | null;
  lifelines: Lifelines;
  radarVisit: RadarVisit | null;
    status: "idle" | "playing" | "won" | "gaveUp";
    pair: GamePair | null;
    path: PathStop[];
    best: BestRoute | null;
    startedAt: number | null;
    elapsedMs: number | null;
    currentUrl: string | null;
    pendingHop: { number: number; hop: Hop } | null;
};

export const RADAR_REACH = 10;
const STORAGE_KEY = "ftc-scout:speedrun";
const TOAST_MS = 2500;
export const SERVER_ORIGIN = PUBLIC_SERVER_ORIGIN.startsWith("http")
    ? PUBLIC_SERVER_ORIGIN
    : `http${IS_DEV ? "" : "s"}://${PUBLIC_SERVER_ORIGIN}`;

const IDLE: GameState = {
  runId: null,
  lifelines: createLifelines(),
  radarVisit: null,
    status: "idle",
    pair: null,
    path: [],
    best: null,
    startedAt: null,
    elapsedMs: null,
    currentUrl: null,
    pendingHop: null,
};

function load(): GameState {
    if (!browser) return IDLE;
    try {
        let saved = sessionStorage.getItem(STORAGE_KEY);
        if (!saved) return IDLE;
        const parsed = JSON.parse(saved) as Partial<GameState>;
        const lifelines = { ...createLifelines(), ...parsed.lifelines };
        return {
          ...IDLE,
          ...parsed,
          runId: parsed.runId ?? crypto.randomUUID(),
          lifelines,
          path: restoreLifelineMarkers(parsed.path ?? [], lifelines),
          radarVisit: parsed.radarVisit ?? null,
        };
    } catch (e) {
        console.error("[game] could not read saved game, starting fresh:", e);
        return IDLE;
    }
}

export const game = writable<GameState>(load());
export const gamePageContext = writable<GamePageContext | null>(null);
export const lifelinePending = writable<"crosshair" | "beacon" | null>(null);
let hintRequest = 0;

if (browser) {
    game.subscribe((g) => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(g));
      } catch (error) {
        console.error("[game] could not save game", error);
      }
    });
}

export const gameActive = derived(game, (g) => g.status == "playing");
export const radarReach = derived(game, (state) =>
  state.status === "playing" && state.radarVisit ? state.radarVisit.roster ?? [] : null
);
export const beaconTeam = derived(game, (state) =>
  state.status === "playing" && !state.lifelines.beacon?.reached
    ? state.lifelines.beacon?.team.number ?? null
    : null
);

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

export async function fetchPair(mode: Exclude<GameMode, "custom">, steps: number): Promise<GamePair> {
    let params = new URLSearchParams({ mode, steps: "" + steps });
    let res = await fetch(`${SERVER_ORIGIN}/rest/v1/game/pair?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let pair: GamePair = await res.json();
    console.info(
        `[game] pair mode=${pair.mode} ${pair.start.number} -> ${pair.destination.number} steps=${pair.steps}`
    );
    return pair;
}

export async function fetchCustomPair(from: number, to: number, signal?: AbortSignal): Promise<GamePair> {
  const params = new URLSearchParams({ mode: "custom", from: String(from), to: String(to) });
  const response = await fetch(`${SERVER_ORIGIN}/rest/v1/game/pair?${params}`, { signal: signal ?? null });
  if (!response.ok) {
    const message = response.status < 500 ? await response.text() : "Could not check these teams. Try again.";
    throw new Error(message);
  }
  const pair: GamePair = await response.json();
  console.info(`[game] custom pair ${pair.start.number} -> ${pair.destination.number} validated=true`);
  return pair;
}

type BestRouteResponse = {
    hops: number;
    path: { number: number; name: string; hop: Hop | null }[];
};

export async function fetchBestRoute(pair: GamePair): Promise<BestRoute> {
    let params = new URLSearchParams({
        from: "" + pair.start.number,
        to: "" + pair.destination.number,
    });
    let res = await fetch(`${SERVER_ORIGIN}/rest/v1/game/solve?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let route: BestRouteResponse = await res.json();
    console.info(
        `[game] best route ${pair.start.number} -> ${pair.destination.number} hops=${route.hops}`
    );
    return {
        hops: route.hops,
        path: route.path.map((s) => ({ number: s.number, name: s.name, hop: s.hop ?? undefined })),
    };
}

export function setBestRoute(pair: GamePair, best: BestRoute) {
    game.update((g) => {
        let sameGame =
            g.pair?.start.number == pair.start.number &&
            g.pair?.destination.number == pair.destination.number;
        if (g.status == "idle" || g.status == "playing" || !sameGame) {
            console.warn(
                `[game] dropped best route for ${pair.start.number} -> ${pair.destination.number}`
            );
            return g;
        }
        return { ...g, best };
    });
}

export function teamUrl(number: number, season?: number | null): string {
    return `/teams/${number}?season=${season || CURRENT_SEASON}`;
}

export function startUrl(pair: GamePair): string {
    let latest = Math.max(...pair.start.seasons, 0);
    return teamUrl(pair.start.number, latest || null);
}

export function isRadarEvent(pathname: string, state = get(game)): boolean {
  const visit = state.radarVisit;
  if (!visit) return false;
  const match = /^\/events\/(\d+)\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  return !!match && match[3] === "rankings" && +match[1] === visit.event.season && match[2] === encodeURIComponent(visit.event.code);
}

export function isAllowedPath(pathname: string, state = get(game)): boolean {
  if (/^\/speedrun\/?$/.test(pathname)) return true;
  const team = /^\/teams\/(\d+)\/?$/.exec(pathname);
  if (team) {
    return !state.radarVisit || +team[1] === state.radarVisit.sourceTeam ||
      !!state.radarVisit.roster?.includes(+team[1]);
  }
  return isRadarEvent(pathname, state);
}

export function startGame(pair: GamePair) {
    hintRequest++;
    lifelinePending.set(null);
    gamePageContext.set(null);
    game.set({
      runId: crypto.randomUUID(),
      lifelines: createLifelines(),
      radarVisit: null,
        status: "playing",
        pair,
        path: [{ number: pair.start.number, name: pair.start.name }],
        best: null,
        startedAt: Date.now(),
        elapsedMs: null,
        currentUrl: startUrl(pair),
        pendingHop: null,
    });
    console.info(`[game] started ${pair.start.number} -> ${pair.destination.number} lifelines=Radar,Crosshair,Beacon usesEach=1 radarHops=1 radarReach=top${RADAR_REACH} hintScope=all-seasons`);
}

export function visitTeam(number: number, name: string, url: string) {
    game.update((g) => {
        if (g.status != "playing" || !g.pair) return g;
        const destination = g.pair.destination.number;
        if (g.radarVisit && number !== g.radarVisit.sourceTeam && !g.radarVisit.roster?.includes(number)) {
          console.warn(`[game] rejected Radar hop to team=${number} outside selected roster`);
          return g;
        }
        const beacon = g.lifelines.beacon;
        if (beacon && !beacon.reached && number === beacon.team.number) {
          g = { ...g, lifelines: { ...g.lifelines, beacon: { ...beacon, reached: true } } };
          console.info(`[game] Beacon reached team=${number}; highlights cleared`);
        }
        if (g.path[g.path.length - 1]?.number == number) {
          if (g.currentUrl === url && !g.radarVisit && !g.pendingHop) return g;
          return { ...g, currentUrl: url, radarVisit: null, pendingHop: null };
        }
        let hop: Hop | undefined = g.radarVisit ? {
          kind: "radar",
          eventName: g.radarVisit.event.name,
          eventCode: g.radarVisit.event.code,
          season: g.radarVisit.event.season,
        } : g.pendingHop?.number == number ? g.pendingHop.hop : undefined;
        let path = [...g.path, { number, name, hop }];
        if (number != destination) {
            console.info(`[game] visited ${number}, hops=${path.length - 1}, ${describeHop(hop)}`);
            return { ...g, path, currentUrl: url, pendingHop: null, radarVisit: null };
        }
        let elapsedMs = Date.now() - (g.startedAt ?? Date.now());
        console.info(`[game] won hops=${path.length - 1} elapsedMs=${elapsedMs}`);
        return { ...g, status: "won", path, elapsedMs, currentUrl: url, pendingHop: null, radarVisit: null };
    });
}

export function disorientTo(number: number, name: string): boolean {
    let moved = false;
    game.update((g) => {
        if (g.status != "playing" || g.path[g.path.length - 1]?.number == number) return g;
        moved = true;
        console.info(`[game] disoriented ${g.path[g.path.length - 1]?.number} -> ${number}, hops=${g.path.length}`);
        return { ...g, path: [...g.path, { number, name }], currentUrl: teamUrl(number), radarVisit: null, pendingHop: null };
    });
    return moved;
}

export function winAt(stop: PathStop) {
    game.update((g) => {
        if (g.status != "playing") return g;
        const path = g.path[g.path.length - 1]?.number == stop.number ? g.path : [...g.path, stop];
        const elapsedMs = Date.now() - (g.startedAt ?? Date.now());
        console.info(`[game] won at server confirmation hops=${path.length - 1} elapsedMs=${elapsedMs}`);
        return { ...g, status: "won", path, elapsedMs, pendingHop: null, radarVisit: null };
    });
}

export function giveUp() {
    hintRequest++;
    lifelinePending.set(null);
    game.update((g) => {
        if (g.status != "playing") return g;
        let elapsedMs = Date.now() - (g.startedAt ?? Date.now());
        console.info(`[game] gave up hops=${g.path.length - 1} elapsedMs=${elapsedMs}`);
        return { ...g, status: "gaveUp", elapsedMs, pendingHop: null, radarVisit: null };
    });
}

function describeHop(hop: Hop | undefined): string {
    if (!hop) return "no hop details";
    if (hop.kind === "radar") return `via Radar ${hop.eventName} ${hop.season}`;
    return `via ${hop.eventName} ${hop.season} ${hop.match} ${hop.relation ?? "solo"}`;
}

export function setPendingHop(number: number, hop: Hop) {
    game.update((g) => ({ ...g, pendingHop: { number, hop } }));
}

export function resetGame() {
    hintRequest++;
    lifelinePending.set(null);
    gamePageContext.set(null);
    let g = get(game);
    console.info(`[game] reset from status=${g.status}`);
    game.set({ ...IDLE, lifelines: createLifelines() });
}

export function setGamePageContext(context: GamePageContext | null) {
  gamePageContext.set(context);
}

export function beginRadar(event: GameEvent): string | null {
  const state = get(game);
  const context = get(gamePageContext);
  if (state.status !== "playing" || state.lifelines.radar || state.radarVisit || get(lifelinePending) ||
      !context || context.number !== state.path[state.path.length - 1]?.number ||
      !context.events.some((candidate) => candidate.season === event.season && candidate.code === event.code)) {
    console.warn("[game] rejected unavailable Radar activation");
    return null;
  }
  const url = `/events/${event.season}/${encodeURIComponent(event.code)}/rankings`;
  game.update((current) => ({
    ...current,
    pendingHop: null,
    currentUrl: url,
    radarVisit: { event, sourceTeam: context.number, returnUrl: context.url, roster: null },
  }));
  console.info(`[game] Radar opening event=${event.season}/${event.code} source=${context.number}`);
  return url;
}

export function confirmRadarVisit(event: GameEvent, roster: number[], url: string) {
  game.update((state) => {
    const visit = state.radarVisit;
    if (state.status !== "playing" || !visit || visit.event.season !== event.season || visit.event.code !== event.code) return state;
    if (visit.roster && state.currentUrl === url) return state;
    if (!visit.roster) console.info(`[game] Radar used event=${event.season}/${event.code} roster=${roster.length}`);
    return {
      ...state,
      currentUrl: url,
      path: state.lifelines.radar ? state.path : markLifelineUsed(state.path, "radar", state.path.length - 1, { event }),
      lifelines: { ...state.lifelines, radar: true },
      radarVisit: { ...visit, roster: visit.roster ?? roster },
    };
  });
}

export function endRadar(): string | null {
  const state = get(game);
  if (!state.radarVisit) return null;
  const url = state.radarVisit.returnUrl;
  game.update((current) => ({ ...current, radarVisit: null, currentUrl: url, pendingHop: null }));
  console.info(`[game] Radar closed spent=${state.lifelines.radar}`);
  return url;
}

async function fetchHint<Result>(kind: "crosshair" | "beacon", from: number, to: number): Promise<Result> {
  const params = new URLSearchParams({ from: String(from), to: String(to) });
  const response = await fetch(`${SERVER_ORIGIN}/rest/v1/game/${kind}?${params}`);
  if (!response.ok) {
    const message = response.status === 404 ? "No route found from this team." : `Could not load ${kind === "crosshair" ? "Crosshair" : "Beacon"}. Try again.`;
    throw new Error(message);
  }
  return response.json();
}

export function fetchBestNextEvent(from: number, to: number): Promise<GameEvent> {
  return fetchHint<GameEvent>("crosshair", from, to);
}

export function fetchBeacon(from: number, to: number): Promise<BeaconResponse> {
  return fetchHint<BeaconResponse>("beacon", from, to);
}

export async function requestLifeline(kind: "crosshair" | "beacon"): Promise<boolean> {
  const state = get(game);
  const context = get(gamePageContext);
  const from = state.path[state.path.length - 1]?.number;
  if (state.status !== "playing" || !state.pair || state.radarVisit || !context || from == null ||
      context.number !== from || state.lifelines[kind] || get(lifelinePending)) return false;
  const request = ++hintRequest;
  lifelinePending.set(kind);
  try {
    const result = kind === "crosshair"
      ? await fetchBestNextEvent(from, state.pair.destination.number)
      : await fetchBeacon(from, state.pair.destination.number);
    const current = get(game);
    if (request !== hintRequest || current.runId !== state.runId || current.status !== "playing" ||
        current.radarVisit || get(gamePageContext)?.number !== from || current.path.length !== state.path.length ||
        current.path[current.path.length - 1]?.number !== from) {
      console.warn(`[game] dropped stale ${kind} hint from=${from}`);
      return false;
    }
    if (kind === "beacon" && "alreadyAdjacent" in result && result.alreadyAdjacent) {
      showToast("You already have a direct connection to the destination. Beacon is still available.");
      console.info(`[game] Beacon not spent: already adjacent from=${from}`);
      return false;
    }
    const clue = kind === "crosshair"
      ? { from, event: result as GameEvent }
      : { from, team: (result as Extract<BeaconResponse, { alreadyAdjacent: false }>).team };
    game.update((currentState) => ({
      ...currentState,
      path: markLifelineUsed(currentState.path, kind, currentState.path.length - 1, "event" in clue ? { event: clue.event } : { team: clue.team }),
      lifelines: { ...currentState.lifelines, [kind]: clue },
    }));
    console.info(`[game] ${kind} used from=${from} destination=${state.pair.destination.number}`);
    return true;
  } catch (error) {
    console.error(`[game] ${kind} failed from=${from}`, error);
    if (request === hintRequest && get(game).runId === state.runId) {
      showToast(error instanceof Error ? error.message : "Could not load this lifeline. Try again.");
    }
    return false;
  } finally {
    if (request === hintRequest) lifelinePending.set(null);
  }
}

export function blockedNavigation(pathname: string) {
    console.info(`[game] blocked navigation to ${pathname}`);
    showToast("Event pages are locked");
}

export function blockedShortcut(name: string) {
    console.info(`[game] blocked ${name} shortcut`);
    showToast(`${name[0].toUpperCase()}${name.slice(1)} is disabled during a run`);
}

export function formatClock(ms: number): string {
    let total = Math.max(0, Math.floor(ms / 1000));
    let seconds = `${total % 60}`.padStart(2, "0");
    return `${Math.floor(total / 60)}:${seconds}`;
}
