import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { derived, get, writable } from "svelte/store";
import { io, type Socket } from "socket.io-client";
import {
  SERVER_ORIGIN,
  clock,
  fetchPair,
  game,
  giveUp,
  resetGame,
  disorientTo,
  showToast,
  startGame,
  startUrl,
  teamUrl,
  winAt,
  type GamePair,
  type GameState,
  type Hop,
  type PathStop,
} from "./game-store";

export type DuelStatus = "lobby" | "countdown" | "racing" | "done";
export type DuelPlayer = {
  connected: boolean;
  hops: number;
  gaveUp: boolean;
  rematch: boolean;
  left: boolean;
  finishedMs: number | null;
};
export type SabotageId = "sniper" | "disorient" | "spy";
export type OutgoingEffect = { id: number; kind: "sniper"; team?: number; expiresAt: number; hits: number };
export type IncomingEffect = { id: number; kind: SabotageId; expiresAt: number; spent: boolean; team?: number; teamName?: string };
export type DuelMine = { used: Record<SabotageId, boolean>; frozenUntil: number | null; outgoing: OutgoingEffect[]; incoming: IncomingEffect[] };
export type DuelView = {
  code: string;
  status: DuelStatus;
  pair: GamePair;
  serverNow: number;
  receivedAt: number;
  countdownEndsAt: number | null;
  startedAt: number | null;
  winner: number | null;
  reason: "arrived" | "gaveUp" | "disconnected" | null;
  players: DuelPlayer[];
  paths: PathStop[][] | null;
  mine: DuelMine;
};
type ServerView = Omit<DuelView, "receivedAt">;
type Session = { code: string; token: string; you: number };
type Ack = { ok: true; [key: string]: any } | { ok: false; error: string; [key: string]: any };

export const SABOTAGE_NAMES: Record<SabotageId, string> = { sniper: "Sniper", disorient: "Disorient", spy: "Spy" };
export const SABOTAGE_SECONDS = 20;
export const FREEZE_SECONDS = 12;
const NO_SABOTAGES_USED: Record<SabotageId, boolean> = { sniper: false, disorient: false, spy: false };
const STORAGE_KEY = "ftc-scout:duel";
const ACK_TIMEOUT_MS = 8000;
const REMATCH_STEPS = 3;

function loadSession(): Session | null {
  if (!browser) return null;
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
  } catch (e) {
    console.error("[duel] could not read saved duel, starting fresh:", e);
    return null;
  }
}

export const duelSession = writable<Session | null>(loadSession());
export const duelView = writable<DuelView | null>(null);
export const duelMe = derived([duelSession, duelView], ([s, v]) => (s && v ? v.players[s.you] ?? null : null));
export const duelOpponent = derived([duelSession, duelView], ([s, v]) => (s && v ? v.players[1 - s.you] ?? null : null));
export const duelActive = derived(duelView, (v) => !!v && v.status !== "done");

const localExpiry = (view: DuelView, expiresAt: number) => expiresAt - view.serverNow + view.receivedAt;

export const frozenSeconds = derived([duelView, clock], ([v, now]) =>
  v?.mine.frozenUntil ? Math.max(0, Math.ceil((localExpiry(v, v.mine.frozenUntil) - now) / 1000)) : 0
);
export const sabotageUsed = derived(duelView, (v) => v?.mine.used ?? NO_SABOTAGES_USED);
export const activeSabotages = derived([duelView, clock], ([v, now]): SabotageId[] =>
  v ? v.mine.outgoing.filter((e) => localExpiry(v, e.expiresAt) > now).map((e) => e.kind) : []
);
export const blockedTeams = derived([duelView, clock], ([v, now]) =>
  v ? v.mine.incoming.filter((e) => e.kind === "sniper" && e.team !== undefined && localExpiry(v, e.expiresAt) > now).map((e) => e.team!) : []
);

if (browser) {
  duelSession.subscribe((s) => {
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORAGE_KEY);
  });
}

let socket: Socket | null = null;
let duelRunId: string | null = null;
let sentStops = 1;
let sentGiveUp = false;
let sentMarks = "[]";
const expiryTimers = new Map<number, ReturnType<typeof setTimeout>>();
const hitEffects = new Set<number>();

function credentials() {
  const s = get(duelSession);
  return s ? { code: s.code, token: s.token } : null;
}

function request(event: string, ...args: unknown[]): Promise<Ack> {
  return getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck(event, ...args).catch((e) => {
    console.error(`[duel] ${event} got no response:`, e);
    return { ok: false, error: "Could not reach the server. Try again." } as Ack;
  });
}

