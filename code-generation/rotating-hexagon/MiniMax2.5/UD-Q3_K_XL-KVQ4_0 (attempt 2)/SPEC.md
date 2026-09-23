# Rotating Hexagon Physics Simulation - Specification

## 1. Project Overview

### Project Name
**Rotating Hexagon Ball Physics Simulator**

### Project Type
Interactive HTML5 Canvas Physics Simulation

### Core Functionality
A real-time physics simulation featuring multiple balls bouncing inside a continuously rotating hexagon container. The simulation implements realistic physics including gravity, friction, wall collisions with rotating surface velocity, and ball-to-ball collision detection with proper momentum transfer.

### Target Users
- Physics enthusiasts and educators
- Web developers learning canvas animations
- Anyone interested in interactive physics simulations

---

## 2. Visual Design Specification

### Canvas Setup
- **Canvas Size**: 800x800 pixels (responsive scaling for smaller screens)
- **Background**: Deep space gradient - `#0a0a1a` to `#1a1a3a` (radial gradient from center)
- **Border**: Subtle glow effect around canvas - `0 0 30px rgba(100, 200, 255, 0.3)`

### Hexagon Design

#### Geometry
- **Shape**: Regular hexagon (6 equal sides)
- **Radius**: 350 pixels (center to vertex)
- **Center Position**: Canvas center (400, 400)
- **Line Width**: 4 pixels
- **Stroke Color**: Cyan gradient - `#00ffff` to `#00aaff`
- **Fill**: Semi-transparent `rgba(0, 50, 100, 0.1)` with subtle inner glow

#### Visual Effects
- **Outer Glow**: Box shadow `0 0 20px rgba(0, 255, 255, 0.5)`
- **Vertex Markers**: Small glowing dots at each vertex (radius 6px, color `#00ffff`)
- **Rotation Indicator**: Subtle pulsing effect on one vertex

### Ball Design

#### Ball Properties
- **Count**: 8 balls (configurable)
- **Radius Range**: 15-35 pixels (randomized per ball)
- **Colors**: Vibrant neon palette with glow effects
  - Ball 1: `#ff3366` (Hot Pink)
  - Ball 2: `#33ff66` (Lime Green)
  - Ball 3: `#3366ff` (Electric Blue)
  - Ball 4: `#ffff33` (Yellow)
  - Ball 5: `#ff33ff` (Magenta)
  - Ball 6: `#33ffff` (Cyan)
  - Ball 7: `#ff9933` (Orange)
  - Ball 8: `#ffffff` (White)

#### Ball Visual Effects
- **Fill**: Radial gradient from lighter center to darker edge
- **Stroke**: 2px darker shade of ball color
- **Glow**: Shadow blur 15px with ball color at 50% opacity
- **Trail Effect**: Optional fading trail showing recent positions (5-10 frames)

### UI Elements

#### Control Panel (Top-Right Corner)
- **Background**: `rgba(0, 0, 0, 0.7)` with rounded corners (10px radius)
- **Position**: 20px from top-right corner
- **Font**: 'Orbitron' or 'Rajdhani' (Google Fonts) - futuristic style
- **Text Color**: `#00ffff`
- **Controls**:
  - Gravity slider (0 to 2, default 0.5)
  - Friction slider (0.9 to 1.0, default 0.995)
  - Bounce elasticity slider (0.5 to 1.0, default 0.85)
  - Rotation speed slider (0.5 to 3.0, default 1.0)
  - Ball count slider (3 to 15, default 8)
  - Reset button
  - Pause/Play button

#### Info Display (Bottom-Left)
- **FPS Counter**: Real-time frame rate display
- **Ball Count**: Current number of balls
- **Simulation Time**: Elapsed time since start

---

## 3. Physics Parameters Specification

### Core Physics Constants

#### Gravity
- **Default Value**: 0.5 pixels/frame²
- **Range**: 0 to 2.0 pixels/frame²
- **Direction**: Positive Y (downward)
- **Implementation**: Velocity.y += gravity each frame

