# Top-Down 2D Racing Game - Technical Specification

## 1. Class/Module Structure

```
src/
├── core/
│   ├── Game.ts              # Main game class, orchestrates everything
│   ├── GameLoop.ts          # Fixed timestep loop implementation
│   ├── RNG.ts               # Deterministic random number generator
│   └── Input.ts             # Input handling system
├── physics/
│   ├── Vector2.ts           # 2D vector math
│   ├── PhysicsBody.ts       # Physics component for entities
│   └── Collision.ts         # Collision detection utilities
├── entities/
│   ├── Entity.ts            # Base entity class
│   ├── Car.ts               # Base car class (player + AI)
│   ├── PlayerCar.ts         # Player-controlled car
│   ├── AICar.ts             # AI-controlled car
│   └── Track.ts             # Track representation
├── ai/
│   ├── Waypoint.ts          # Waypoint data structure
│   ├── WaypointFollower.ts  # AI navigation logic
│   └── AIController.ts      # AI decision making
├── systems/
│   ├── LapSystem.ts         # Lap counting and timing
│   ├── CollisionSystem.ts   # Collision resolution
│   └── HUDSystem.ts         # HUD rendering
└── utils/
    ├── Timer.ts             # High-precision timer
    └── MathUtils.ts         # Math utilities
```

---

## 2. Key Algorithms

### 2.1 Fixed Timestep Game Loop

```
Game Loop Algorithm:
-------------------
initialize:
    targetFPS = 60
    fixedTimeStep = 1.0 / targetFPS
    accumulator = 0
    previousTime = getCurrentTime()

mainLoop():
    currentTime = getCurrentTime()
    frameTime = currentTime - previousTime
    previousTime = currentTime
    accumulator += frameTime
    
    while accumulator >= fixedTimeStep:
        update(fixedTimeStep)  # Deterministic updates
        accumulator -= fixedTimeStep
    
    interpolate = accumulator / fixedTimeStep
    render(interpolate)  # Smooth rendering between updates
```

**Key Points:**
- Updates happen at fixed 60Hz (16.67ms)
- Rendering interpolates between previous and current state
- Ensures deterministic physics across different frame rates

---

### 2.2 Car Physics Algorithm

```
Car Physics Update:
------------------
For each car:
    1. Apply input forces:
       - Acceleration: F = engineForce * direction
       - Braking: F = -brakeForce * direction
       - Steering: angularVelocity = turnSpeed * input
    
    2. Apply friction/drag:
       - Linear drag: velocity *= (1 - linearDrag * dt)
       - Angular drag: angularVelocity *= (1 - angularDrag * dt)
    
    3. Update position:
       - velocity += acceleration * dt
       - position += velocity * dt
       - angle += angularVelocity * dt
    
    4. Clamp velocity to maxSpeed
```

**Physics Parameters:**
- Linear drag: 0.95 per frame
- Angular drag: 0.90 per frame
- Max speed: 300 units/second
- Acceleration: 150 units/second²
- Turn speed: 3.0 radians/second

---

### 2.3 Lap Detection Algorithm

```
Lap Detection:
-------------
Track representation: Closed loop of waypoints

For each car:
    1. Find closest waypoint on track
    2. If car crosses from waypoint N to N+1:
       - Increment lap counter if N is last waypoint
       - Update checkpoint to N+1
    
    3. Lap completion condition:
       - Car must pass all checkpoints in order
       - Last checkpoint = finish line
       - Crossing finish line from last checkpoint completes lap
```

**Data Structure:**
```
Track:
    waypoints: Array<Vector2>  // Ordered list of track points
    checkpointIndices: Array<number>  // Checkpoint waypoints
    
Car:
    currentCheckpoint: number  // Index of next checkpoint
    currentLap: number         // Current lap number
    lastWaypointIndex: number  // Last visited waypoint
```

---

### 2.4 Collision Resolution Algorithm