function getSocket(): Socket {
  if (socket) return socket;
  socket = io(SERVER_ORIGIN, { path: "/socket.io" });
  console.info(`[duel] connecting origin=${SERVER_ORIGIN} session=${get(duelSession)?.code ?? "none"}`);
  socket.on("connect", rejoin);
  socket.on("state", (view: ServerView) => applyView(view));
  socket.on("closed", (reason: string) => {
    if (get(duelView)?.status === "done") return;
    console.info(`[duel] closed reason=${reason}`);
    clearDuel();
    showToast("The duel was closed.");
  });
  return socket;
}

async function rejoin() {
  const creds = credentials();
  if (!creds) return;
  const res = await request("rejoin", creds);
  if (!res.ok) {
    console.info(`[duel] could not rejoin ${creds.code}: ${res.error}`);
    clearDuel();
    return;
  }
  console.info(`[duel] rejoined ${creds.code}`);
  const first = !get(duelView);
  applyView(res.view, first);
  const view = get(duelView)!;
  const me = view.players[res.you];
  if (view.status === "racing") {
    const local = get(game);
    if (local.status === "playing" && local.pair?.start.number === view.pair.start.number) {
      duelRunId = local.runId;
      sentStops = Math.min(sentStops, me.hops + 1);
      sentMarks = "[]";
      syncRun(local);
    } else {
      console.warn("[duel] rejoined a race without a local run; giving up");
      sendGiveUp();
    }
  }
}

function applyView(server: ServerView, quiet = false) {
  if (!get(duelSession)) return;
  const prev = get(duelView);
  const view: DuelView = { ...server, receivedAt: Date.now() };
  duelView.set(view);
  console.info(`[duel] state ${view.code} status=${view.status} hops=${view.players.map((p) => p.hops).join("/")}`);
  if (!quiet && prev) announceSabotages(prev, view);
  if (quiet) return;
  if (view.status === "racing" && prev && prev.status !== "racing" && prev.status !== "done") beginRace(view);
  if (view.status === "done" && prev?.status !== "done") endRace(view);
  if (view.status === "lobby" && prev?.status === "done") startRematchLobby();
}

function announceSabotages(prev: DuelView, view: DuelView) {
  const seenIncoming = new Set(prev.mine.incoming.map((e) => e.id));
  for (const effect of view.mine.incoming) {
    if (seenIncoming.has(effect.id)) continue;
    console.info(`[duel] incoming ${effect.kind} id=${effect.id}`);
    if (effect.kind === "disorient" && effect.team !== undefined && disorientTo(effect.team, effect.teamName ?? `${effect.team}`)) {
      sentStops = get(game).path.length;
      goto(teamUrl(effect.team));
    }
    showToast(effect.kind === "sniper" ? `Opponent set a Sniper · ${SABOTAGE_SECONDS}s` : `Opponent used ${SABOTAGE_NAMES[effect.kind]}`);
  }
  const seenOutgoing = new Map(prev.mine.outgoing.map((e) => [e.id, e.hits]));
  for (const effect of view.mine.outgoing) {
    const before = seenOutgoing.get(effect.id);
    if (before === undefined) {
      const delay = Math.max(0, localExpiry(view, effect.expiresAt) - Date.now());
      expiryTimers.set(effect.id, setTimeout(() => !hitEffects.has(effect.id) && showToast(`${SABOTAGE_NAMES[effect.kind]} expired`), delay));
    } else if (effect.hits > before) {
      hitEffects.add(effect.id);
      console.info(`[duel] ${effect.kind} id=${effect.id} hit hits=${effect.hits}`);
      showToast(`${SABOTAGE_NAMES[effect.kind]} hit`);
    }
  }
}

function startRematchLobby() {
  console.info("[duel] rematch accepted; back to the lobby");
  resetGame();
  duelRunId = null;
  sentStops = 1;
  sentGiveUp = false;
  sentMarks = "[]";
}

function beginRace(view: DuelView) {
  startGame(view.pair);
  duelRunId = get(game).runId;
  sentStops = 1;
  sentGiveUp = false;
  sentMarks = "[]";
  goto(startUrl(view.pair));
}

function endRace(view: DuelView) {
  if (get(game).status !== "playing") return;
  const you = get(duelSession)?.you;
  const arrival = view.winner === you && view.reason === "arrived"
    ? view.paths?.[you!]?.at(-1) ?? view.pair.destination
    : undefined;
  if (arrival) winAt(arrival);
  else giveUp();
  goto("/speedrun");
}

function sendGiveUp() {
  const creds = credentials();
  if (!creds || sentGiveUp) return;
  sentGiveUp = true;
  request("giveUp", creds);
}