#### Friction (Air Resistance)
- **Default Value**: 0.995
- **Range**: 0.900 to 1.000
- **Application**: Applied to both X and Y velocity each frame
- **Formula**: velocity *= friction

#### Bounce Elasticity (Restitution)
- **Default Value**: 0.85
- **Range**: 0.5 to 1.0
- **Wall Collision**: velocity = -velocity * elasticity
- **Ball Collision**: Uses conservation of momentum with elasticity factor

#### Ball-to-Ball Collision
- **Detection Method**: Distance between centers < sum of radii
- **Response**: Elastic collision with mass proportional to radius²
- **Minimum Separation**: Balls pushed apart to prevent overlap

### Wall Collision Physics

#### Rotating Wall Velocity
- **Calculation**: Wall velocity = angularVelocity × perpendicular distance from center
- **Direction**: Tangent to wall surface (perpendicular to radius)
- **Effect on Ball**: Added to ball velocity upon collision
- **Formula**: 
  ```
  wallVelocityX = -angularVelocity * (ballY - centerY)
  wallVelocityY = angularVelocity * (ballX - centerX)
  combinedVelocity = ballVelocity + wallVelocity * transferFactor
  ```

#### Collision Response
- **Reflection**: Velocity reflected across wall normal
- **Energy Transfer**: Portion of wall velocity transferred to ball
- **Transfer Factor**: 0.3 (30% of wall velocity added to ball)
- **Friction on Wall**: Additional tangential friction applied (coefficient 0.98)

### Ball Properties

#### Mass Calculation
- **Formula**: mass = radius² (area-proportional)
- **Range**: 225 to 1225 (for radius 15-35)

#### Initial Velocities
- **Speed Range**: 2-8 pixels/frame (randomized)
- **Direction**: Random angle (0 to 2π)
- **Initial Position**: Random point inside hexagon (ensuring no overlap with walls)

---

## 4. Animation Details Specification

### Hexagon Rotation

#### Rotation Speed
- **Default**: 1.0 radians/second
- **Range**: 0.5 to 3.0 radians/second
- **Direction**: Clockwise (positive angle increase)
- **Implementation**: angle += rotationSpeed * deltaTime

#### Frame Rate
- **Target**: 60 FPS (frames per second)
- **Method**: requestAnimationFrame with deltaTime calculation
- **Minimum**: 30 FPS (simulation continues but may appear slower)
- **Delta Time**: Used for consistent physics regardless of frame rate

### Animation Loop

#### Update Order
1. Calculate deltaTime
2. Update hexagon rotation angle
3. For each ball:
   - Apply gravity
   - Apply air friction
   - Update position (velocity × deltaTime)
   - Check wall collisions
   - Check ball-to-ball collisions
4. Render all elements
5. Request next frame

#### Rendering
- **Method**: HTML5 Canvas 2D context
- **Clear**: Clear entire canvas each frame
- **Draw Order**:
  1. Background gradient
  2. Hexagon (with glow effects)
  3. Balls (with glow and optional trails)
  4. UI overlay

### Performance Considerations

#### Optimization Techniques
- **Spatial Partitioning**: Grid-based for ball-to-ball collision (optional for <20 balls)
- **Object Pooling**: Pre-allocated ball objects
- **Canvas Optimization**: Minimize state changes, batch similar operations

#### Limits
- **Maximum Balls**: 20 (performance constraint)
- **Minimum Balls**: 3
- **Default Balls**: 8

---

## 5. Technical Implementation Specification

### Technology Stack
- **Language**: Vanilla JavaScript (ES6+)
- **Rendering**: HTML5 Canvas 2D API
- **No External Dependencies**: Pure implementation (except Google Fonts)

### File Structure
```
rotating-hexagon-simulation/
├── index.html          # Main HTML file
├── css/
│   └── styles.css    # Styling for canvas and UI
├── js/
│   ├── main.js        # Entry point and game loop
│   ├── physics.js    # Physics calculations
│   ├── hexagon.js      # Hexagon rendering and rotation
│   ├── ball.js        # Ball class and rendering
│   └── ui.js          # UI controls and display
└── SPEC.md           # This specification
```

### Core Classes/Modules

