# Technical Specification: Top-Down 2D Arcade Racer Prototype

## 1. Fixed Timestep Game Loop
To ensure consistent physics simulation across different hardware, the game will use a fixed timestep loop with an accumulator.

### Implementation Logic
- **Target Update Rate**: 60 Hz (dt = 1/60s ≈ 16.67ms).
- **Accumulator**: Stores leftover time from the previous frame.
- **Main Loop**:
  1. Calculate `elapsedTime` since the last frame.
  2. Add `elapsedTime` to `accumulator`.
  3. While `accumulator >= dt`:
     - Update game state (physics, AI, logic) using fixed `dt`.
     - Subtract `dt` from `accumulator`.
  4. Render the scene (optionally using `alpha = accumulator / dt` for state interpolation to achieve buttery smooth motion).

---

## 2. Deterministic RNG
A seedable Pseudo-Random Number Generator (PRNG) ensures race conditions or track generation can be replicated.

### Implementation: Mulberry32
```javascript
function sfc32(a, b, c, d) {
    return function() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
      var t = (a + b | 0) + d | 0;
      d = d + 1 | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = (c << 21 | c >>> 11);
      c = c + t | 0;
      return (t >>> 0) / 4294967296;
    }
}
```

---

## 3. Car Physics Model (Arcade/High-Grip)
The arcade model focuses on responsive controls where the car's direction of travel is tightly coupled to its heading.

### Data Structures
- **Position**: `Vector2(x, y)`
- **Velocity**: `Scalar` (current speed along heading)
- **Heading**: `Rotation` (radians)
- **Constants**: `ACCELERATION`, `BRAKING`, `DRAG` (air resistance), `FRICTION` (rolling resistance), `STEER_SPEED`, `MAX_SPEED`.

### Physics Math (Per Step)
1.  **Input Handling**: 
    - `accelerationInput` (0 to 1)
    - `steeringInput` (-1 to 1)
2.  **Velocity Update**:
    - `velocity += accelerationInput * ACCELERATION * dt`
    - `velocity -= DRAG * velocity * velocity * dt` (Quadratic drag)
    - `velocity -= FRICTION * velocity * dt` (Linear friction)
3.  **Steering**:
    - `heading += steeringInput * STEER_SPEED * (velocity / MAX_SPEED) * dt`
    - *Note: Steering effectiveness scales with speed to prevent turning while stationary.*
4.  **Position Update**:
    - `position.x += cos(heading) * velocity * dt`
    - `position.y += sin(heading) * velocity * dt`

---

## 4. Collision System
A simple impulse-based system using circles for cars and line segments for track boundaries.

### Car vs. Car (Circle-Circle)
1.  **Detection**: `distance(carA, carB) < (radiusA + radiusB)`.
2.  **Resolution**:
    - Calculate collision normal (unit vector between centers).
    - Move cars apart to stop overlapping (Static resolution).
    - **Impulse**: Reflect velocities along the normal with a `RESTITUTION` coefficient (0.5 for arcade bounce).

### Car vs. Track (Circle-Line)
1.  **Detection**: Distance from car center to nearest point on line segment `< radius`.
2.  **Resolution**: 
    - Find the closest point on the segment.
    - Push car away along the normal from the point to the center.
    - Zero out velocity component heading into the wall.

---

## 5. AI Strategy
AI cars follow a list of waypoints defining the "racing line".

### Behavior Logic
1.  **Targeting**: Select the next waypoint in the sequence. If within `N` pixels, switch to the next.
2.  **Steering**: 
    - Calculate `targetAngle` to the waypoint.
    - `angleDiff = normalizeAngle(targetAngle - currentHeading)`.
    - `steeringInput = clamp(angleDiff * STEER_SENSITIVITY, -1, 1)`.
3.  **Speed Control**:
    - Maintain `MAX_AI_SPEED`. 
    - If `abs(angleDiff)` is high (tight turn), reduce throttle or apply light braking.

---

## 6. Track & Race Logic
### Track Representation
- **Boundaries**: Two arrays of points (`innerBoundary`, `outerBoundary`) defining the track edges.
- **Checkpoints**: Line segments placed across the track at intervals.

### Race State
- **Lap Detection**: 
  - Keep track of the last `checkpointID` passed.
  - A lap is completed only if `checkpointID` sequence is correct (e.g., must pass 1, 2, 3 before crossing the Finish Line 0).
- **Position Calculation**: 
  - `score = (lapsCompleted * totalWaypoints) + nextWaypointIndex`.
  - Subtract distance to the next waypoint from `score` for fine-grained ranking.

---

## 7. HUD Design
The HUD will display the following state variables:
- **Lap**: `currentLap / totalLaps`
- **Time**: `totalElapsedSeconds` (formatted as mm:ss:ms)
- **Position**: `currentRank` (1st, 2nd, etc.)
- **Speed**: `floor(velocity * scalingFactor)`

---

## Implementation Notes for Code Mode
- Use `HTML5 Canvas` for 2D rendering.
- Maintain a clean separation between `PhysicsEngine`, `InputHandler`, `Renderer`, and `RaceManager`.
- The `deterministic RNG` seed should be set at the start of the race to ensure identical AI behavior for debugging.
