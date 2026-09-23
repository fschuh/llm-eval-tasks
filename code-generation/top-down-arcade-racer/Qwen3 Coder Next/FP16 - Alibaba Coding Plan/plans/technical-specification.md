# Technical Specification: Top-Down 2D Racing Prototype

## Overview

This document specifies the technical architecture for a top-down 2D racing game prototype built with pure JavaScript (ES6+). The prototype implements arcade-style physics, AI opponents with waypoint following, and a complete racing game loop.

## 1. Core Architecture

### 1.1 Game Loop

```
┌─────────────────────────────────────────────────────────────┐
│                        Game Loop                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │   Update Phase   │    │   Render Phase   │              │
│  │  (Fixed Timestep)│    │   (Variable)     │              │
│  └──────────────────┘    └──────────────────┘              │
│         │                        │                          │
│         ▼                        ▼                          │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  Physics Engine  │    │   Canvas Draw    │              │
│  │  (60 FPS fixed)  │    │   (60 FPS max)   │              │
│  └──────────────────┘    └──────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Fixed Timestep Implementation

```javascript
class Game {
  constructor() {
    this.fixedTimeStep = 1 / 60; // 60 Hz physics
    this.maxFrameTime = 0.25; // Prevent spiral of death
    this.accumulator = 0;
    this.currentTime = 0;
  }

  loop(timestamp) {
    const deltaTime = Math.min((timestamp - this.currentTime) / 1000, this.maxFrameTime);
    this.currentTime = timestamp;
    this.accumulator += deltaTime;

    while (this.accumulator >= this.fixedTimeStep) {
      this.update(this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
    }

    this.render(this.accumulator / this.fixedTimeStep);
  }
}
```

## 2. Class Specifications

### 2.1 Vector2 - 2D Vector Operations

**File:** `src/math/Vector2.js`

```javascript
class Vector2 {
  constructor(x = 0, y = 0);
  
  // Properties
  x: number;
  y: number;
  
  // Methods
  clone(): Vector2;
  add(v: Vector2): Vector2;
  subtract(v: Vector2): Vector2;
  multiply(scalar: number): Vector2;
  divide(scalar: number): Vector2;
  magnitude(): number;
  magnitudeSquared(): number;
  normalize(): Vector2;
  dot(v: Vector2): number;
  cross(v: Vector2): number; // 2D cross product returns scalar
  distance(v: Vector2): number;
  distanceSquared(v: Vector2): number;
  rotate(angle: number): Vector2;
  toString(): string;
}
```

**Key Operations:**
- Vector arithmetic (add, subtract, multiply, divide)
- Magnitude and normalization
- Dot product for projection
- Cross product for 2D (returns scalar z-component)
- Rotation for steering calculations

### 2.2 RNG - Deterministic Random Number Generator

**File:** `src/math/RNG.js`

```javascript
class RNG {
  constructor(seed = 12345);
  
  // Properties
  seed: number;
  
  // Methods
  next(): number; // Returns [0, 1)
  nextRange(min: number, max: number): number;
  nextInt(min: number, max: number): number;
  reset(): void;
}
```

**Implementation:** Linear Congruential Generator (LCG)
```
state = (state * 1664525 + 1013904223) mod 2^32
return state / 2^32
```

### 2.3 Car - Base Car Class

**File:** `src/entities/Car.js`

```javascript
class Car {
  constructor(position: Vector2, angle: number, config: CarConfig);
  
  // Properties
  position: Vector2;
  velocity: Vector2;
  acceleration: Vector2;
  angle: number; // Radians
  angularVelocity: number; // Radians per second
  speed: number; // Scalar speed
  width: number;
  height: number;
  color: string;
  
  // Physics config
  maxSpeed: number;
  acceleration: number;
  braking: number;
  friction: number;
  turnSpeed: number;
  driftFactor: number;
  
  // Lap tracking
  currentWaypointIndex: number;
  lapCount: number;
  totalDistance: number;
  
