import { randomBytes, randomUUID } from "crypto";
import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { Team as TeamEntity } from "../db/entities/Team";
import { getTeamGraph, pickDisorientTarget } from "./team-graph";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;
const COUNTDOWN_MS = 3000;
const DISCONNECT_GRACE_MS = 30_000;
const FINISHED_TTL_MS = 10 * 60 * 1000;
const MAX_DUELS = 500;
const SABOTAGE_MS = 20_000;
const FREEZE_MS = 12_000;
const SPY_NOTICE_MS = 10_000;

type Team = {
  number: number;
  name: string;
  city: string;
  state: string;
  country: string;
  seasons: number[];
};

type Pair = { mode: string; steps: number | null; start: Team; destination: Team };

type Hop = {
  eventName: string;
  season: number;
  eventCode?: string;
  kind?: "match" | "radar";
  match?: string;
  relation?: "Partners" | "Opponents" | null;
};

type Stop = { number: number; name: string; hop?: Hop; lifelines?: LifelineId[]; lifelineDetails?: Mark["details"]; sabotages?: Omit<SabotageLogEntry, "player" | "index">[] };

const LIFELINES = ["radar", "crosshair", "beacon"] as const;
type LifelineId = (typeof LIFELINES)[number];
type LifelineDetail = { event?: { season: number; code: string; name: string }; team?: { number: number; name: string } };
type Mark = { index: number; lifelines: LifelineId[]; details: Partial<Record<LifelineId, LifelineDetail>> };

const SABOTAGES = ["sniper", "disorient", "spy"] as const;
type SabotageId = (typeof SABOTAGES)[number];
type SabotageLogEntry = {
  player: number;
  index: number;
  kind: SabotageId;
  type: "cast" | "trigger";
  team?: { number: number; name: string };
};
type Effect = {
  id: number;
  kind: SabotageId;
  caster: number;
  target: number;
  team?: number;
  teamName?: string;
  expiresAt: number;
  revealed: boolean;
  spent: boolean;
  hits: number;
};

type Player = {
  token: string;
  socketId: string | null;
  path: Stop[];
  marks: Mark[];
  radarUsed: boolean;
  used: Record<SabotageId, boolean>;
  frozenUntil: number;
  gaveUp: boolean;
  rematch: boolean;
  left: boolean;
  finishedAt: number | null;
  graceTimer: NodeJS.Timeout | null;
};

type Status = "lobby" | "countdown" | "racing" | "done";
type Reason = "arrived" | "gaveUp" | "disconnected";

type Duel = {
  code: string;
  pair: Pair;
  status: Status;
  players: Player[];
  startedAt: number | null;
  countdownEndsAt: number | null;
  winner: number | null;
  reason: Reason | null;
  effects: Effect[];
  log: SabotageLogEntry[];
  nextEffectId: number;
  nextPair: Pair | null;
  countdownTimer: NodeJS.Timeout | null;
  expiryTimer: NodeJS.Timeout | null;
};

type Ack = (response: { ok: true; [key: string]: unknown } | { ok: false; error: string; [key: string]: unknown }) => void;
type Credentials = { code?: unknown; token?: unknown };

const duels = new Map<string, Duel>();

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function sanitizeTeam(raw: any): Team | null {
  const number = positiveInt(raw?.number);
  if (number === null) return null;
  const seasons = Array.isArray(raw.seasons) ? raw.seasons.filter((s: unknown) => positiveInt(s)).slice(0, 30) : [];
  return {
    number,
    name: str(raw.name, 100),
    city: str(raw.city, 100),
    state: str(raw.state, 100),
    country: str(raw.country, 100),
    seasons,
  };
}

function sanitizeHop(raw: any): Hop | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const hop: Hop = { eventName: str(raw.eventName, 200), season: positiveInt(raw.season) ?? 0 };
  if (typeof raw.eventCode === "string") hop.eventCode = raw.eventCode.slice(0, 50);
  if (raw.kind === "radar") hop.kind = "radar";
  else {
    hop.match = str(raw.match, 50);
    hop.relation = raw.relation === "Partners" || raw.relation === "Opponents" ? raw.relation : null;
  }
  return hop;
}

function sanitizeDetail(raw: any): LifelineDetail {
  const detail: LifelineDetail = {};
  if (raw?.event && positiveInt(raw.event.season)) {
    detail.event = { season: raw.event.season, code: str(raw.event.code, 50), name: str(raw.event.name, 200) };
  }
  const teamNumber = positiveInt(raw?.team?.number);
  if (teamNumber !== null) detail.team = { number: teamNumber, name: str(raw.team.name, 100) };
  return detail;
}

