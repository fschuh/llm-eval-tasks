# Bouncing Balls in Spinning Hexagon - Specification

## 1. Project Overview
- **Project name**: Rotating Hexagon Ball Physics
- **Type**: Interactive physics simulation (single HTML file with embedded JS)
- **Core functionality**: Multiple balls bounce inside a rotating hexagon container with realistic physics including gravity, friction, and ball-to-ball collisions
- **Target users**: Anyone wanting to see a physics demo

## 2. Visual & Rendering Specification

### Scene Setup
- **Canvas**: Full-window 2D canvas with dark background (#0a0a0f)
- **Hexagon**: Centered, rotating at constant angular velocity (0.5 rad/s)
- **Hexagon size**: 300px radius
- **Hexagon stroke**: 4px, cyan (#00ffff) with glow effect

### Balls
- **Count**: 8 balls
- **Radius**: Random between 15-35px
- **Colors**: Random vibrant colors from palette
- **Visual**: Solid fill with subtle shadow for depth

### Visual Style
- **Background**: Dark with subtle radial gradient
- **Hexagon**: Neon glow effect using shadow blur
- **Balls**: Slight 3D effect with highlight

## 3. Physics Specification

### Gravity
- **Acceleration**: 500 pixels/second² (downward)

### Friction
- **Air friction**: 0.99 velocity multiplier per frame
- **Wall bounce damping**: 0.8 (energy loss on wall collision)
- **Ball bounce damping**: 0.9 (energy loss on ball collision)

### Collision Detection
- **Ball-to-wall**: Line-segment intersection with rotating hexagon edges
- **Ball-to-ball**: Circle-circle collision with proper momentum transfer

### Hexagon Rotation
- **Angular velocity**: 0.5 radians/second (clockwise)
- **Vertices calculated dynamically based on current rotation angle**

## 4. Interaction Specification

### User Controls
- **Click**: Add new ball at click position with random velocity
- **Spacebar**: Pause/resume simulation

### Initial State
- Balls spawn at random positions inside hexagon with random velocities

## 5. Technical Implementation

### Animation
- **Method**: requestAnimationFrame with delta time
- **Physics substeps**: 4 substeps per frame for stability

### Collision Response
- **Wall collision**: Reflect velocity vector across wall normal, apply damping
- **Ball collision**: Elastic collision formula with mass proportional to radius²

## 6. Acceptance Criteria

1. ✓ Hexagon rotates smoothly at constant speed
2. ✓ Balls fall due to gravity
3. ✓ Balls bounce off rotating hexagon walls realistically
4. ✓ Balls bounce off each other with momentum conservation
5. ✓ Friction gradually slows balls
6. ✓ Click adds new balls
7. ✓ Spacebar pauses/resumes
8. ✓ No balls escape the hexagon