  // Methods
  update(dt: number): void;
  applyForce(force: Vector2): void;
  applyTorque(torque: number): void;
  steer(direction: number, dt: number): void; // -1 left, 1 right
  accelerate(amount: number): void;
  brake(amount: number): void;
  getBounds(): Rectangle;
  getCenter(): Vector2;
  isOnTrack(): boolean;
}
```

**CarConfig Interface:**
```typescript
interface CarConfig {
  position: Vector2;
  angle: number;
  maxSpeed: number;
  acceleration: number;
  braking: number;
  friction: number;
  turnSpeed: number;
  driftFactor: number;
  width: number;
  height: number;
  color: string;
}
```

**Physics Model:**
```
velocity += acceleration * dt
velocity *= (1 - friction * dt)
position += velocity * dt

angularVelocity += torque * dt
angle += angularVelocity * dt
angle = normalizeAngle(angle)

speed = velocity.magnitude()
```

### 2.4 PlayerCar - Player-Controlled Car

**File:** `src/entities/PlayerCar.js`

```javascript
class PlayerCar extends Car {
  constructor(position: Vector2, angle: number);
  
  // Input state
  input: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  };
  
  // Methods
  update(dt: number): void;
  handleInput(): void;
}
```

**Input Handling:**
- Up/Down: Accelerate/brake
- Left/Right: Steer
- Input state is updated by Game class before Car.update()

### 2.5 AICar - AI-Controlled Car

**File:** `src/entities/AICar.js`

```javascript
class AICar extends Car {
  constructor(position: Vector2, angle: number, track: Track, config: CarConfig);
  
  // AI properties
  track: Track;
  targetWaypointIndex: number;
  waypointOffset: number; // Distance from center line
  aiSpeedMultiplier: number; // 0.8-0.95 for difficulty
  
  // Methods
  update(dt: number): void;
  findNextWaypoint(): void;
  calculateSteering(): number; // -1 to 1
  calculateAcceleration(): number; // 0 to 1
  getWaypointPosition(index: number): Vector2;
}
```

**Waypoint Following Algorithm:**
```
1. Find closest waypoint to current position
2. If within threshold, advance to next waypoint
3. Calculate desired angle toward waypoint
4. Steer toward desired angle
5. Accelerate based on distance to waypoint
```

### 2.6 Track - Track Definition

**File:** `src/track/Track.js`

```javascript
class Track {
  constructor(waypoints: Vector2[], width: number);
  
  // Properties
  waypoints: Vector2[];
  width: number;
  totalLapDistance: number;
  
  // Methods
  getClosestWaypoint(position: Vector2): number;
  getWaypointPosition(index: number): Vector2;
  isOnTrack(position: Vector2): boolean;
  checkLapCompletion(car: Car): void;
  getLapDistance(car: Car): number;
  getTotalDistance(): number;
}
```

**Track Representation:**
- Waypoints define center line
- Track width is uniform
- Lap detection based on waypoint progression

### 2.7 Collision - Collision Detection and Resolution

**File:** `src/collision/Collision.js`

```javascript
class Collision {
  static checkCircleCircle(a: Circle, b: Circle): CollisionResult;
  static checkRectangleRectangle(a: Rectangle, b: Rectangle): CollisionResult;
  static checkCircleRectangle(circle: Circle, rect: Rectangle): CollisionResult;
  static resolveImpulse(car1: Car, car2: Car): void;
}

class CollisionResult {
  constructor(
    public collided: boolean,
    public normal: Vector2,
    public penetration: number,
    public point: Vector2
  );
}
```

**Collision Detection:**
- Circle-Circle: Distance between centers < sum of radii
- Rectangle-Rectangle: AABB overlap test
- Circle-Rectangle: Closest point on rectangle to circle center

**Impulse Resolution:**
```
relativeVelocity = v1 - v2
impulse = -(1 + restitution) * (relativeVelocity · normal) / (1/m1 + 1/m2)
v1 += impulse * normal / m1
v2 -= impulse * normal / m2
```

### 2.8 HUD - Heads-Up Display

**File:** `src/ui/HUD.js`

```javascript
class HUD {
  constructor(canvas: HTMLCanvasElement);
  