#### Hexagon Class
```javascript
class Hexagon {
  constructor(centerX, centerY, radius)
  update(deltaTime)           // Rotate by deltaTime
  getWallPositions()          // Return array of 6 wall segments
  getWallNormal(index)          // Return normal vector for wall
  getWallVelocity(ballPos)     // Calculate wall velocity at position
  render(ctx)                  // Draw hexagon with effects
}
```

#### Ball Class
```javascript
class Ball {
  constructor(x, y, radius, color)
  update(gravity, friction)   // Apply physics
  checkWallCollision(hexagon, elasticity)
  checkBallCollision(otherBall, elasticity)
  render(ctx)                // Draw ball with glow
}
```

#### Physics Module
```javascript
// Collision detection
function circleToCircleCollision(ball1, ball2)
function pointToLineDistance(point, lineStart, lineEnd)

// Collision response
function resolveBallCollision(ball1, ball2, elasticity)
function resolveWallCollision(ball, wallNormal, wallVelocity, elasticity)

// Utility
function distance(x1, y1, x2, y2)
function normalize(vector)
function dotProduct(v1, v2)
```

### Key Algorithms

#### Wall Collision Detection
1. For each of 6 hexagon edges:
   - Calculate closest point on edge to ball center
   - If distance < ball radius, collision detected
2. Calculate collision normal (perpendicular to edge)
3. Reflect velocity across normal
4. Add wall velocity component (for rotating walls)
5. Apply elasticity coefficient

#### Ball-to-Ball Collision
1. Check all pairs (O(n²) but acceptable for <20 balls)
2. If distance < sum of radii:
   - Calculate collision normal
   - Separate balls (move apart by overlap amount)
   - Calculate relative velocity
   - Apply impulse based on masses
   - Apply elasticity coefficient

---

## 6. Acceptance Criteria

### Visual Criteria
- [ ] Hexagon is clearly visible with cyan glow effect
- [ ] Hexagon rotates smoothly and continuously
- [ ] All 8 balls are visible with distinct colors
- [ ] Each ball has a glowing effect matching its color
- [ ] Background has space-themed gradient
- [ ] UI controls are visible and functional
- [ ] FPS counter displays real-time frame rate

### Physics Criteria
- [ ] Balls fall downward due to gravity
- [ ] Balls slow down over time due to air friction
- [ ] Balls bounce off hexagon walls
- [ ] Bounce height decreases with each collision (energy loss)
- [ ] Balls gain/lose velocity based on wall rotation direction
- [ ] Ball-to-ball collisions transfer momentum realistically
- [ ] Balls don't pass through walls or each other
- [ ] No jittering or physics instability

### Animation Criteria
- [ ] Animation runs at smooth 60 FPS
- [ ] Rotation speed is consistent
- [ ] No visual stuttering or lag
- [ ] Delta time properly accounts for frame rate variations

### Interaction Criteria
- [ ] Gravity slider changes ball behavior in real-time
- [ ] Friction slider affects ball deceleration
- [ ] Elasticity slider changes bounce behavior
- [ ] Rotation speed slider changes hexagon rotation
- [ ] Ball count slider adds/removes balls
- [ ] Reset button resets simulation to initial state
- [ ] Pause/Play button toggles animation

### Performance Criteria
- [ ] Simulation handles 8 balls without lag
- [ ] Memory usage remains stable over time
- [ ] No memory leaks during extended runtime

---

## 7. Implementation Notes

### Browser Compatibility
- Target modern browsers (Chrome, Firefox, Safari, Edge)
- Use ES6 features (classes, arrow functions, const/let)

### Responsive Design
- Scale canvas for smaller screens
- Maintain aspect ratio
- Minimum canvas size: 400x400 pixels

### Testing Checklist
1. Initial load - all elements visible
2. Physics simulation runs smoothly
3. All sliders affect simulation correctly
4. Reset returns to initial state
5. Pause/Play works correctly
6. No console errors during operation

### Future Enhancements (Optional)
- Sound effects on collision
- Ball color blending on collision
- Particle effects on impact
- Multiple hexagon layers
- Different polygon shapes (octagon, decagon)
