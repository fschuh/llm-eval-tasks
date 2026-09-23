# Top-Down 2D Racing Prototype Specification

## Project Overview
- **Project Name**: Top-Down Arcade Racer
- **Type**: Browser-based 2D racing game
- **Core Functionality**: A top-down racing game with player controls, AI opponents, lap tracking, and collision physics
- **Target Users**: Casual gamers, racing game enthusiasts

## Technical Constraints
- Deterministic RNG seed (seed: 42)
- Fixed timestep: 60 FPS (16.67ms per frame)
- No external physics engines - custom implementation only
- Single HTML file with embedded JavaScript

## UI/UX Specification

### Layout Structure
- **Canvas**: Full viewport, responsive to window size
- **HUD Overlay**: Top-left corner for race info
- **Start Screen**: Centered modal with race info

### Visual Design
- **Color Palette**:
  - Background/Track: #2d5a27 (grass green)
  - Track surface: #404040 (asphalt gray)
  - Track borders: #ffffff (white lines)
  - Player car: #e63946 (red)
  - AI car 1: #457b9d (blue)
  - AI car 2: #2a9d8f (teal)
  - AI car 3: #f4a261 (orange)
  - HUD background: rgba(0, 0, 0, 0.7)
  - HUD text: #ffffff
  - Waypoint markers: #ffd700 (gold)

- **Typography**:
  - Font: "Courier New", monospace
  - HUD font size: 16px
  - Title font size: 32px

- **Visual Effects**:
  - Car rotation based on heading
  - Skid marks on hard turns (optional)
  - Simple particle effects on collision

### Components
- **Cars**: Rectangle shapes with direction indicator
- **Track**: Oval/circuit with waypoints
- **HUD Elements**:
  - Current lap number
  - Race time (elapsed)
  - Current position (1st, 2nd, 3rd, 4th)
  - Speed indicator

## Functionality Specification

### Core Features

#### 1. Player Car Controls
- **Acceleration**: W key or Up arrow - increases velocity
- **Braking/Reverse**: S key or Down arrow - decreases velocity/reverses
- **Steering**: A/D keys or Left/Right arrows - rotates car heading
- **Physics**: 
  - Max speed: 300 units/sec
  - Acceleration: 150 units/sec²
  - Braking: 200 units/sec²
  - Turn rate: 3.5 rad/sec (scales with speed)
  - Friction/drag coefficient: 0.98

#### 2. AI Opponents (3 cars)
- **Navigation**: Waypoint following system
- **Behavior**:
  - Follow predefined waypoints on track
  - Steer toward next waypoint
  - Adjust speed based on corner proximity
  - Simple collision avoidance
- **Difficulty**: Slightly varied speeds for variety

#### 3. Track & Waypoints
- **Track Shape**: Oval circuit with curves
- **Waypoints**: 12-16 waypoints defining the racing line
- **Track Width**: 80 units

#### 4. Lap Detection
- **Checkpoint System**: Must pass through waypoints in order
- **Lap Complete**: When all waypoints passed and finish line crossed
- **Lap Counter**: Display current lap (1/3, 2/3, 3/3)

#### 5. Collision Response
- **Car-to-Car**: 
  - Impulse-based resolution
  - Mass-based response (all cars equal mass)
  - Bounce coefficient: 0.5
- **Car-to-Track**:
  - Boundary collision with bounce
  - Push back onto track

#### 6. Race Logic
- **Start**: 3-second countdown
- **Duration**: 3 laps
- **Finish**: Race ends when player completes 3 laps
- **Position Calculation**: Based on lap progress and distance to next waypoint

### HUD Display
- **Position**: Top-left, 20px margin
- **Content**:
  - "LAP: X/3"
  - "TIME: MM:SS.ms"
  - "POS: X/4"
  - "SPEED: XXX"

## Acceptance Criteria
1. Player can control car with keyboard (WASD/arrows)
2. AI cars navigate track autonomously using waypoints
3. Lap counter increments correctly when completing a lap
4. Collision between cars produces impulse-based response
5. HUD displays real-time lap, time, position, and speed
6. Game runs at consistent 60 FPS with fixed timestep
7. RNG is deterministic (same behavior on reload)
8. Race ends after 3 laps with final position shown
