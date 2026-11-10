# Tarmac Sprint — top-down 2D racing prototype

Plain JavaScript + Canvas 2D. No build step, no server, no dependencies.

**Run:** open `index.html` in a browser (works from `file://`).
**Test:** `node test.js` (headless checks of the simulation core).

## Controls

| Key | Action |
| --- | --- |
| `↑` / `W` | accelerate |
| `↓` / `S` | brake, then reverse |
| `←` `→` / `A` `D` | steer |
| `Enter` | start race |
| `P` / `Esc` | pause |
| `R` | restart (same seed) |
| `N` | next seed (new AI personalities + scenery) |
| `C` | camera: north-up / chase |
| `H` | debug overlay: AI waypoints and pursuit targets, lap gates, collision boxes, state hash |
| `V` | on the results screen: watch the replay (press again for 2×/4×/8×) |

You start last on a 4-car grid; the race is 3 laps.

## How the brief is covered

| Requirement | Implementation |
| --- | --- |
| Player car: acceleration / braking / steering | Rigid body with engine force, drag, brakes and reverse; speed-sensitive steering lock; tyres cancel sideways velocity only up to a grip limit, so the car slides when overdriven. Grass costs grip and speed. (`integrateCar` in `sim.js`) |
| 3 AI opponents, waypoint following | Waypoints are the samples of a racing line computed at load time (minimum-bending-energy line inside the track limits). Each driver steers by pure pursuit on a look-ahead waypoint and follows a curvature-based speed profile with a braking pass. On top: lane scoring for overtaking / avoiding, mild rubber-banding, reverse-out recovery. They drive the same car physics as the player. (`Driver`) |
| Lap detection | 8 ordered gates across the track; gate 0 is the start/finish line. A lap counts only when every gate was crossed in order and in the forward direction, so reversing over the line gains nothing. Crossing times are interpolated inside the tick. (`Race.updateProgress`) |
| Collision response, impulse resolution | Car ↔ car: oriented-box SAT gives normal and depth, then one impulse at the contact point with restitution, Coulomb friction and angular terms, plus positional separation. Car ↔ barrier: the same impulse applied at each penetrating body corner against an immovable wall. (`collideCars`, `resolveWalls`) |
| HUD: lap / time / position | Lap counter with last and best lap, race clock, position, live standings with gaps, minimap, speedometer, start lights, wrong-way warning, results table. |

| Constraint | Implementation |
| --- | --- |
| Deterministic RNG seed | Seeded mulberry32 (`RNG`), default seed `1337`, `?seed=` in the URL or `N` in game. `Math.random` is never used. The seed drives AI personalities (pace, grip use, braking, line, reaction time), scenery and particles. |
| Fixed timestep | The simulation only advances in whole 1/120 s ticks (accumulator loop in `main.js`); rendering interpolates between the last two ticks. |
| No external physics engine | Everything is in `sim.js`; there are no third-party files at all. |

Because of the two constraints a race is a pure function of *(seed, one input byte per tick)*. The game records those bytes, and `V` re-simulates the race from them and compares an FNV-1a hash of the exact state bits with the live run. `test.js` checks the same thing headlessly, tick by tick.

## Files

- `sim.js` — simulation core: RNG, track, car physics, collisions, AI, race rules. No DOM; also loads in Node.
- `render.js` — camera, track / car / effects drawing, HUD.
- `main.js` — input, fixed-timestep loop, screens, replay.
- `test.js` — determinism, lap rules, barrier containment, momentum conservation, AI completing races.

URL parameters: `?seed=123`, `?laps=5`, `?auto=1` (AI drives your car), `?start=1` (skip the title), `?debug=1`, `?cam=chase`.

Note: bit-exact reproducibility holds within one JavaScript engine. `Math.sin`, `Math.atan2` and friends are not specified to the last bit, so a replay recorded in one browser engine is not guaranteed to match in another.
