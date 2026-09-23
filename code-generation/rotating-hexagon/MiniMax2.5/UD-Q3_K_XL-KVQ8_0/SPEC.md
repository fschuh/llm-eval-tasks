# Bouncing Balls in Spinning Hexagon - Specification Document

## 1. Project Overview

### 1.1 Project Description

This project implements a physics-based simulation of multiple balls bouncing inside a rotating hexagonal container. The simulation features realistic physics including gravity, friction, and elastic collisions between balls and the rotating hexagon walls. The hexagon rotates continuously, transferring angular momentum to the balls upon collision and creating dynamic, unpredictable ball trajectories.

### 1.2 Core Functionality

The application renders a spinning hexagonal boundary on an HTML5 canvas, with multiple balls moving inside under the influence of gravity. Each ball bounces off the rotating walls and collides with other balls, with energy loss during each collision to simulate realistic physics behavior. The rotation of the hexagon adds complexity to collision detection and response, as the wall angles change continuously.

### 1.3 Target Users

This project is suitable for:
- Educational purposes demonstrating 2D physics simulations
- Visual entertainment and interactive art installations
- Developers learning canvas-based animations and physics engines

---

## 2. Technical Requirements

### 2.1 Rendering System

**Canvas Configuration:**
- HTML5 Canvas element with 2D rendering context
- Canvas dimensions: 800x800 pixels (responsive scaling optional)
- Background color: `#0a0a0f` (deep dark blue-black)
- Rendering method: `requestAnimationFrame` for smooth 60fps animation
- Double buffering not required (canvas handles this internally)

### 2.2 Physics Engine Requirements

**Core Physics Features:**
- Gravity simulation with configurable constant
- Friction/drag coefficient for velocity damping
- Elastic collision response with energy retention
- Mass calculation based on ball radius
- Velocity and acceleration vectors for each ball

**Collision Detection:**
- Ball-to-wall collision: Line segment intersection with rotating hexagon edges
- Ball-to-ball collision: Circle-to-circle intersection detection
- Collision response: Impulse-based resolution with momentum conservation

### 2.3 Hexagon Specifications

**Geometric Properties:**
- Regular hexagon with 6 equal sides
- Hexagon radius (center to vertex): 350 pixels
- Hexagon centered at canvas center (400, 400)
- Initial rotation angle: 0 radians
- Rotation direction: Counter-clockwise (positive angular velocity)

### 2.4 Ball Specifications

**Quantity and Properties:**
- Number of balls: 10 (configurable between 8-12)
- Ball radius range: 15-35 pixels (randomized)
- Ball mass: Proportional to radius squared (area-based)
- Initial positions: Randomly distributed inside hexagon
- Initial velocities: Random direction, magnitude 50-150 pixels/second

---

## 3. Visual Design

### 3.1 Canvas Layout

**Dimensions and Positioning:**
- Canvas width: 800 pixels
- Canvas height: 800 pixels
- Center point: (400, 400)
- Hexagon inscribed within canvas with 50-pixel margin

### 3.2 Background Design

**Background Appearance:**
- Primary color: `#0a0a0f` (deep space black)
- Optional subtle gradient: Radial gradient from `#12121a` center to `#0a0a0f` edges
- No grid or pattern (clean minimal look)

### 3.3 Hexagon Visual Design

**Stroke Properties:**
- Stroke color: `#00ffaa` (bright cyan-green)
- Line width: 3 pixels
- Line style: Solid with rounded line caps
- Optional glow effect: 10px blur shadow in stroke color at 50% opacity

**Fill Properties:**
- No fill (transparent interior)
- Optional subtle inner glow: 20px blur in `#00ffaa` at 10% opacity

### 3.4 Ball Visual Design

**Color Palette:**
- Primary colors array: `['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#a8d8ea']`
- Each ball assigned random color from palette
- Optional: Slight color variation per ball (hue shift ±10 degrees)

**Ball Rendering:**
- Fill: Solid color from palette
- Stroke: None (clean look)
- Optional: Subtle inner highlight (white at 20% opacity, offset top-left)
- Optional: Drop shadow (2px offset, black at 30% opacity)

### 3.5 Animation Smoothness

