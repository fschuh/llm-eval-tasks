/*
 * Headless AI-only races: prints per-seed lap times, contacts and anomalies.
 *   node tools/report.js [firstSeed] [count] [laps]
 */
'use strict';
const R = require('../test/load.js');

const first = Number(process.argv[2] || 1);
const count = Number(process.argv[3] || 10);
const laps = Number(process.argv[4] || 3);
const fmt = (t) => (t === Infinity || t === undefined ? '  --  ' : t.toFixed(2).padStart(6));

let bad = 0;
for (let seed = first; seed < first + count; seed++) {
  const race = new R.Race({ seed, laps, autoPlayer: true });
  const limit = 400 / R.CONFIG.DT;
  const t0 = Date.now();
  while (!race.allFinished && race.tick < limit) race.step();
  const ms = Date.now() - t0;
  const rev = race.drivers.map((d) => d.reversals);
  const ok = race.allFinished;
  if (!ok) bad++;
  console.log(
    `seed ${String(seed).padStart(3)} len ${Math.round(race.track.length)} ` +
      `${ok ? 'finished' : 'DNF!!!!'} t=${race.raceTime().toFixed(1)}s walls ${race.stats.wallHits} cars ${race.stats.carHits} ` +
      `rev [${rev}] sim ${ms}ms`
  );
  for (const c of race.order) {
    console.log(
      `   P${c.position} ${c.name.padEnd(5)} laps ${c.lapTimes.map(fmt).join(' ')} best ${fmt(c.bestLap)} ` +
        `vmax ${c.stats.maxSpeed.toFixed(0)} wall ${c.stats.wallHits} car ${c.stats.carHits}`
    );
  }
}
console.log(bad ? `${bad} race(s) did not finish` : 'all races finished');
process.exitCode = bad ? 1 : 0;
