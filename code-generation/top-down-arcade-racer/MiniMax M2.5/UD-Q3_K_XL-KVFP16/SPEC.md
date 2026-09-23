# Top-Down 2D Racing Prototype Specification

## 1. Project Overview

**Project Name:** Top-Down Arcade Racer  
**Type:** Browser-based 2D racing game  
**Core Functionality:** A top-down racing game with player controls, AI opponents, lap counting, and real-time HUD  
**Target Users:** Casual gamers, developers learning game development

---

## 2. Technical Constraints

- **Single HTML file** with embedded JavaScript and CSS
- **Deterministic RNG seed:** Fixed seed value (e.g., 42) for reproducible AI behavior
- **Fixed timestep:** 60 FPS (16.67ms per frame) using deltaTime clamping
- **No external physics engines:** Custom physics implementation only

---

## 3. UI/UX Specification

### Layout Structure

- **Canvas:** Full viewport width/height, centered
- **HUD Overlay:** Top-left corner for race info, top-right for position
- **Start Screen:** Centered modal with game title and "Press SPACE to Start"

### Visual Design

**Color Palette:**
- Background (track): `#1a1a2e` (dark navy)
- Track surface: `#16213e` (darker blue)
- Track borders: `#e94560` (coral red)
- Player car: `#00ff88` (neon green)
- AI cars: `#ff6b6b`, `#4ecdc4`, `#ffe66d` (red, teal, yellow)
- Waypoint markers: `#ffffff` with 50% opacity
- HUD text: `#ffffff` (white)
- HUD background: `rgba(0, 0, 0, 0.7)`

**Typography:**
- Font family: `"Courier New", monospace` (retro arcade feel)
- HUD font size: 18px
- Title font size: 48px

**Visual Effects:**
- Car rotation follows velocity direction
- Subtle shadow under cars
- Track has inner/outer borders for visibility

### Components

**Player Car:**
- Rectangle: 30x18 pixels
- Visible rotation indicator (front marked)

**AI Cars (3 opponents):**
- Same dimensions as player
- Different colors for identification

**Track:**
- Oval/circuit shape defined by waypoints
- Inner and outer boundaries
- Start/finish line visible

**HUD Elements:**
- Lap counter: "LAP: X/3"
- Race time: "TIME: MM:SS.ms"
- Position: "POS: X/4"
- Speed indicator: "SPEED: XXX"

---

## 4. Functionality Specification

### Core Features

#### 4.1 Game Loop & Architecture
- Fixed timestep: 16.67ms (60 FPS)
- DeltaTime clamping: max 50ms to prevent spiral of death
- Game states: START, RACING, FINISHED

#### 4.2 RNG System
- Custom seeded random number generator (LCG algorithm)
- Seed value: 42 (fixed)
- Used for AI decision-making variations

#### 4.3 Player Car Physics
- **Acceleration:** Forward thrust when UP key held
- **Braking:** Reverse thrust when DOWN key held
- **Steering:** Left/Right rotation when moving
- **Friction:** Gradual velocity decay when no input
- **Max speed:** Configurable (e.g., 300 units/sec)
- **Turn rate:** Speed-dependent (slower = tighter turns)

**Physics Constants:**
```
ACCELERATION: 200 units/sec²
BRAKING: 150 units/sec²
FRICTION: 0.98 (velocity multiplier per frame)
MAX_SPEED: 300 units/sec
TURN_RATE: 3.0 radians/sec (at max speed)
```

#### 4.4 AI Opponents
- **Waypoint following:** AI cars navigate through track waypoints
- **Steering behavior:** Smooth interpolation toward next waypoint
- **Speed variation:** Each AI has slightly different max speed (280-320 range)
- **Rubber banding:** Slight speed boost when behind, slowdown when far ahead (optional)

**AI Behavior:**
- Target next waypoint with lookahead
- Steer toward waypoint with smoothing
- Accelerate on straights, brake on sharp turns
- Collision avoidance with other cars

#### 4.5 Track System
- Defined by array of waypoints forming a closed loop
- Track width: 120 pixels
- Inner/outer boundary collision detection
- Start/finish line at first waypoint

**Default Track:** Oval circuit with 12 waypoints

#### 4.6 Lap Detection
- Check when car crosses start/finish line
- Must complete full lap (pass through all waypoints in order)
- Lap counter increments on valid lap completion
- Race ends after 3 laps

#### 4.7 Collision Response
- **Car-to-car:** Impulse-based resolution
  - Calculate relative velocity
  - Apply impulse to separate cars
  - Bounce factor: 0.5
- **Car-to-boundary:** Push back onto track, reduce speed

**Collision Constants:**
```
BOUNCE_FACTOR: 0.5
MIN_COLLISION_VELOCITY: 10 units/sec
```

#### 4.8 HUD System
- Real-time updates every frame
- Position calculation based on lap + waypoint progress
- Time displayed as MM:SS.ms format

### User Interactions

- **Arrow Keys / WASD:** Control player car
- **SPACE:** Start race / Restart after finish
- **ESC:** Pause (optional)

### Edge Cases

- Car stuck against wall: Apply small random impulse
- AI stuck: Waypoint proximity threshold to skip
- Multiple cars crossing finish simultaneously: Use waypoint index tiebreaker

---

## 5. Acceptance Criteria

### Visual Checkpoints
- [ ] Canvas renders at full viewport size
- [ ] Track is visible with clear boundaries
- [ ] All 4 cars (1 player + 3 AI) visible with distinct colors
- [ ] HUD displays lap, time, position, speed
- [ ] Start screen shows before race begins

### Functional Checkpoints
- [ ] Player car accelerates, brakes, and steers correctly
- [ ] AI cars navigate track using waypoints
- [ ] Lap counter increments on valid lap completion
- [ ] Position updates in real-time
- [ ] Collision response works for car-to-car and car-to-boundary
- [ ] Race ends after 3 laps with final position displayed
- [ ] Game can be restarted with SPACE

### Technical Checkpoints
- [ ] Fixed timestep maintains consistent physics
- [ ] RNG produces deterministic results (same AI behavior each run)
- [ ] No external physics libraries used
- [ ] Single HTML file with all code embedded

---

## 6. File Structure

```
/home/fschuh/Dev/LLM/llm_experiments/CodeGenerationEvals/TopDownArcadeRacer/MiniMax2.5/UD-Q3_K_XL-KVFP16/
├── SPEC.md (this file)
└── index.html (complete game)
```

---

## 7. Implementation Notes

### Waypoint System
- Track defined as array of {x, y} points
- Cars track current target waypoint index
- When distance to waypoint < threshold, advance to next
- Lap detection: waypoint index wraps from last to first

### Position Calculation
- Primary: Total laps completed
- Secondary: Current waypoint index
- Tertiary: Distance to next waypoint

### Physics Integration
```
velocity += acceleration * dt
velocity *= friction
position += velocity * dt
rotation = atan2(velocity.y, velocity.x)
```

### Collision Detection
- AABB for car-to-car (simplified)
- Point-in-polygon for boundary detection
- Response: velocity reflection + position correction
