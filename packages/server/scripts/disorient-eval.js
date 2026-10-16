require("dotenv/config");
const { DATA_SOURCE } = require("../.tmp-build/db/data-source");
const { getTeamGraph, teamDistances, pickDisorientTarget } = require("../.tmp-build/game/team-graph");

const SAMPLES = +process.env.SAMPLES || 3000;
const EXHAUSTIVE_DESTINATIONS = +process.env.DESTS || 5;
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? `n=${s.length} min=${s[0]} p5=${pct(s, 0.05)} median=${pct(s, 0.5)} p95=${pct(s, 0.95)} max=${s[s.length - 1]}` : "n=0";
};
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

(async () => {
  await DATA_SOURCE.initialize();
  let t0 = process.hrtime.bigint();
  const graph = await getTeamGraph();
  console.log(`graph build ms=${ms(t0).toFixed(0)} teams=${graph.rootOf.size} connectable=${graph.connectableTeams.length} matches=${graph.matchTeams.length}`);

  const byRoot = new Map();
  for (const t of graph.connectableTeams) {
    const r = graph.rootOf.get(t);
    (byRoot.get(r) ?? byRoot.set(r, []).get(r)).push(t);
  }
  const largest = [...byRoot.values()].sort((a, b) => b.length - a.length)[0];
  console.log(`largest component=${largest.length}`);

  const timings = [];
  const byD = new Map();
  const candCounts = [];
  let validated = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const c = pick(largest), d = pick(largest);
    if (c === d) continue;
    t0 = process.hrtime.bigint();
    const r = pickDisorientTarget(graph, c, d);
    timings.push(ms(t0));
    const dist = r ? r.distance : teamDistances(graph, d).get(c);
    const row = byD.get(dist) ?? byD.set(dist, { n: 0, ok: 0 }).get(dist);
    row.n++;
    if (r) {
      row.ok++;
      candCounts.push(r.candidates);
      if (i % 20 === 0) {
        const fromD = teamDistances(graph, d), fromC = teamDistances(graph, c, 2);
        if (fromD.get(r.team) !== dist || !(fromC.get(r.team) >= 1 && fromC.get(r.team) <= 2)) throw new Error(`INVALID pick c=${c} d=${d} x=${r.team}`);
        validated++;
      }
    }
  }
  console.log(`validated picks=${validated}`);
  console.log(`\nrandom pairs (both teams uniform over the largest component), ${timings.length} samples`);
  console.log(`pickDisorientTarget ms: ${stats(timings.map((t) => +t.toFixed(2)))} mean=${(timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(2)}`);
  console.log(`candidates when found: ${stats(candCounts)}`);
  for (const [dist, { n, ok }] of [...byD].sort((a, b) => a[0] - b[0])) console.log(`  d=${dist}: ${ok}/${n} found (${((100 * ok) / n).toFixed(1)}%)`);

  console.log(`\nexhaustive: every team as the current team, ${EXHAUSTIVE_DESTINATIONS} random destinations`);
  const exh = new Map();
  for (let k = 0; k < EXHAUSTIVE_DESTINATIONS; k++) {
    const d = pick(largest);
    const fromD = teamDistances(graph, d);
    for (const c of largest) {
      if (c === d) continue;
      const dist = fromD.get(c);
      const near = teamDistances(graph, c, 2);
      let n = 0;
      for (const [x, h] of near) if (h > 0 && fromD.get(x) === dist) n++;
      const row = exh.get(dist) ?? exh.set(dist, { n: 0, fail: 0, failTeams: [] }).get(dist);
      row.n++;
      if (!n) { row.fail++; if (row.failTeams.length < 3) row.failTeams.push({ c, d, matchesOfC: graph.teamMatches.get(c).length }); }
    }
  }
  for (const [dist, { n, fail, failTeams }] of [...exh].sort((a, b) => a[0] - b[0])) {
    console.log(`  d=${dist}: fail ${fail}/${n} (${((100 * fail) / n).toFixed(2)}%)${failTeams.length ? " e.g. " + JSON.stringify(failTeams) : ""}`);
  }
  await DATA_SOURCE.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
