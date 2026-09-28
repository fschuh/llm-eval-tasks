# APEX — top-down racing prototype

Open `index.html` in a modern browser. Drive with **W / ↑** to accelerate, **S / ↓** to brake or reverse, and **A / ←** and **D / →** to steer. Press **P** to pause and **R** to restart. Touch controls appear on touch devices.

The race has three laps and three waypoint-following opponents. A lap counts only after crossing all three sector markers in order and then crossing the finish line in the forward direction. Car-to-car impacts use equal-mass impulses; the track boundary pushes cars back onto the road.

Simulation advances in fixed 1/120-second steps. All random scenery and opponent pace variation come from a seeded generator. The default seed is `240924`; use a query string such as `index.html?seed=42` to choose another, and restart to replay it.