```
Impulse-Based Collision Resolution:
----------------------------------
For each colliding pair (A, B):

    1. Detect collision:
       - Circle-circle: distance < radiusA + radiusB
       - AABB-AABB: overlap on both axes
    
    2. Calculate collision normal:
       - n = normalize(positionA - positionB)
    
    3. Calculate relative velocity:
       - vRel = velocityA - velocityB
    
    4. Calculate impulse scalar:
       - j = -(1 + restitution) * (vRel · n) / (1/mA + 1/mB)
    
    5. Apply impulses:
       - velocityA += (j / mA) * n
       - velocityB -= (j / mB) * n
    
    6. Positional correction (prevent sinking):
       - overlap = (radiusA + radiusB) - distance
       - correction = overlap / (1/mA + 1/mB)
       - positionA += (correction / mA) * n
       - positionB -= (correction / mB) * n
```

**Parameters:**
- Restitution (bounciness): 0.3
- Mass: 1.0 for all cars

---

### 2.5 AI Waypoint Following Algorithm

```
Waypoint Following:
------------------
For each AI car:
    
    1. Find closest waypoint on track
    2. Look ahead N waypoints (e.g., 3-5)
    3. Calculate desired heading:
       - target = waypoints[(closest + lookAhead) % count]
       - desiredAngle = atan2(target.y - position.y, target.x - position.x)
    
    4. Steering:
       - angleDiff = normalizeAngle(desiredAngle - currentAngle)
       - steer = clamp(angleDiff * steeringGain, -1, 1)
    
    5. Throttle:
       - If turning sharply: reduce throttle
       - If approaching waypoint: brake slightly
       - Otherwise: full throttle
```

**AI Parameters:**
- Look ahead: 3-5 waypoints
- Steering gain: 2.0
- Reaction delay: 0.1-0.3 seconds (simulated)

---

## 3. Data Structures

### 3.1 Vector2
```
class Vector2 {
    x: number
    y: number
    
    add(v: Vector2): Vector2
    sub(v: Vector2): Vector2
    mul(s: number): Vector2
    dot(v: Vector2): number
    cross(v: Vector2): number
    normalize(): Vector2
    length(): number
    distance(v: Vector2): number
}
```

### 3.2 Car State
```
class CarState {
    position: Vector2
    velocity: Vector2
    angle: number        // Radians
    angularVelocity: number
    acceleration: Vector2
    speed: number        // Scalar speed
}
```

### 3.3 Track Representation
```
class Track {
    waypoints: Vector2[]     // Ordered track points
    trackWidth: number       // Width of track
    totalLength: number      // Approximate track length
    
    // Methods
    getClosestWaypoint(position: Vector2): number
    getWaypoint(index: number): Vector2
    getWaypointAngle(index: number): number
}
```

### 3.4 Waypoint
```
class Waypoint {
    position: Vector2
    angle: number           // Tangent angle at this point
    next: Waypoint | null   // Next waypoint in sequence
    prev: Waypoint | null   // Previous waypoint in sequence
}
```

---

## 4. Game Loop Architecture

### 4.1 Fixed Timestep Implementation

```
GameLoop.ts:
-----------
class GameLoop {
    private targetFPS: number = 60
    private fixedTimeStep: number = 1.0 / 60.0
    private accumulator: number = 0
    private previousTime: number = 0
    
    update(dt: number): void {
        // Physics, AI, game logic
        this.physicsSystem.update(dt)
        this.aiSystem.update(dt)
        this.lapSystem.update(dt)
    }
    
    render(interpolation: number): void {
        // Interpolated rendering
        this.hudSystem.render(interpolation)
        this.renderer.draw(interpolation)
    }
    
    run(): void {
        requestAnimationFrame((time) => {
            const frameTime = (time - this.previousTime) / 1000
            this.previousTime = time
            this.accumulator += frameTime
            
            while (this.accumulator >= this.fixedTimeStep) {
                this.update(this.fixedTimeStep)
                this.accumulator -= this.fixedTimeStep
            }
            
            const interpolation = this.accumulator / this.fixedTimeStep
            this.render(interpolation)
            
            requestAnimationFrame(this.run.bind(this))
        })
    }
}
```

---

## 5. Collision Detection & Resolution

### 5.1 Collision Detection