function syncRun(g: GameState) {
  const creds = credentials();
  if (!creds || get(duelView)?.status !== "racing" || g.runId !== duelRunId) return;
  while (sentStops < g.path.length) {
    const stop = g.path[sentStops++];
    request("hop", creds, { number: stop.number, name: stop.name, hop: stop.hop }).then((res) => {
      if (!res.ok && res.blocked) {
        console.info(`[duel] hop to ${stop.number} triggered ${res.blocked.kind}`);
        showToast(`Frozen · ${FREEZE_SECONDS}s`);
      } else if (!res.ok && res.error === "Frozen") {
        showToast(`Frozen · ${Math.ceil(res.frozenMs / 1000)}s`);
      } else if (!res.ok) {
        console.error(`[duel] hop to ${stop.number} rejected: ${res.error}`);
        showToast("The server did not accept that hop.");
      }
    });
  }
  const marks = g.path.flatMap((stop, index) =>
    stop.lifelines?.length ? [{ index, lifelines: stop.lifelines, details: stop.lifelineDetails ?? {} }] : []
  );
  const serialized = JSON.stringify(marks);
  if (serialized !== sentMarks) {
    sentMarks = serialized;
    request("lifelines", creds, marks);
  }
  if (g.status === "gaveUp") sendGiveUp();
}

if (browser) game.subscribe(syncRun);

function clearDuel() {
  expiryTimers.forEach((timer) => clearTimeout(timer));
  expiryTimers.clear();
  hitEffects.clear();
  duelSession.set(null);
  duelView.set(null);
  duelRunId = null;
  sentStops = 1;
  sentGiveUp = false;
  sentMarks = "[]";
}

async function enter(event: "create" | "join", payload: unknown): Promise<boolean> {
  const res = await request(event, payload);
  if (!res.ok) {
    showToast(res.error);
    return false;
  }
  console.info(`[duel] ${event} ok code=${res.code} you=${res.you}`);
  duelSession.set({ code: res.code, token: res.token, you: res.you });
  applyView(res.view, true);
  return true;
}

export const createDuel = (pair: GamePair) => enter("create", pair);
export const joinDuel = (code: string) => enter("join", code);

export async function startDuel() {
  const creds = credentials();
  if (!creds) return;
  const res = await request("start", creds);
  if (!res.ok) showToast(res.error);
}

export async function castSabotage(target: { team: number; name: string }): Promise<boolean> {
  const creds = credentials();
  if (!creds) return false;
  const res = await request("sabotage", creds, "sniper", target);
  if (!res.ok) {
    console.warn(`[duel] sniper rejected: ${res.error}`);
    showToast(res.error);
    return false;
  }
  showToast(`Sniper set · ${SABOTAGE_SECONDS}s`);
  return true;
}

export async function castDisorient(): Promise<boolean> {
  const creds = credentials();
  if (!creds) return false;
  const res = await request("sabotage", creds, "disorient", null);
  if (!res.ok) {
    console.warn(`[duel] disorient rejected: ${res.error}`);
    showToast(res.error);
  }
  return res.ok;
}

export async function castSpy(): Promise<PathStop[] | null> {
  const creds = credentials();
  if (!creds) return null;
  const res = await request("sabotage", creds, "spy", null);
  if (!res.ok) {
    console.warn(`[duel] spy rejected: ${res.error}`);
    showToast(res.error);
    return null;
  }
  return res.path as PathStop[];
}

export async function tryHop(number: number, name: string, hop: Hop | undefined): Promise<boolean> {
  const creds = credentials();
  if (!creds || get(duelView)?.status !== "racing") return true;
  const frozen = get(frozenSeconds);
  if (frozen > 0) {
    showToast(`Frozen · ${frozen}s`);
    return false;
  }
  const res = await request("hop", creds, { number, name, hop });
  if (res.ok) return true;
  if (res.blocked) {
    console.info(`[duel] hop to ${number} triggered ${res.blocked.kind}; frozen ${FREEZE_SECONDS}s`);
    showToast(`Frozen · ${FREEZE_SECONDS}s`);
    return false;
  }
  if (res.error === "Frozen") {
    showToast(`Frozen · ${Math.ceil(res.frozenMs / 1000)}s`);
    return false;
  }
  return true;
}

export async function requestRematch() {
  const creds = credentials();
  const view = get(duelView);
  const session = get(duelSession);
  if (!creds || !view || !session) return;
  let nextPair: GamePair | null = null;
  if (session.you === 0 && view.pair.mode !== "custom") {
    try {
      nextPair = await fetchPair(view.pair.mode as "global" | "regional", view.pair.steps ?? REMATCH_STEPS);
    } catch (e) {
      console.error("[duel] could not generate a new pair for the rematch; reusing the old one:", e);
    }
  }
  const res = await request("rematch", creds, nextPair);
  if (!res.ok) showToast(res.error);
}

export function leaveDuel() {
  const creds = credentials();
  if (creds) socket?.emit("leave", creds);
  console.info(`[duel] left ${creds?.code ?? "none"}`);
  clearDuel();
}

export function duelLink(code: string): string {
  return `${location.origin}/speedrun?duel=${code}`;
}

if (browser && get(duelSession)) getSocket();