function sanitizeMarks(raw: unknown): Mark[] {
  if (!Array.isArray(raw)) return [];
  const marks: Mark[] = [];
  for (const entry of raw.slice(0, LIFELINES.length)) {
    const index = typeof entry?.index === "number" && Number.isSafeInteger(entry.index) && entry.index >= 0 ? entry.index : null;
    const lifelines = LIFELINES.filter((id) => Array.isArray(entry?.lifelines) && entry.lifelines.includes(id));
    if (index === null || !lifelines.length) continue;
    const details: Mark["details"] = {};
    for (const id of lifelines) details[id] = sanitizeDetail(entry.details?.[id]);
    marks.push({ index, lifelines, details });
  }
  return marks;
}

function pathWithMarks(duel: Duel, playerIndex: number): Stop[] {
  const player = duel.players[playerIndex];
  return player.path.map((stop, index) => {
    const mark = player.marks.find((m) => m.index === index);
    const sabotages = duel.log
      .filter((entry) => entry.player === playerIndex && entry.index === index)
      .map(({ kind, type, team }) => ({ kind, type, ...(team ? { team } : {}) }));
    return { ...stop, ...(mark ? { lifelines: mark.lifelines, lifelineDetails: mark.details } : {}), ...(sabotages.length ? { sabotages } : {}) };
  });
}

const freshUsed = (): Record<SabotageId, boolean> => ({ sniper: false, disorient: false, spy: false });

function newPlayer(): Player {
  return { token: randomUUID(), socketId: null, path: [], marks: [], radarUsed: false, used: freshUsed(), frozenUntil: 0, gaveUp: false, rematch: false, left: false, finishedAt: null, graceTimer: null };
}

function activeEffects(duel: Duel): Effect[] {
  const now = Date.now();
  duel.effects = duel.effects.filter((effect) => effect.expiresAt > now);
  return duel.effects;
}

function mineOf(duel: Duel, index: number) {
  const effects = activeEffects(duel);
  const frozenUntil = duel.players[index].frozenUntil;
  return {
    used: duel.players[index].used,
    frozenUntil: frozenUntil > Date.now() ? frozenUntil : null,
    outgoing: effects
      .filter((e) => e.caster === index && e.kind === "sniper")
      .map((e) => ({ id: e.id, kind: e.kind, team: e.team, expiresAt: e.expiresAt, hits: e.hits })),
    incoming: effects
      .filter((e) => e.target === index)
      .map((e) => ({ id: e.id, kind: e.kind, expiresAt: e.expiresAt, spent: e.spent, ...(e.revealed ? { team: e.team, ...(e.kind === "disorient" ? { teamName: e.teamName } : {}) } : {}) })),
  };
}

function findBlock(duel: Duel, index: number, number: number): Effect | undefined {
  return activeEffects(duel).find((e) => e.kind === "sniper" && e.target === index && !e.spent && e.team === number);
}

function newCode(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = randomBytes(CODE_LENGTH);
    const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    if (!duels.has(code)) return code;
  }
  throw new Error("Could not allocate a duel code.");
}

function pathOf(player: Player): Stop[] {
  return player.path.map((stop) => ({ number: stop.number, name: stop.name, ...(stop.hop && stop.hop.kind !== "radar" ? { hop: stop.hop } : {}) }));
}

function viewOf(duel: Duel) {
  return {
    code: duel.code,
    status: duel.status,
    pair: duel.pair,
    serverNow: Date.now(),
    countdownEndsAt: duel.countdownEndsAt,
    startedAt: duel.startedAt,
    winner: duel.winner,
    reason: duel.reason,
    players: duel.players.map((p) => ({
      connected: p.socketId !== null,
      hops: Math.max(0, p.path.length - 1),
      gaveUp: p.gaveUp,
      rematch: p.rematch,
      left: p.left,
      finishedMs: p.finishedAt !== null && duel.startedAt !== null ? p.finishedAt - duel.startedAt : null,
    })),
    paths: duel.status === "done" ? duel.players.map((_, index) => pathWithMarks(duel, index)) : null,
  };
}

const viewFor = (duel: Duel, index: number) => ({ ...viewOf(duel), mine: mineOf(duel, index) });