```
CollisionSystem.ts:
------------------
class CollisionSystem {
    // Circle-Circle collision
    checkCircleCircle(a: PhysicsBody, b: PhysicsBody): boolean {
        const dx = a.position.x - b.position.x
        const dy = a.position.y - b.position.y
        const distanceSq = dx*dx + dy*dy
        const radiusSum = a.radius + b.radius
        return distanceSq < radiusSum * radiusSum
    }
    
    // AABB-AABB collision
    checkAABB(a: PhysicsBody, b: PhysicsBody): boolean {
        return Math.abs(a.position.x - b.position.x) < (a.width + b.width) / 2 &&
               Math.abs(a.position.y - b.position.y) < (a.height + b.height) / 2
    }
    
    // Get all collisions
    getCollisions(): CollisionPair[] {
        const collisions: CollisionPair[] = []
        for (let i = 0; i < cars.length; i++) {
            for (let j = i + 1; j < cars.length; j++) {
                if (checkCollision(cars[i], cars[j])) {
                    collisions.push({ carA: cars[i], carB: cars[j] })
                }
            }
        }
        return collisions
    }
}
```

### 5.2 Impulse Resolution

```
resolveCollision(pair: CollisionPair): void {
    const a = pair.carA
    const b = pair.carB
    
    // Collision normal
    const dx = a.position.x - b.position.x
    const dy = a.position.y - b.position.y
    const distance = Math.sqrt(dx*dx + dy*dy)
    const nx = dx / distance
    const ny = dy / distance
    
    // Relative velocity
    const rvx = a.velocity.x - b.velocity.x
    const rvy = a.velocity.y - b.velocity.y
    
    // Velocity along normal
    const velAlongNormal = rvx * nx + rvy * ny
    
    // Do not resolve if velocities are separating
    if (velAlongNormal > 0) return
    
    // Restitution (bounciness)
    const e = 0.3
    
    // Impulse scalar
    let j = -(1 + e) * velAlongNormal
    j /= (1 / a.mass + 1 / b.mass)
    
    // Apply impulse
    const impulseX = j * nx
    const impulseY = j * ny
    
    a.velocity.x += impulseX / a.mass
    a.velocity.y += impulseY / a.mass
    b.velocity.x -= impulseX / b.mass
    b.velocity.y -= impulseY / b.mass
    
    // Positional correction
    const overlap = (a.radius + b.radius) - distance
    if (overlap > 0) {
        const correction = overlap / (1 / a.mass + 1 / b.mass)
        const cx = correction * nx
        const cy = correction * ny
        
        a.position.x += cx / a.mass
        a.position.y += cy / a.mass
        b.position.x -= cx / b.mass
        b.position.y -= cy / b.mass
    }
}
```

---

## 6. AI Waypoint Following Strategy

### 6.1 AI Controller

```
AIController.ts:
---------------
class AIController {
    private car: Car
    private track: Track
    private lookAhead: number = 4
    private steeringGain: number = 2.0
    
    update(dt: number): void {
        const closestIndex = this.track.getClosestWaypoint(this.car.position)
        const targetIndex = (closestIndex + this.lookAhead) % this.track.waypoints.length
        const target = this.track.waypoints[targetIndex]
        
        // Calculate desired angle
        const dx = target.x - this.car.position.x
        const dy = target.y - this.car.position.y
        const desiredAngle = Math.atan2(dy, dx)
        
        // Normalize angle difference
        let angleDiff = desiredAngle - this.car.angle
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI
        
        // Steering
        const steer = Math.max(-1, Math.min(1, angleDiff * this.steeringGain))
        this.car.steer(steer)
        
        // Throttle
        let throttle = 1.0
        if (Math.abs(angleDiff) > 0.5) {
            throttle = 0.5  // Reduce throttle when turning
        }
        if (this.car.speed > 200 && Math.abs(angleDiff) > 0.3) {
            throttle = 0.0  // Brake for sharp turns
        }
        this.car.accelerate(throttle)
    }
}
```

### 6.2 AI Difficulty Levels

```
AICar.ts:
--------
class AICar extends Car {
    private difficulty: number  // 0.0 to 1.0
    
    constructor(difficulty: number) {
        super()
        this.difficulty = difficulty
        
        // AI characteristics based on difficulty
        this.maxSpeed = 300 + difficulty * 50
        this.acceleration = 150 + difficulty * 25
        this.steeringGain = 2.0 + difficulty * 0.5
        this.reactionDelay = 0.3 - difficulty * 0.2
    }
}
```