  // Properties
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  
  // Methods
  update(lap: number, time: number, position: number, cars: Car[]): void;
  render(): void;
  formatTime(seconds: number): string;
  getPositionText(position: number): string;
}
```

**HUD Display:**
```
┌─────────────────────────────────────────┐
│  Lap: 1/3    Time: 00:23.456    Pos: 1/4 │
└─────────────────────────────────────────┘
```

### 2.9 Game - Main Game Controller

**File:** `src/Game.js`

```javascript
class Game {
  constructor(canvas: HTMLCanvasElement);
  
  // Properties
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  
  // Game state
  isRunning: boolean;
  isPaused: boolean;
  startTime: number;
  elapsedTime: number;
  
  // Entities
  player: PlayerCar;
  aiCars: AICar[];
  track: Track;
  hud: HUD;
  
  // Physics
  fixedTimeStep: number;
  accumulator: number;
  currentTime: number;
  
  // Methods
  init(): void;
  start(): void;
  stop(): void;
  loop(timestamp: number): void;
  update(dt: number): void;
  render(interpolation: number): void;
  handleInput(): void;
  checkCollisions(): void;
  checkLaps(): void;
}
```

## 3. Physics Model Details

### 3.1 Car Physics Parameters

```javascript
const CAR_CONFIG = {
  // Dimensions
  width: 24,
  height: 44,
  
  // Performance
  maxSpeed: 350,        // pixels/second
  acceleration: 150,    // pixels/second²
  braking: 300,         // pixels/second²
  friction: 0.98,       // per frame multiplier
  
  // Handling
  turnSpeed: 3.5,       // radians/second
  driftFactor: 0.92,    // 1.0 = no drift, 0.0 = ice
  
  // AI parameters
  aiSpeedMultiplier: 0.92, // 8% slower than player
  aiReactionDelay: 0.1,   // seconds
};
```

### 3.2 Steering Model

```javascript
// Steering is based on speed
// At rest, turn radius is infinite (can't turn)
// As speed increases, turn radius decreases

turnRate = maxTurnRate * (speed / maxSpeed)
turnRate = Math.max(turnRate, minTurnRate) // Minimum turn rate at low speed
```

### 3.3 Drift Model

```javascript
// Velocity is split into forward and lateral components
// Drift factor determines how much lateral velocity persists

forwardVelocity = velocity.dot(forwardDirection)
lateralVelocity = velocity.cross(forwardDirection)

// Apply drift
lateralVelocity *= driftFactor
velocity = forwardDirection * forwardVelocity + perpendicular * lateralVelocity
```

## 4. AI Waypoint System

### 4.1 Waypoint Structure

```
Track: [W0, W1, W2, ..., Wn]
       ↓     ↓     ↓         ↓
      Start  Lap1  Lap2    Finish
```

### 4.2 AI Behavior

```javascript
class AICar {
  update(dt) {
    // 1. Find target waypoint
    this.findNextWaypoint();
    
    // 2. Calculate steering
    const steering = this.calculateSteering();
    this.steer(steering, dt);
    
    // 3. Calculate acceleration
    const acceleration = this.calculateAcceleration();
    this.accelerate(acceleration);
    
    // 4. Apply physics
    super.update(dt);
  }
  
  calculateSteering() {
    const target = this.getWaypointPosition(this.targetWaypointIndex);
    const toTarget = target.subtract(this.position);
    const desiredAngle = Math.atan2(toTarget.y, toTarget.x);
    
    // Calculate angle difference
    let angleDiff = desiredAngle - this.angle;
    angleDiff = normalizeAngle(angleDiff);
    
    // Steer toward desired angle
    return Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 1);
  }
  
  calculateAcceleration() {
    const distanceToWaypoint = this.position.distance(
      this.getWaypointPosition(this.targetWaypointIndex)
    );
    
    // Slow down when approaching waypoint
    if (distanceToWaypoint < 100) {
      return 0.3;
    }
    
    // Full throttle otherwise
    return 1.0;
  }
}
```

## 5. Lap Detection System

### 5.1 Lap Counting Logic

```javascript
class Car {
  update(dt) {
    // ... physics update ...
    
    // Check lap completion
    if (this.currentWaypointIndex === 0 && this.lapCount > 0) {
      this.lapCount++;
    }
  }
}

