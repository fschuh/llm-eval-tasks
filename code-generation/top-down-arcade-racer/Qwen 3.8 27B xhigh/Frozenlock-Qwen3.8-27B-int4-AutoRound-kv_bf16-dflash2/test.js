"use strict";
// Headless verification for the racing sim:
//  1. determinism (same seed + same inputs => identical final state)
//  2. seed sensitivity (different seed => different state)
//  3. lap detection (cars actually complete the race)
const RacingSim = require("./sim.js");
const { createSim, DT, TOTAL_LAPS } = RacingSim;

function run(seed, steps) {
  const sim = createSim(seed);
  for (let i = 0; i < steps; i++) {
    sim.playerInput = {
      throttle: 1,
      brake: 0,
      steer: Math.sin(i * 0.013) * 0.9,
    };
    sim.step(DT);
  }
  return JSON.stringify({
    phase: sim.phase,
    raceTime: +sim.raceTime.toFixed(3),
    cars: sim.cars.map((c) => [
      +c.x.toFixed(3), +c.y.toFixed(3), +c.heading.toFixed(4),
      c.lap, c.finished, +c.finishTime.toFixed(3), c.collisions,
    ]),
    positions: sim.positions,
  });
}

const STEPS = 120 * 90; // 90 simulated seconds at 120 Hz

const a = run(1337, STEPS);
const b = run(1337, STEPS);
const c = run(4242, STEPS);

let failed = false;
if (a !== b) { console.error("FAIL: same seed produced different states"); failed = true; }
else console.log("PASS: deterministic (two runs, seed 1337, identical final state)");

if (a === c) { console.error("FAIL: different seed produced identical state"); failed = true; }
else console.log("PASS: seed-sensitive (seed 4242 gives a different state)");

const sim = createSim(1337);
for (let i = 0; i < STEPS; i++) {
  sim.playerInput = { throttle: 1, brake: 0, steer: Math.sin(i * 0.013) * 0.9 };
  sim.step(DT);
}
const finished = sim.cars.filter((c) => c.finished).length;
if (finished === 0) { console.error("FAIL: no car completed the race"); failed = true; }
else console.log("PASS: " + finished + "/" + sim.cars.length + " cars finished " + TOTAL_LAPS + " laps");

const totalCollisions = sim.cars.reduce((s, c) => s + c.collisions, 0);
console.log("info: " + totalCollisions + " collision impulses applied over the race");

console.log("final standings:");
sim.positions.forEach((ci, rank) => {
  const c = sim.cars[ci];
  const t = c.finished ? " @" + c.finishTime.toFixed(2) + "s" : "";
  console.log("  P" + (rank + 1) + " " + c.name + "  lap=" + c.lap + "  finished=" + c.finished + t + "  collisions=" + c.collisions);
});

if (failed) process.exit(1);
console.log("ALL TESTS PASSED");