async function validatePair(raw: any): Promise<Pair | null> {
  const start = sanitizeTeam(raw?.start);
  const destination = sanitizeTeam(raw?.destination);
  const graph = await getTeamGraph();
  if (!start || !destination || start.number === destination.number ||
      !graph.rootOf.has(start.number) || graph.rootOf.get(start.number) !== graph.rootOf.get(destination.number)) {
    console.warn(`[duel] pair rejected ${raw?.start?.number}>${raw?.destination?.number}`);
    return null;
  }
  return { mode: str(raw.mode, 20), steps: positiveInt(raw.steps), start, destination };
}

export function setupDuels(httpServer: HttpServer) {
  const io = new Server(httpServer, { path: "/socket.io", cors: { origin: true, credentials: false } });
  console.info(
    `[duel] ready path=/socket.io countdownMs=${COUNTDOWN_MS} graceMs=${DISCONNECT_GRACE_MS} finishedTtlMs=${FINISHED_TTL_MS} maxDuels=${MAX_DUELS} sabotages=${SABOTAGES.join(",")} sabotageMs=${SABOTAGE_MS} freezeMs=${FREEZE_MS} spyNoticeMs=${SPY_NOTICE_MS}`
  );

  function broadcast(duel: Duel) {
    duel.players.forEach((player, index) => {
      if (player.socketId) io.to(player.socketId).emit("state", viewFor(duel, index));
    });
  }

  function removeDuel(duel: Duel, reason: string) {
    if (duel.countdownTimer) clearTimeout(duel.countdownTimer);
    if (duel.expiryTimer) clearTimeout(duel.expiryTimer);
    duel.players.forEach((p) => p.graceTimer && clearTimeout(p.graceTimer));
    duels.delete(duel.code);
    io.to(duel.code).emit("closed", reason);
    io.in(duel.code).socketsLeave(duel.code);
    console.info(`[duel] ${duel.code} removed reason=${reason} active=${duels.size}`);
  }

  function finish(duel: Duel, winner: number, reason: Reason) {
    if (duel.status === "done") return;
    if (duel.countdownTimer) clearTimeout(duel.countdownTimer);
    duel.players.forEach((p) => p.graceTimer && clearTimeout(p.graceTimer));
    duel.status = "done";
    duel.winner = winner;
    duel.reason = reason;
    duel.expiryTimer = setTimeout(() => removeDuel(duel, "expired"), FINISHED_TTL_MS);
    const [a, b] = duel.players.map((p) => p.path.length - 1);
    console.info(`[duel] ${duel.code} done winner=${winner} reason=${reason} hops=${a}/${b} ms=${Date.now() - (duel.startedAt ?? Date.now())}`);
    broadcast(duel);
  }

  function resolve(creds: Credentials): { duel: Duel; index: number } | null {
    if (typeof creds?.code !== "string" || typeof creds.token !== "string") return null;
    const duel = duels.get(creds.code);
    const index = duel ? duel.players.findIndex((p) => p.token === creds.token) : -1;
    return duel && index >= 0 ? { duel, index } : null;
  }

  function bind(socket: Socket, duel: Duel, index: number) {
    const player = duel.players[index];
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = null;
    player.socketId = socket.id;
    socket.data.duel = { code: duel.code, index };
    socket.join(duel.code);
  }

  function onGraceExpired(duel: Duel, index: number) {
    const player = duel.players[index];
    player.graceTimer = null;
    if (player.socketId !== null) return;
    console.info(`[duel] ${duel.code} player=${index} did not return within ${DISCONNECT_GRACE_MS} ms status=${duel.status}`);
    if (duel.status === "racing") return finish(duel, 1 - index, "disconnected");
    if (duel.status === "done") return;
    if (index === 0) return removeDuel(duel, "host left");
    if (duel.countdownTimer) clearTimeout(duel.countdownTimer);
    duel.countdownTimer = null;
    duel.countdownEndsAt = null;
    duel.status = "lobby";
    duel.players.splice(index, 1);
    broadcast(duel);
  }

  function leave(socket: Socket) {
    const ctx = socket.data.duel as { code: string; index: number } | undefined;
    const duel = ctx && duels.get(ctx.code);
    if (!ctx || !duel || duel.players[ctx.index]?.socketId !== socket.id) return;
    socket.data.duel = undefined;
    socket.leave(duel.code);
    duel.players[ctx.index].socketId = null;
    onGraceExpired(duel, ctx.index);
  }

  io.on("connection", (socket) => {
    console.info(`[duel] socket ${socket.id} connected sockets=${io.engine.clientsCount}`);

    socket.on("create", async (rawPair: any, ack: Ack) => {
      try {
        const pair = await validatePair(rawPair);
        if (!pair) return ack?.({ ok: false, error: "These teams cannot be played." });
        if (duels.size >= MAX_DUELS) return ack?.({ ok: false, error: "Too many duels right now. Try again later." });
        leave(socket);
        const duel: Duel = {
          code: newCode(), pair, status: "lobby", players: [newPlayer()], startedAt: null, countdownEndsAt: null,
          winner: null, reason: null, effects: [], log: [], nextEffectId: 1, nextPair: null, countdownTimer: null, expiryTimer: null,
        };
        duel.players[0].path = [{ number: pair.start.number, name: pair.start.name }];
        duels.set(duel.code, duel);
        bind(socket, duel, 0);
        console.info(`[duel] ${duel.code} created pair=${pair.start.number}>${pair.destination.number} mode=${pair.mode} active=${duels.size}`);
        ack?.({ ok: true, code: duel.code, token: duel.players[0].token, you: 0, view: viewFor(duel, 0) });
      } catch (error) {
        console.error("[duel] create failed", error);
        ack?.({ ok: false, error: "Could not create the duel. Try again." });
      }
    });

    socket.on("join", (rawCode: unknown, ack: Ack) => {
      const code = str(rawCode, 20).trim().toUpperCase();
      const duel = duels.get(code);
      if (!duel || duel.status !== "lobby" || duel.players.length >= 2) {
        console.info(`[duel] join rejected code=${code} found=${!!duel} status=${duel?.status}`);
        return ack?.({ ok: false, error: duel ? "This duel is full or already started." : "Duel not found." });
      }
      leave(socket);
      const player = newPlayer();
      player.path = [{ number: duel.pair.start.number, name: duel.pair.start.name }];
      duel.players.push(player);
      bind(socket, duel, 1);
      console.info(`[duel] ${duel.code} joined`);
      ack?.({ ok: true, code: duel.code, token: player.token, you: 1, view: viewFor(duel, 1) });
      broadcast(duel);
    });

    socket.on("rejoin", (creds: Credentials, ack: Ack) => {
      const found = resolve(creds);
      if (!found) {
        console.info(`[duel] rejoin rejected code=${String(creds?.code)}`);
        return ack?.({ ok: false, error: "Duel not found." });
      }
      bind(socket, found.duel, found.index);
      console.info(`[duel] ${found.duel.code} player=${found.index} rejoined status=${found.duel.status}`);
      ack?.({ ok: true, code: found.duel.code, you: found.index, view: viewFor(found.duel, found.index) });
      broadcast(found.duel);
    });

    socket.on("start", (creds: Credentials, ack: Ack) => {
      const found = resolve(creds);
      if (!found || found.index !== 0 || found.duel.status !== "lobby" || found.duel.players.length < 2 ||
          found.duel.players.some((p) => p.socketId === null)) {
        return ack?.({ ok: false, error: "Cannot start yet." });
      }
      const { duel } = found;
      duel.status = "countdown";
      duel.countdownEndsAt = Date.now() + COUNTDOWN_MS;
      duel.countdownTimer = setTimeout(() => {
        duel.countdownTimer = null;
        duel.status = "racing";
        duel.startedAt = Date.now();
        duel.countdownEndsAt = null;
        console.info(`[duel] ${duel.code} racing pair=${duel.pair.start.number}>${duel.pair.destination.number}`);
        broadcast(duel);
      }, COUNTDOWN_MS);
      console.info(`[duel] ${duel.code} countdown`);
      ack?.({ ok: true });
      broadcast(duel);
    });

    socket.on("hop", async (creds: Credentials, rawStop: any, ack: Ack) => {
      const graph = await getTeamGraph();
      const found = resolve(creds);
      if (!found || found.duel.status !== "racing") return ack?.({ ok: false, error: "No active race." });
      const { duel, index } = found;
      const player = duel.players[index];
      const number = positiveInt(rawStop?.number);
      const last = player.path[player.path.length - 1].number;
      if (number === null || player.gaveUp || player.finishedAt !== null) return ack?.({ ok: false, error: "Invalid hop." });
      if (number === last) return ack?.({ ok: true });
      const frozenMs = player.frozenUntil - Date.now();
      if (frozenMs > 0) {
        console.info(`[duel] ${duel.code} player=${index} hop ${last}>${number} rejected: frozen for ${frozenMs} more ms`);
        return ack?.({ ok: false, error: "Frozen", frozenMs });
      }

      const hop = sanitizeHop(rawStop.hop);
      if (hop?.kind === "radar") {
        if (player.radarUsed) {
          console.warn(`[duel] ${duel.code} player=${index} rejected second Radar hop`);
          return ack?.({ ok: false, error: "Radar already used." });
        }
      } else {
        const adjacent = graph.teamMatches.get(last)?.some((m) => graph.matchTeams[m].includes(number));
        if (!adjacent) {
          console.warn(`[duel] ${duel.code} player=${index} rejected hop ${last}>${number}: no shared match`);
          return ack?.({ ok: false, error: "No shared match." });
        }
      }
      const block = findBlock(duel, index, number);
      if (block) {
        block.revealed = true;
        block.hits++;
        block.spent = true;
        duel.log.push({ player: index, index: player.path.length - 1, kind: block.kind, type: "trigger", team: { number: block.team!, name: block.teamName ?? "" } });
        player.frozenUntil = Date.now() + FREEZE_MS;
        block.expiresAt = Math.max(block.expiresAt, player.frozenUntil);
        console.info(`[duel] ${duel.code} player=${index} hop ${last}>${number} triggered ${block.kind}; frozen ${FREEZE_MS} ms`);
        ack?.({ ok: false, error: "Hop failed", blocked: { kind: block.kind, team: block.team }, frozenMs: FREEZE_MS });
        return broadcast(duel);
      }
      duel.effects = duel.effects.filter((e) => !(e.kind === "disorient" && e.target === index));
      if (hop?.kind === "radar") player.radarUsed = true;
      player.path.push({ number, name: str(rawStop.name, 100), ...(hop ? { hop } : {}) });
      console.info(`[duel] ${duel.code} player=${index} hop ${last}>${number} hops=${player.path.length - 1}${hop?.kind === "radar" ? " radar" : ""}`);
      ack?.({ ok: true });
      if (number === duel.pair.destination.number) {
        player.finishedAt = Date.now();
        finish(duel, index, "arrived");
      } else {
        broadcast(duel);
      }
    });

    socket.on("sabotage", async (creds: Credentials, rawKind: unknown, rawTarget: any, ack: Ack) => {
      const graph = await getTeamGraph();
      const found = resolve(creds);
      if (!found || found.duel.status !== "racing") return ack?.({ ok: false, error: "No active race." });
      const { duel, index } = found;
      const player = duel.players[index];
      const kind = SABOTAGES.find((id) => id === rawKind);
      if (!kind || player.used[kind] || player.gaveUp || player.finishedAt !== null) {
        return ack?.({ ok: false, error: "Sabotage unavailable." });
      }
      const target = 1 - index;
      const opponent = duel.players[target];
      const opponentAt = opponent.path[opponent.path.length - 1].number;
      const destination = duel.pair.destination.number;
      const now = Date.now();
      const effect: Effect = { id: duel.nextEffectId++, kind, caster: index, target, expiresAt: now + SABOTAGE_MS, revealed: false, spent: false, hits: 0 };
      const reject = (error: string) => {
        console.warn(`[duel] ${duel.code} player=${index} rejected ${kind}: ${error}`);
        return ack?.({ ok: false, error });
      };

      if (kind === "sniper") {
        const team = positiveInt(rawTarget?.team);
        if (team === null || !graph.rootOf.has(team)) return reject("Unknown team.");
        if (team === duel.pair.start.number || team === destination) return reject("The start and destination cannot be marked.");
        if (player.path.some((stop) => stop.number === team)) return reject("You have already visited that team.");
        effect.team = team;
        effect.teamName = str(rawTarget?.name, 100);
      } else if (kind === "disorient") {
        const pick = pickDisorientTarget(graph, opponentAt, destination);
        if (!pick) return reject("No place to send your opponent.");
        const row = await TeamEntity.findOneBy({ number: pick.team });
        const stale = duel.status !== "racing" || player.used[kind] || opponent.path[opponent.path.length - 1].number !== opponentAt;
        if (stale) return reject("The race changed. Try again.");
        effect.team = pick.team;
        effect.teamName = row?.name ?? `${pick.team}`;
        effect.revealed = true;
        effect.spent = true;
        effect.expiresAt = now + SPY_NOTICE_MS;
        duel.log.push({ player: target, index: opponent.path.length - 1, kind, type: "trigger" });
        opponent.path.push({ number: pick.team, name: effect.teamName });
        console.info(`[duel] ${duel.code} player=${target} disoriented ${opponentAt}>${pick.team} distance=${pick.distance} candidates=${pick.candidates} hops=${opponent.path.length - 1}`);
      } else {
        effect.expiresAt = now + SPY_NOTICE_MS;
      }

      player.used[kind] = true;
      duel.effects.push(effect);
      duel.log.push({ player: index, index: player.path.length - 1, kind, type: "cast", ...(effect.team ? { team: { number: effect.team, name: effect.teamName ?? "" } } : {}) });
      console.info(
        `[duel] ${duel.code} player=${index} cast ${kind}${effect.team ? ` team=${effect.team}` : ""} opponentAt=${opponentAt}`
      );
      ack?.({ ok: true, ...(kind === "spy" ? { path: pathOf(opponent) } : {}) });
      broadcast(duel);
    });

    socket.on("lifelines", (creds: Credentials, rawMarks: unknown, ack: Ack) => {
      const found = resolve(creds);
      if (!found || found.duel.status !== "racing") return ack?.({ ok: false, error: "No active race." });
      const marks = sanitizeMarks(rawMarks);
      found.duel.players[found.index].marks = marks;
      console.info(`[duel] ${found.duel.code} player=${found.index} lifelines=${marks.flatMap((m) => m.lifelines).join(",") || "none"}`);
      ack?.({ ok: true });
    });

    socket.on("giveUp", (creds: Credentials, ack: Ack) => {
      const found = resolve(creds);
      if (!found || found.duel.status !== "racing") return ack?.({ ok: false, error: "No active race." });
      found.duel.players[found.index].gaveUp = true;
      ack?.({ ok: true });
      finish(found.duel, 1 - found.index, "gaveUp");
    });

    socket.on("rematch", async (creds: Credentials, rawPair: any, ack: Ack) => {
      const found = resolve(creds);
      if (!found || found.duel.status !== "done") return ack?.({ ok: false, error: "No finished duel." });
      const { duel, index } = found;
      if (duel.players.some((p) => p.left)) return ack?.({ ok: false, error: "Your opponent left." });
      if (index === 0 && rawPair) duel.nextPair = await validatePair(rawPair);
      duel.players[index].rematch = true;
      console.info(`[duel] ${duel.code} player=${index} wants a rematch`);
      ack?.({ ok: true });
      if (!duel.players.every((p) => p.rematch)) return broadcast(duel);

      if (duel.expiryTimer) clearTimeout(duel.expiryTimer);
      duel.expiryTimer = null;
      duel.pair = duel.nextPair ?? duel.pair;
      duel.nextPair = null;
      duel.status = "lobby";
      duel.winner = null;
      duel.reason = null;
      duel.startedAt = null;
      duel.countdownEndsAt = null;
      duel.effects = [];
      duel.log = [];
      for (const p of duel.players) {
        p.path = [{ number: duel.pair.start.number, name: duel.pair.start.name }];
        p.marks = [];
        p.radarUsed = false;
        p.used = freshUsed();
        p.frozenUntil = 0;
        p.gaveUp = false;
        p.rematch = false;
        p.finishedAt = null;
      }
      console.info(`[duel] ${duel.code} rematch pair=${duel.pair.start.number}>${duel.pair.destination.number}`);
      broadcast(duel);
    });

    socket.on("leave", (creds: Credentials) => {
      const found = resolve(creds);
      if (!found) return;
      const { duel, index } = found;
      console.info(`[duel] ${duel.code} player=${index} left status=${duel.status}`);
      socket.data.duel = undefined;
      socket.leave(duel.code);
      duel.players[index].socketId = null;
      if (duel.status === "racing") {
        duel.players[index].gaveUp = true;
        return finish(duel, 1 - index, "gaveUp");
      }
      if (duel.status === "done") {
        duel.players[index].left = true;
        return broadcast(duel);
      }
      onGraceExpired(duel, index);
    });

    socket.on("disconnect", (why) => {
      const ctx = socket.data.duel as { code: string; index: number } | undefined;
      const duel = ctx && duels.get(ctx.code);
      console.info(`[duel] socket ${socket.id} disconnected reason=${why} duel=${ctx?.code ?? "none"}`);
      if (!ctx || !duel) return;
      const player = duel.players[ctx.index];
      if (!player || player.socketId !== socket.id) return;
      player.socketId = null;
      if (duel.status !== "done") {
        player.graceTimer = setTimeout(() => onGraceExpired(duel, ctx.index), DISCONNECT_GRACE_MS);
        broadcast(duel);
      }
    });
  });

  return io;
}