---

## 7. Deterministic RNG

### 7.1 RNG Implementation

```
RNG.ts:
------
class RNG {
    private seed: number
    
    constructor(seed: number) {
        this.seed = seed
    }
    
    // Linear Congruential Generator
    next(): number {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7FFFFFFF
        return this.seed / 0x7FFFFFFF  // 0.0 to 1.0
    }
    
    nextRange(min: number, max: number): number {
        return min + this.next() * (max - min)
    }
    
    nextInt(min: number, max: number): number {
        return Math.floor(this.nextRange(min, max + 1))
    }
    
    // Reset for deterministic behavior
    reset(): void {
        this.seed = 12345  // Fixed initial seed
    }
}
```

---

## 8. HUD System

### 8.1 HUD Components

```
HUDSystem.ts:
------------
class HUDSystem {
    private playerCar: PlayerCar
    private allCars: Car[]
    
    render(): void {
        // Lap display
        ctx.fillText(`Lap: ${this.playerCar.currentLap}/${this.playerCar.totalLaps}`, 20, 40)
        
        // Time display
        const time = this.playerCar.lapTime.toFixed(3)
        ctx.fillText(`Time: ${time}`, 20, 70)
        
        // Position display
        const position = this.calculatePosition(this.playerCar)
        ctx.fillText(`Position: ${position}/${this.allCars.length}`, 20, 100)
        
        // Speed
        const speedMPH = (this.playerCar.speed * 0.6).toFixed(0)
        ctx.fillText(`Speed: ${speedMPH} MPH`, 20, 130)
        
        // Lap progress bar
        this.drawLapProgress()
    }
    
    calculatePosition(player: Car): number {
        // Sort cars by lap then checkpoint
        const sorted = [...this.allCars].sort((a, b) => {
            if (a.currentLap !== b.currentLap) {
                return b.currentLap - a.currentLap
            }
            return b.currentCheckpoint - a.currentCheckpoint
        })
        return sorted.indexOf(player) + 1
    }
}
```

---

## 9. File Structure Summary

```
index.ts                  # Entry point
config/
    gameConfig.ts         # Game configuration
    physicsConfig.ts      # Physics parameters
    aiConfig.ts           # AI parameters
entities/
    Car.ts                # Base car class
    PlayerCar.ts          # Player car
    AICar.ts              # AI car
systems/
    PhysicsSystem.ts      # Physics simulation
    AISystem.ts           # AI updates
    LapSystem.ts          # Lap tracking
    CollisionSystem.ts    # Collision detection
    HUDSystem.ts          # HUD rendering
utils/
    Vector2.ts            # 2D vector math
    RNG.ts                # Deterministic RNG
    Timer.ts              # High-precision timer
```

---

## 10. Configuration

### 10.1 Physics Configuration

```
physicsConfig.ts:
----------------
export const PHYSICS_CONFIG = {
    linearDrag: 0.95,
    angularDrag: 0.90,
    maxSpeed: 300,
    acceleration: 150,
    brakeForce: 300,
    turnSpeed: 3.0,
    restitution: 0.3,
    mass: 1.0,
    carRadius: 15
}
```

### 10.2 AI Configuration

```
aiConfig.ts:
-----------
export const AI_CONFIG = {
    lookAhead: 4,
    steeringGain: 2.0,
    reactionDelay: 0.2,
    difficulty: 0.7  // 0.0 to 1.0
}
```

---

## 11. Implementation Order

1. **Core infrastructure**: Vector2, RNG, Timer
2. **Physics system**: PhysicsBody, collision detection
3. **Entity system**: Entity base, Car base class
4. **Player car**: Input handling, car controls
5. **AI system**: Waypoint following, AI controller
6. **Track system**: Track representation, lap detection
7. **Game loop**: Fixed timestep implementation
8. **HUD system**: Rendering, statistics
9. **Integration**: Wire everything together

---

## 12. Testing Strategy

1. Unit tests for physics calculations
2. Unit tests for collision detection
3. Integration tests for AI waypoint following
4. Integration tests for lap detection
5. Visual verification of car behavior
6. Determinism verification (same seed = same results)