class Track {
  checkLapCompletion(car) {
    const nextIndex = (car.currentWaypointIndex + 1) % this.waypoints.length;
    const currentWaypoint = this.waypoints[car.currentWaypointIndex];
    const nextWaypoint = this.waypoints[nextIndex];
    
    // Check if car has crossed the line between waypoints
    const toCar = car.position.subtract(currentWaypoint);
    const toNext = nextWaypoint.subtract(currentWaypoint);
    const projection = toCar.dot(toNext) / toNext.magnitudeSquared();
    
    if (projection >= 1) {
      car.currentWaypointIndex = nextIndex;
    }
  }
}
```

### 5.2 Lap Progress

```
Lap 1: W0 → W1 → W2 → ... → Wn → W0 (lap complete)
Lap 2: W0 → W1 → W2 → ... → Wn → W0 (lap complete)
Lap 3: W0 → W1 → W2 → ... → Wn → W0 (race complete)
```

## 6. Collision Response

### 6.1 Collision Types

1. **Car-Car Collision**
   - Elastic collision with impulse resolution
   - Apply forces to both cars
   - Reduce speed of both cars

2. **Car-Track Collision**
   - Check if car is on track
   - Apply off-track friction (higher than on-track)
   - Slow car down significantly

### 6.2 Impulse Resolution

```javascript
class Collision {
  static resolveImpulse(car1, car2) {
    const normal = car1.position.subtract(car2.position).normalize();
    const relativeVelocity = car1.velocity.subtract(car2.velocity);
    const velocityAlongNormal = relativeVelocity.dot(normal);
    
    // Do not resolve if velocities are separating
    if (velocityAlongNormal > 0) return;
    
    // Calculate restitution (bounciness)
    const restitution = 0.3;
    
    // Calculate impulse scalar
    let impulseScalar = -(1 + restitution) * velocityAlongNormal;
    impulseScalar /= (1 / car1.mass + 1 / car2.mass);
    
    // Apply impulse
    const impulse = normal.multiply(impulseScalar);
    car1.velocity = car1.velocity.add(impulse.divide(car1.mass));
    car2.velocity = car2.velocity.subtract(impulse.divide(car2.mass));
    
    // Positional correction (prevent sinking)
    const percent = 0.8; // Penetration percentage to correct
    const slop = 0.01; // Threshold
    const penetration = this.calculatePenetration(car1, car2);
    
    if (penetration > slop) {
      const correction = normal.multiply(penetration * percent);
      car1.position = car1.position.add(correction.divide(2));
      car2.position = car2.position.subtract(correction.divide(2));
    }
  }
}
```

## 7. Rendering System

### 7.1 Canvas Rendering

```javascript
class Game {
  render(interpolation) {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // Draw track
    this.drawTrack();
    
    // Draw cars (interpolated for smooth animation)
    this.drawCars(interpolation);
    
    // Draw HUD
    this.hud.render();
  }
  