**Frame Rate:**
- Target: 60 frames per second
- Method: `requestAnimationFrame` callback
- Delta time: Calculated for frame-independent physics (optional)
- Animation loop: Continuous until page closed

---

## 4. Physics Parameters

### 4.1 Gravity Configuration

**Gravity Constant:**
- Value: 300 pixels/second² (downward)
- Direction: Positive Y-axis (downward in canvas coordinates)
- Applied to: All balls each frame
- Formula: `velocity.y += gravity * deltaTime`

### 4.2 Friction Configuration

**Friction Coefficients:**
- Air resistance: 0.995 (velocity multiplier per frame)
- Wall friction: 0.98 (tangential velocity reduction on wall collision)
- Ball friction: 0.99 (velocity reduction on ball-ball collision)
- Formula: `velocity *= frictionCoefficient`

### 4.3 Bounce Elasticity

**Energy Retention:**
- Wall bounce elasticity: 0.85 (85% energy retained)
- Ball bounce elasticity: 0.90 (90% energy retained)
- Combined collision: Product of both elasticities
- Minimum velocity threshold: 10 pixels/second (below this, velocity set to 0)

### 4.4 Ball Properties

**Mass Calculation:**
- Formula: `mass = radius * radius * density`
- Density: 1 (simplified, unitless)
- Mass range: 225-1225 (for radius 15-35)
- Used in: Collision response calculations

**Velocity Limits:**
- Maximum velocity: 800 pixels/second (prevent tunneling)
- Minimum velocity: 0 (balls can rest)
- Initial velocity range: 50-150 pixels/second

---

## 5. Functionality

### 5.1 Hexagon Rotation

**Rotation Speed:**
- Angular velocity: 0.5 radians/second (configurable)
- Direction: Counter-clockwise (positive)
- Rotation formula: `angle += angularVelocity * deltaTime`
- Range: Unlimited continuous rotation

**Direction Control:**
- Default: Counter-clockwise
- Optional: Can be reversed by negating angular velocity

### 5.2 Ball Initialization

**Position Generation:**
- Algorithm: Rejection sampling
- Method: Generate random point, check if inside hexagon, retry if outside
- Hexagon interior test: Use ray casting algorithm or distance to edges
- Minimum distance from walls: ball.radius + 10 pixels

**Velocity Initialization:**
- Random angle: 0 to 2π radians
- Random magnitude: 50-150 pixels/second
- Optional: Ensure minimum distance from other balls to prevent initial overlap

### 5.3 Collision Detection Algorithms

**Ball-to-Wall Collision:**
1. For each hexagon edge (line segment):
   - Calculate closest point on segment to ball center
   - Calculate distance from ball center to closest point
   - If distance < ball.radius, collision detected
2. Collision response:
   - Calculate wall normal (perpendicular to edge, pointing inward)
   - Reflect velocity vector across normal
   - Apply elasticity and friction coefficients
   - Add rotational velocity component from hexagon spin

**Ball-to-Ball Collision:**
1. For each ball pair:
   - Calculate distance between centers
   - If distance < sum of radii, collision detected
2. Collision response:
   - Calculate collision normal (vector from ball A to ball B)
   - Calculate relative velocity
   - Apply impulse based on masses and elasticity
   - Separate overlapping balls

### 5.4 Frame Update Loop

**Update Sequence (per frame):**
1. Clear canvas
2. Update hexagon rotation angle
3. For each ball:
   - Apply gravity to velocity
   - Apply air friction to velocity
   - Update position based on velocity
   - Check and resolve wall collisions
   - Check and resolve ball-ball collisions
   - Clamp velocity to maximum
4. Render hexagon
5. Render all balls
6. Request next frame

---

## 6. File Structure

### 6.1 Single HTML File Architecture

**File Name:** `index.html`

**Structure:**
```
index.html
├── <!DOCTYPE html>
├── <html>
├── <head>
│   ├── <title> Bouncing Balls in Spinning Hexagon </title>
│   ├── <style> (embedded CSS)
│   └── </head>
├── <body>
│   ├── <canvas> element
│   └── <script> (embedded JavaScript)
│       ├── Configuration constants
│       ├── Utility functions
│       ├── Ball class
│       ├── Hexagon class
│       ├── Physics engine
│       ├── Rendering functions
│       └── Animation loop
└── </html>
```

