import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { derived, get, writable } from "svelte/store";
import { io, type Socket } from "socket.io-client";
import {
  SERVER_ORIGIN,
  fetchPair,
  game,
  giveUp,
  resetGame,
  showToast,
  startGame,
  startUrl,
  type GamePair,
  type GameState,
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
};
type ServerView = Omit<DuelView, "receivedAt">;
type Session = { code: string; token: string; you: number };
type Ack = { ok: true; [key: string]: any } | { ok: false; error: string };

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
  if (quiet) return;
  if (view.status === "racing" && prev && prev.status !== "racing" && prev.status !== "done") beginRace(view);
  if (view.status === "done" && prev?.status !== "done") endRace();
  if (view.status === "lobby" && prev?.status === "done") startRematchLobby();
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

function endRace() {
  if (get(game).status !== "playing") return;
  giveUp();
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
      if (!res.ok) {
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
