# Vector Circuit

A dependency-free top-down 2D racing prototype written in browser JavaScript.

Open `index.html` in a modern browser, then use **WASD** or the **arrow keys** to drive. The player races three deterministic waypoint-following AI opponents over three laps.

The simulation uses a fixed `1/120` second timestep. A seeded PRNG creates the same scenery and AI configuration every run, while car-to-car and car-to-wall contacts use simple impulse-based collision response. No external physics engine is used.