  drawCars(interpolation) {
    // Interpolate position between previous and current
    const prevPosition = car.previousPosition;
    const currentPosition = car.position;
    const interpolatedPosition = prevPosition.add(
      currentPosition.subtract(prevPosition).multiply(interpolation)
    );
    
    // Draw car at interpolated position
    this.ctx.save();
    this.ctx.translate(interpolatedPosition.x, interpolatedPosition.y);
    this.ctx.rotate(car.angle);
    // ... draw car body ...
    this.ctx.restore();
  }
}
```

### 7.2 Track Rendering

```javascript
class Track {
  draw(ctx) {
    // Draw track border
    ctx.beginPath();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = this.width + 20;
    ctx.lineJoin = 'round';
    
    // Draw center line
    ctx.moveTo(this.waypoints[0].x, this.waypoints[0].y);
    for (let i = 1; i < this.waypoints.length; i++) {
      ctx.lineTo(this.waypoints[i].x, this.waypoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    
    // Draw track surface
    ctx.beginPath();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = this.width;
    ctx.lineJoin = 'round';
    ctx.moveTo(this.waypoints[0].x, this.waypoints[0].y);
    for (let i = 1; i < this.waypoints.length; i++) {
      ctx.lineTo(this.waypoints[i].x, this.waypoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    
    // Draw start/finish line
    const start = this.waypoints[0];
    const next = this.waypoints[1];
    const angle = Math.atan2(next.y - start.y, next.x - start.x);
    
    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-5, -this.width/2, 10, this.width);
    ctx.restore();
  }
}
```

## 8. Input System

### 8.1 Input Handling

```javascript
class Game {
  init() {
    // Input event listeners
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }
  
  handleKeyDown(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.player.input.up = true; break;
      case 'KeyS': case 'ArrowDown': this.player.input.down = true; break;
      case 'KeyA': case 'ArrowLeft': this.player.input.left = true; break;
      case 'KeyD': case 'ArrowRight': this.player.input.right = true; break;
      case 'Space': this.togglePause(); break;
    }
  }
  
  handleKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.player.input.up = false; break;
      case 'KeyS': case 'ArrowDown': this.player.input.down = false; break;
      case 'KeyA': case 'ArrowLeft': this.player.input.left = false; break;
      case 'KeyD': case 'ArrowRight': this.player.input.right = false; break;
    }
  }
}
```

## 9. File Structure

```
src/
├── math/
│   ├── Vector2.js
│   └── RNG.js
├── entities/
│   ├── Car.js
│   ├── PlayerCar.js
│   └── AICar.js
├── track/
│   └── Track.js
├── collision/
│   └── Collision.js
├── ui/
│   └── HUD.js
├── Game.js
└── main.js
```

## 10. Configuration

### 10.1 Game Constants

```javascript
const CONFIG = {
  // Physics
  physicsFPS: 60,
  physicsTimestep: 1 / 60,
  
  // Rendering
  renderFPS: 60,
  
  // Car specifications
  carWidth: 24,
  carHeight: 44,
  
  // Track specifications
  trackWidth: 100,
  numLaps: 3,
  
  // AI specifications
  numAI: 3,
  aiSpeedMultiplier: 0.92,
  
  // Collision
  restitution: 0.3, // Bounciness
  offTrackFriction: 0.90, // Stronger friction off-track
};
```

## 11. State Management

### 11.1 Game States

```javascript
const GameState = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  FINISHED: 'finished'
};
```

### 11.2 Race States

```
MENU → PLAYING → FINISHED
       ↑    ↓
       └────┘ (pause/unpause)
```

## 12. Performance Considerations

### 12.1 Optimization Strategies

1. **Object Pooling**: Reuse car objects to reduce GC
2. **Spatial Partitioning**: Use grid-based collision for many objects
3. **Batch Rendering**: Draw similar objects together
4. **Fixed Timestep**: Prevents physics instability
5. **Interpolation**: Smooth rendering without physics overhead

### 12.2 Memory Management

- Reuse Vector2 objects where possible
- Pre-allocate arrays for cars and waypoints
- Clean up event listeners on game end

## 13. Testing Strategy

### 13.1 Unit Tests

- Vector2 operations
- RNG determinism
- Collision detection
- Lap counting logic

### 13.2 Integration Tests

- Car physics simulation
- AI waypoint following
- Multi-car collision
- Full race completion

## 14. Future Enhancements

1. **Track Editor**: Allow creating custom tracks
2. **Sound Effects**: Engine sounds, collision sounds
3. **Visual Effects**: Smoke, tire marks, particle effects
4. **Multiplayer**: Network synchronization
5. **Replay System**: Record and playback races
6. **Different Track Types**: Oval, road course, dirt track

## 15. Implementation Checklist

- [ ] Set up project structure and module system
- [ ] Implement Vector2 class with all operations
- [ ] Implement RNG with deterministic seed
- [ ] Implement Car base class with physics
- [ ] Implement PlayerCar with input handling
- [ ] Implement AICar with waypoint following
- [ ] Implement Track with waypoint system
- [ ] Implement Collision detection and resolution
- [ ] Implement HUD with lap/time/position
- [ ] Implement Game controller with fixed timestep loop
- [ ] Create main.js entry point
- [ ] Test and debug all components
- [ ] Optimize performance
- [ ] Polish visual appearance
