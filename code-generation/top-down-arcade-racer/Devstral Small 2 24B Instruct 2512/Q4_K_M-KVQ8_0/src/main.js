/**
 * Main game entry point
 *
 * This module initializes and runs the game.
 */

const GameLoop = require('./core/gameLoop')
const { createPRNG } = require('./core/rng')
const { GAME_LOOP } = require('./core/constants')
const Vehicle = require('./physics/vehicle')
const { LapDetector, TrackBoundary } = require('./physics/track')
const { WaypointGraph } = require('./ai/waypoints')
const AIOpponent = require('./ai/opponent')
const GameState = require('./game/gameState')
const Renderer = require('./render/renderer')

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {};
  
  // Parse arguments
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--seed=')) {
      args.seed = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--deterministic')) {
      args.deterministic = true;
    } else if (arg.startsWith('--headless')) {
      args.headless = true;
    }
  });
  
  return args;
}

/**
 * Initialize the game
 */
function initGame() {
  console.log('Initializing game...')

  // Parse command line arguments
  const args = parseArgs()
  
  // Create deterministic RNG with optional seed
  const rng = args.seed ? createPRNG(args.seed) : createPRNG()
  console.log(`Game started with seed: ${rng.seed}`)
  
  // Verify deterministic mode if requested
  if (args.deterministic) {
    console.log('Running in deterministic mode')
  }

  // Create game state
  const gameState = new GameState()

  // Create player vehicle
  const player = new Vehicle(100, 100, 0)
  gameState.setPlayer(player)

  // Create simple track boundaries (rectangle)
  const trackBoundaries = [
    { x: 0, y: 0 },
    { x: 800, y: 0 },
    { x: 800, y: 600 },
    { x: 0, y: 600 }
  ]
  const track = new TrackBoundary([trackBoundaries])
  gameState.setTrack(track)

  // Create checkpoints for lap detection
  const checkpoints = [
    { x: 100, y: 100 },
    { x: 700, y: 100 },
    { x: 700, y: 500 },
    { x: 100, y: 500 }
  ]
  const lapDetector = new LapDetector(checkpoints)
  gameState.setLapDetector(lapDetector)

  // Create waypoint graph for AI
  const trackPoints = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 300, y: 100 },
    { x: 400, y: 100 },
    { x: 500, y: 100 },
    { x: 600, y: 100 },
    { x: 700, y: 100 },
    { x: 700, y: 200 },
    { x: 700, y: 300 },
    { x: 700, y: 400 },
    { x: 700, y: 500 },
    { x: 600, y: 500 },
    { x: 500, y: 500 },
    { x: 400, y: 500 },
    { x: 300, y: 500 },
    { x: 200, y: 500 },
    { x: 100, y: 500 },
    { x: 100, y: 400 },
    { x: 100, y: 300 },
    { x: 100, y: 200 }
  ]
  const waypointGraph = WaypointGraph.createFromTrackPoints(trackPoints)

  // Create AI opponents with different difficulty levels
  const difficulties = ['easy', 'medium', 'hard']
  for (let i = 0; i < 3; i++) {
    const opponentVehicle = new Vehicle(
      200 + i * 50,
      200 + i * 50,
      Math.PI / 4 + i
    )
    const opponent = new AIOpponent(opponentVehicle, waypointGraph, checkpoints, difficulties[i])
    gameState.addOpponent(opponent)
    
    // Initialize A* pathfinder for this opponent
    const gridWidth = 40
    const gridHeight = 30
    const cellSize = 20
    opponent.initPathfinder(gridWidth, gridHeight, cellSize)
  }

  // Create renderer
  const renderer = new Renderer()

  // Create game loop
  const gameLoop = new GameLoop(GAME_LOOP.FIXED_TIMESTEP, GAME_LOOP.MAX_FRAME_SKIP)

  // Start the game
  gameLoop.start(
    (deltaTime) => {
      // Update game state
      gameState.update(deltaTime)
    },
    (alpha) => {
      // Render game state
      renderer.render(alpha)
      
      // Render HUD
      renderer.drawHUD(gameState)
    }
  )

  console.log('Game started successfully!')
  console.log(`Fixed timestep: ${GAME_LOOP.FIXED_TIMESTEP}s`)
  console.log(`Target FPS: ${GAME_LOOP.TARGET_FPS}`)
}

// Start the game when the script is loaded
if (typeof window === 'undefined') {
  // Running in Node.js - start immediately
  initGame()
} else {
  // Running in browser - wait for DOM to be ready
  window.addEventListener('DOMContentLoaded', () => {
    // Set up canvas
    const canvas = document.getElementById('gameCanvas')
    if (canvas) {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      
      // Set up keyboard input
      const keys = {}
      window.addEventListener('keydown', (e) => {
        keys[e.code] = true
      })
      window.addEventListener('keyup', (e) => {
        keys[e.code] = false
      })
      
      // Pass keys to game state
      const gameState = new GameState()
      gameState.setInputHandler((action) => {
        switch (action) {
          case 'accelerate':
            return keys['ArrowUp'] || keys['KeyW']
          case 'brake':
            return keys['ArrowDown'] || keys['KeyS']
          case 'turnLeft':
            return keys['ArrowLeft'] || keys['KeyA']
          case 'turnRight':
            return keys['ArrowRight'] || keys['KeyD']
        }
        return false
      })
    }
    
    initGame()
  })
}

module.exports = {
  initGame
}
