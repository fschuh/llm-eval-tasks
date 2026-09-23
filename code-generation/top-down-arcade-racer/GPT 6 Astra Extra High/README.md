# APEX — Club Circuit

A self-contained top-down arcade racer in vanilla JavaScript and Canvas 2D. Race three opponents for three laps around Greenwood Circuit.

## Run

Open **`index.html`** directly in a modern browser. No install, build, network connection, or external assets are needed.

Alternatively, with Node.js 18 or newer:

```sh
npm start
```

Visit **http://localhost:8080**. To select a repeatable grid and AI setup, use `http://localhost:8080/?seed=42`. The default seed is `2048`; seeds are unsigned 32-bit integers. `PORT=3000 npm start` selects another port.

## Controls

| Action | Input |
| --- | --- |
| Accelerate | W / ↑ |
| Brake; reverse once stopped | S / ↓ |
| Steer left / right | A / D or ← / → |
| Handbrake | Space |
| Pause / resume | P / Escape or pause button |
| Restart with the same seed | R or Restart |
| Start from the grid | Enter or Let's Race |

Touch steering and pedals appear on narrow screens, where the camera follows your car to keep corners readable. Desktop shows the entire circuit. Sound is an optional synthesized engine, initially off. Switching tabs or losing focus pauses the race and clears held controls.

## Simulation

- **Fixed timestep:** all movement, AI, collision resolution, countdown, and race timing advance in `1/120` second steps. `requestAnimationFrame` drives an accumulator; positions and headings are interpolated for display. A 250 ms catch-up cap intentionally slows simulation time during severe stalls. Pausing resets the accumulator.
- **Determinism:** Mulberry32 supplies seeded AI parameters. Scenery and effects use independent seeded streams; rendering never consumes simulation randomness. The same seed and per-tick input sequence reproduce the same simulation in the same JavaScript runtime, regardless of ordinary render frame rate. Live keyboard events are sampled at the next tick. Bit-identical results across different JavaScript engines are not guaranteed because of floating-point trigonometry.
- **Player physics:** velocity decomposes into forward and lateral components, with acceleration, braking/reverse, drag, lateral tire grip, and speed-dependent steering. The handbrake lowers lateral grip. Leaving the asphalt reduces traction and speed.
- **Three waypoint opponents:** a closed Catmull–Rom centerline is sampled into waypoints. Each driver pursues a speed-dependent look-ahead target, brakes for upcoming curvature, offsets its line around traffic, and reverses briefly if stuck. All cars use the same physics and barriers.
- **Collisions:** each car is a two-circle chassis with equal mass and rotational inertia. Three solver iterations apply normal restitution impulses, tangential friction impulses, angular response, and penetration correction. The track walls use static-body impulses. No external physics engine is used.
- **Laps:** twelve finite-width, directed checkpoint gates must be crossed in order. The initial start-line crossing arms the first lap; subsequent ordered circuits count laps. Crossing backward, rocking across the finish line, or missing gates cannot award a lap. Fractional line-crossing times resolve close finishes. The first lap includes travel from the standing grid, so the three lap times sum to the finish time.
- **Position:** continuous unwrapped track distance ranks unfinished cars; recorded crossing times rank finishers. Opponents can finish after the player while the results card updates.

## Files and verification

`simulation.js` is the DOM-free simulation, also exposed through CommonJS for tests. `renderer.js` draws the circuit and cars. `game.js` connects input, HUD, sound, and the animation loop. `server.js` is an optional dependency-free local server.

```sh
npm test
```

Tests cover seeded replay, frame-rate independence, driving controls, collision momentum, barriers, checkpoint exploits, lap timing, finish order, and full AI races across several seeds. For inspection in the browser console, `apex.race` exposes the current state, `apex.restart()` restarts with the same seed, and `ApexSim` exposes the simulation functions.
