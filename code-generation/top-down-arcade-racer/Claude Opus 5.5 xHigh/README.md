# Top-Down Racer

A deterministic top-down 2D racing prototype in plain JavaScript: no build step, no dependencies, no physics engine.
You race three A*-planning AI opponents over three laps, with rigid-body collisions, lap timing, a full HUD, and an
instant replay that proves the run is deterministic.

## Run it

Open `index.html` in a modern browser (Chrome, Firefox, Safari, Edge). That's all; it works straight from `file://`.

```
npm test          # or: node tests/run-tests.js   (headless simulation tests, no dependencies)
```

### Controls

| Key | Action |
| --- | --- |
| `↑` / `W` | throttle |
| `↓` / `S` | brake; when stopped, reverse |
| `←` `→` / `A` `D` | steer |
| `Space` | handbrake (rear grip drops, the car slides) |
| `Esc` | pause / resume (also pauses automatically when the window loses focus) |
| `R` | restart the race (same seed) |
| `N` | next seed |
| `T` | switch track: hand-built *Harbor Circuit* ↔ seeded procedural track |
| `P` | replay the current run from its input log, with a live determinism check |
| hold `F` | fast-forward (during replays, after you finish, or in autopilot mode) |
| `F3` / `` ` `` | debug view: A* racing lines, AI aim points, checkpoint gates, hitboxes, state hash |

### URL parameters

`index.html?seed=42&track=procedural&laps=5&autopilot=1&debug=1&warp=30&paused=1`

- `seed`: any integer or string (strings are hashed). The same seed always gives the same race.
- `track`: `classic` (default) or `procedural`, which generates a new layout from the seed.
- `laps`: 1–50 (default 3).
- `autopilot=1`: the AI drives your car too (demo mode).
- `debug=1`: start with the debug view on.
- `warp=N`: fast-forward N seconds on load (with `paused=1`, freeze there).

The URL is kept in sync (seed and track), so reloading or sharing a link reproduces the race.

## How the requirements are met

| Requirement | Where / how |
| --- | --- |
| Player car with acceleration / braking / steering | `src/sim/car.js`. Engine force fading toward top speed, brakes, reverse gear, rolling resistance and aero drag. Speed-sensitive, rate-limited steering. A lateral tire-grip limit, so the car slides past it. Kinematic-bicycle yaw with an understeer cap. Handbrake. |
| 3 AI opponents (A* and waypoint following) | `src/sim/ai.js` + `src/sim/pathfinding.js`. Each AI plans its own racing line with A* and follows it with pure-pursuit steering. A* also runs at runtime for detours (details below). |
| Lap detection | `src/sim/world.js`. Ordered checkpoint gates, direction-checked, with sub-tick crossing times (details below). |
| Collision response with impulse resolution | `src/sim/collision.js`. SAT oriented-box vs. wall-segment and box vs. box, clipped contact manifold, normal + friction impulses with angular terms, positional correction. |
| HUD showing lap / time / position | `src/client/hud.js`. Lap, race time, current / last / best lap, position, live standings with timing gaps, speedometer, minimap, start lights, lap and finish messages, results table. |
| Deterministic RNG seed | `src/core/rng.js` (seeded sfc32 with named sub-streams) + `src/core/dmath.js` (deterministic trig). See *Determinism* below. |
| Fixed timestep | `src/client/main.js`. The sim always advances in exact 1/120 s ticks. See *Fixed timestep* below. |
| No external physics engine | No third-party code at all. |

## Architecture

```
index.html              canvas + script tags (classic scripts, so it runs from file://)
src/core/dmath.js       deterministic sin/cos/tan/atan2 + small math helpers
src/core/rng.js         seeded PRNG (sfc32), named sub-streams, seed parsing
src/sim/track.js        spline track, walls, checkpoint gates, clearance grid, procedural generator
src/sim/car.js          car rigid body + tire model
src/sim/collision.js    SAT detection, contact manifold, impulse resolution
src/sim/pathfinding.js  grid A* (binary heap, deterministic tie-breaking)
src/sim/ai.js           racing-line planning, pure-pursuit driver, traffic, recovery
src/sim/world.js        fixed-step world: grid start, race rules, standings, state hash
src/client/input.js     keyboard → per-tick input bitmask
src/client/renderer.js  camera, track, cars, skid marks, particles, debug overlay
src/client/hud.js       HUD and overlays
src/client/main.js      game loop, recording / replay, key commands, URL sync
tests/run-tests.js      25 headless tests
```

Everything under `src/core` and `src/sim` is DOM-free. The same files run in the browser and under Node, and the
renderer only *reads* simulation state.

### Fixed timestep

The loop in `main.js` feeds real frame time into an accumulator and calls `world.step()` in exact `DT = 1/120 s`
ticks. The renderer interpolates each car's pose between the previous and current tick (`alpha = acc / DT`), so motion
stays smooth at 60, 144 or 240 Hz displays. Frame time is clamped (0.25 s) and ticks per frame are capped, so a
stalled tab can't cause a spiral of death. Game logic never sees the frame rate. Times are counted in ticks, and lap
times are interpolated inside the tick in which the line is crossed.

### Determinism

Same seed + same per-tick input bitmasks ⇒ bit-identical simulation, in any JS engine:

- **Seeded RNG.** Everything random comes from `new RNG(seed).derive('name')`: the procedural track, grid order and AI
  personalities. A derived stream depends only on the seed and its label, so adding a new random consumer can't shift
  the others. Visual effects (trees, sparks, smoke, shake) use their own streams and never touch the sim.
- **Deterministic math.** `Math.sin/cos/atan2/exp/pow/hypot` are implementation-approximated and may differ between
  engines. The sim uses polynomial versions built only from `+ − × ÷` and `Math.sqrt`, which IEEE-754 specifies
  exactly. A test scans the sim sources for banned calls, and another fails if the sim calls `Math.random` or the clock.
- **Ordered iteration.** Arrays in fixed order, stable sorts with id tie-breakers, A* heap ties
  broken by (f, h, insertion order).
- **Proof.** `P` replays your run from its recorded input log and compares state hashes every 60 ticks, then shows
  *"Determinism check passed"* (or the first tick where the runs diverged). The same seed also gives identical hashes
  in Node (V8) and Firefox (SpiderMonkey).

### Car physics (`car.js`)

A rigid body (position, velocity, heading, angular velocity, mass, moment of inertia) driven by an arcade tire model:

- **Longitudinal:** engine acceleration `a₀·(1 − v/vmax)`. "Resistances" (rolling, `k·v²` drag, brakes, sliding
  scrub) always oppose motion and never overshoot zero, so the car stops cleanly.
- **Lateral:** the tires remove up to `grip·dt` of sideways velocity per tick. Beyond that the car slides. The
  handbrake lowers rear grip.
- **Yaw:** target yaw rate `v·tan(δ)/L` (kinematic bicycle), capped at `frontGrip/v` (understeer). The tires pull the
  angular velocity toward it with finite torque. Collision spins therefore persist briefly, and the car has to recover.

### Collisions (`collision.js`)

- **Detection:** separating-axis test on convex polygons. A car is an oriented box; each wall segment is a two-vertex
  polygon. The incident edge is clipped against the reference face (Box2D-lite style). The contact points are merged
  into one at their centre, with the deepest penetration depth.
- **Response:** `j = −(1+e)·vₙ / (1/mA + 1/mB + (rA×n)²/IA + (rB×n)²/IB)` at the contact point, then a Coulomb-clamped
  friction impulse (`|jₜ| ≤ μ·j`), then positional correction of 80% of the penetration beyond a small slop.
- **Setup:** walls are static (infinite mass). Restitution is 0.3 against walls and 0.35 between cars, and is zeroed
  for slow contacts to avoid jitter. Three iterations per tick. Wall segments are looked up in a uniform spatial hash.
- **Tests:** conservation of linear and angular momentum, the restitution value, and no tunnelling at top speed.

### AI (`ai.js`, `pathfinding.js`)

1. **Planning (once per race, per driver).** The track has a clearance grid: every 12-unit cell knows its distance to
   the nearest wall. A* runs on that grid from each checkpoint gate to the next, all the way round. Cells near the
   walls cost more, and each driver's personality weights that differently, so each opponent drives its own line. Two
   laps are planned and the second is kept, so the loop closes cleanly. The cell path is then:
   - string-pulled (line-of-sight shortcuts),
   - resampled and relaxed into a smooth racing line,
   - given a speed profile `v = √(a_lat·R)` with a backward braking pass.
2. **Driving (every tick).** Waypoint following with pure-pursuit steering toward a speed-dependent look-ahead point.
   If a wall hides that point, the look-ahead shortens. Throttle and brake track the speed profile.
3. **Traffic.** Traffic is judged along the racing-line direction:
   - Overtake a slower car on the side with room between it and the wall. Keep that side, and shrink the move in
     tight corners.
   - Otherwise follow at a set gap.
   - Keep elbow room from cars alongside.
4. **Recovery.** If the target can't be seen at all, a runtime A* detour is planned on a navigation grid. If the car
   wants to move but can't (nose in a wall or another car), it reverses out with opposite lock.
5. **Catch-up.** A mild ±3% pace adjustment relative to the player (`rubberBand` in `world.js`, set it to 0 to
   disable). It is deterministic, because it depends only on sim state.

### Lap detection (`world.js`)

The track is cut by ~36 checkpoint gates (one every ~300 units). The start/finish line is gate 0.

- **Order.** A car only counts the *next* gate, crossed *forwards*, within the track width. Backing over the previous
  gate un-counts it.
- **Laps.** A lap completes when gate 0 is crossed after all the others. Shortcuts, reversing over the line or driving
  the wrong way never count.
- **Timing.** Crossing times are interpolated within the tick.
- **Ranking.** Positions use `gates passed + fraction to next gate`. Standings gaps are real timing-loop gaps: the
  difference in when two cars reached the same gate.

## Tuning

Car handling: `CAR_SPEC` in `car.js`. Collision feel: constants at the top of `collision.js`. AI skill:
`rollPersonality()` in `ai.js`. Race defaults (seed, laps, catch-up): `DEFAULTS` in `world.js`. Track layout:
`TRACK_DEFS` in `track.js` (control points; `Track.create(def)` validates the geometry).

## Limitations

This is a prototype: keyboard only (no gamepad or touch), no audio, one car model, and walls instead of off-track
surfaces.
