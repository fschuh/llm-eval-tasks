# Top-Down Racing Game

A deterministic top-down 2D racing game prototype with physics-based vehicle simulation and AI opponents.

## Features

- **Deterministic Game Loop**: Fixed timestep physics for reproducible results
- **Physics-Based Vehicles**: Realistic handling with friction, acceleration, and steering
- **AI Opponents**: Three difficulty levels with pathfinding
- **Cross-Platform**: Runs in both browser and Node.js environments
- **Command-Line Configuration**: Customizable seed and deterministic mode

## Installation

```bash
npm install
```

## Building

### Production Build

```bash
npm run build
```

This creates a bundled `dist/bundle.js` file optimized for production.

### Development Build (with watching)

```bash
npm run build:dev
```

## Running the Game

### In Browser

Open `index.html` in a web browser. Controls:
- **Arrow Keys** or **WASD**: Drive the vehicle
- **Up/ArrowUp/W**: Accelerate
- **Down/ArrowDown/S**: Brake
- **Left/ArrowLeft/A**: Turn Left
- **Right/ArrowRight/D**: Turn Right

### In Node.js (Headless Mode)

```bash
node dist/bundle.js
```

### With Custom Seed

```bash
node dist/bundle.js --seed=12345
```

### Deterministic Mode

```bash
node dist/bundle.js --deterministic
```

### Headless Mode

```bash
node dist/bundle.js --headless
```

## Command-Line Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `--seed=<number>` | Set a specific random seed | `--seed=42` |
| `--deterministic` | Enable deterministic mode verification | `--deterministic` |
| `--headless` | Run without rendering (for testing) | `--headless` |

## Project Structure

```
/
├── dist/                # Built files
│   └── bundle.js        # Bundled application
├── src/                 # Source files
│   ├── main.js          # Game entry point
│   ├── core/            # Core game systems
│   ├── physics/         # Physics simulation
│   ├── ai/              # AI opponents
│   ├── render/          # Rendering
│   └── utils/           # Utilities
├── test/                # Test files
├── package.json         # Project configuration
├── webpack.config.js    # Bundler configuration
└── index.html           # Browser entry point
```

## Technical Details

### Deterministic Physics

The game uses a fixed timestep game loop to ensure deterministic behavior:
- Fixed timestep: 1/60 seconds
- Maximum frame skip: 5
- Physics updates are synchronized with the fixed timestep

### Random Number Generation

The game uses a pseudo-random number generator (PRNG) seeded either:
- Randomly on startup (default)
- From command line with `--seed=<number>`

### Build System

The project uses Webpack for bundling:
- Targets both web and Node.js environments
- Deterministic chunk IDs for reproducible builds
- UMD module format for maximum compatibility

## Testing

Run existing tests:

```bash
# Test AI behavior
node test/ai_test.js

# Test deterministic physics
node test/deterministic_test.js

# Test HUD rendering
node test/hud_test.js
```

## License

MIT