### 6.2 Code Organization

**CSS Section:**
- Reset margins and padding
- Center canvas on page
- Set body background color
- Optional: Add subtle page background pattern

**JavaScript Sections:**

1. **Configuration Constants:**
   - Canvas dimensions
   - Colors (background, hexagon, balls)
   - Physics parameters (gravity, friction, elasticity)
   - Hexagon properties (radius, rotation speed)
   - Ball properties (count, radius range, velocity range)

2. **Utility Functions:**
   - Random number generation
   - Distance calculations
   - Vector operations (add, subtract, multiply, dot product, magnitude)

3. **Ball Class:**
   - Properties: x, y, vx, vy, radius, mass, color
   - Methods: update(), draw(), checkWallCollision(), checkBallCollision()

4. **Hexagon Class:**
   - Properties: centerX, centerY, radius, angle, rotationSpeed
   - Methods: getVertices(), getEdges(), update(), draw()

5. **Physics Engine:**
   - Gravity application
   - Friction application
   - Wall collision detection and response
   - Ball-ball collision detection and response

6. **Rendering Functions:**
   - clearCanvas()
   - drawHexagon()
   - drawBall()
   - drawAll()

7. **Animation Loop:**
   - init() function
   - animate() function with requestAnimationFrame

---

## 7. Implementation Notes

### 7.1 Performance Considerations

- Use spatial partitioning (optional) for ball-ball collision if ball count > 20
- Cache hexagon vertices calculation (only recompute when angle changes)
- Use requestAnimationFrame instead of setInterval for better performance
- Consider using typed arrays for vector operations if performance issues arise

### 7.2 Edge Cases

- Balls escaping hexagon: Implement boundary clamping
- Balls stuck in corners: Add small random impulse if velocity near zero for too long
- High-speed tunneling: Implement continuous collision detection if needed
- Multiple simultaneous collisions: Process all collisions before updating positions

### 7.3 Optional Enhancements

- Trail effect: Store previous positions and draw fading trail
- Sound effects: Audio feedback on collisions (optional)
- User controls: Sliders for gravity, friction, rotation speed
- Pause/resume: Spacebar to pause animation
- Reset button: Reinitialize all balls

---

## 8. Acceptance Criteria

### 8.1 Functional Requirements

- [ ] Hexagon rotates smoothly and continuously
- [ ] All balls remain inside the hexagon at all times
- [ ] Balls fall downward due to gravity
- [ ] Balls bounce off walls with visible energy loss
- [ ] Balls collide with each other and respond realistically
- [ ] Animation runs at smooth 60fps
- [ ] No visual glitches or flickering

### 8.2 Visual Requirements

- [ ] Canvas displays with correct background color
- [ ] Hexagon renders with correct stroke color and width
- [ ] Balls render with varied colors from palette
- [ ] Animation is smooth without stuttering

### 8.3 Physics Requirements

- [ ] Gravity pulls balls downward
- [ ] Balls lose energy on each collision (don't bounce forever)
- [ ] Wall collisions transfer some rotational momentum
- [ ] Ball-ball collisions conserve momentum (approximately)
- [ ] Balls eventually settle if gravity is strong enough

---

## 9. Configuration Reference

### Quick Configuration Table

| Parameter | Value | Unit |
|-----------|-------|------|
| Canvas Width | 800 | pixels |
| Canvas Height | 800 | pixels |
| Hexagon Radius | 350 | pixels |
| Hexagon Stroke | #00ffaa | color |
| Hexagon Line Width | 3 | pixels |
| Ball Count | 10 | balls |
| Ball Radius Min | 15 | pixels |
| Ball Radius Max | 35 | pixels |
| Gravity | 300 | px/s² |
| Air Friction | 0.995 | coefficient |
| Wall Elasticity | 0.85 | coefficient |
| Ball Elasticity | 0.90 | coefficient |
| Hexagon Rotation | 0.5 | rad/s |

---

*Specification Version: 1.0*
*Created for: Bouncing Balls in Spinning Hexagon Project*
*Implementation Target: Single HTML File with Embedded JavaScript*
