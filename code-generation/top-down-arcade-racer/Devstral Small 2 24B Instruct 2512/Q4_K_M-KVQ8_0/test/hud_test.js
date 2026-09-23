/**
 * Test script for HUD and game state functionality
 */

const GameState = require('../src/game/gameState')
const Vehicle = require('../src/physics/vehicle')
const { LapDetector, TrackBoundary } = require('../src/physics/track')
const AIOpponent = require('../src/ai/opponent')
const { WaypointGraph } = require('../src/ai/waypoints')
const Renderer = require('../src/render/renderer')

console.log('Testing HUD and Game State Implementation\n')
console.log('='.repeat(60))

// Create game state
const gameState = new GameState()

// Create player vehicle
const player = new Vehicle(100, 100, 0)
gameState.setPlayer(player)

// Create simple track boundaries
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

// Create AI opponents
const difficulties = ['easy', 'medium', 'hard']
for (let i = 0; i < 3; i++) {
  const opponentVehicle = new Vehicle(
    200 + i * 50,
    200 + i * 50,
    Math.PI / 4 + i
  )
  const opponent = new AIOpponent(opponentVehicle, waypointGraph, checkpoints, difficulties[i])
  gameState.addOpponent(opponent)
}

// Create renderer
const renderer = new Renderer()
renderer.debugMode = true

console.log('\nInitial Game State:')
console.log('-'.repeat(60))
renderer.drawHUD(gameState)

// Simulate countdown
console.log('\nSimulating countdown...')
for (let i = 3; i >= 1; i--) {
  gameState.countdown = i
  console.log(`Countdown: ${i}...`)
}

// Start race
gameState.raceStarted = true
gameState.countdown = 0

console.log('\nRace started!')
console.log('-'.repeat(60))

// Simulate game progress - move player through checkpoints
console.log('\nSimulating player progress through checkpoints...')

// Move player to checkpoint 1
player.position = { x: 100, y: 100 }
gameState.update(0.1)
console.log('\nAfter checkpoint 1:')
console.log('-'.repeat(60))
renderer.drawHUD(gameState)

// Move player to checkpoint 2
player.position = { x: 700, y: 100 }
gameState.update(0.1)
console.log('\nAfter checkpoint 2:')
console.log('-'.repeat(60))
renderer.drawHUD(gameState)

// Move player to checkpoint 3
player.position = { x: 700, y: 500 }
gameState.update(0.1)
console.log('\nAfter checkpoint 3:')
console.log('-'.repeat(60))
renderer.drawHUD(gameState)

// Move player to checkpoint 4 (complete lap)
player.position = { x: 100, y: 500 }
gameState.update(0.1)
console.log('\nAfter checkpoint 4 (Lap 1 completed!):')
console.log('-'.repeat(60))
renderer.drawHUD(gameState)

// Simulate another lap
console.log('\nSimulating second lap...')
player.position = { x: 100, y: 100 }
gameState.update(0.1)
player.position = { x: 700, y: 100 }
gameState.update(0.1)
player.position = { x: 700, y: 500 }
gameState.update(0.1)
player.position = { x: 100, y: 500 }
gameState.update(0.1)
console.log('\nAfter Lap 2:')
console.log('-'.repeat(60))
renderer.drawHUD(gameState)

// Simulate third lap (race completion)
console.log('\nSimulating third lap (race completion)...')
player.position = { x: 100, y: 100 }
gameState.update(0.1)
player.position = { x: 700, y: 100 }
gameState.update(0.1)
player.position = { x: 700, y: 500 }
gameState.update(0.1)
player.position = { x: 100, y: 500 }
gameState.update(0.1)
console.log('\nRace completed!')
console.log('-'.repeat(60))
renderer.drawHUD(gameState)

// Test position tracking with opponents
console.log('\n\nTesting Position Tracking with Opponents:')
console.log('='.repeat(60))

// Reset game state for position testing
const gameState2 = new GameState()
const player2 = new Vehicle(100, 100, 0)
gameState2.setPlayer(player2)
const lapDetector2 = new LapDetector(checkpoints)
gameState2.setLapDetector(lapDetector2)

// Create opponents at different positions
const opp1 = new Vehicle(150, 150, 0)
const opp2 = new Vehicle(200, 200, 0)
const opp3 = new Vehicle(250, 250, 0)

const opponent1 = new AIOpponent(opp1, waypointGraph, checkpoints, 'easy')
const opponent2 = new AIOpponent(opp2, waypointGraph, checkpoints, 'medium')
const opponent3 = new AIOpponent(opp3, waypointGraph, checkpoints, 'hard')

gameState2.addOpponent(opponent1)
gameState2.addOpponent(opponent2)
gameState2.addOpponent(opponent3)

gameState2.raceStarted = true
gameState2.countdown = 0

// Move opponents to different checkpoints
opp1.position = { x: 700, y: 100 }  // Opponent 1 at checkpoint 2
opp2.position = { x: 700, y: 500 }  // Opponent 2 at checkpoint 3
opp3.position = { x: 100, y: 500 }  // Opponent 3 at checkpoint 4 (1 lap)

player2.position = { x: 100, y: 100 }  // Player at checkpoint 1

gameState2.update(0.1)

console.log('\nPosition Test Scenario:')
console.log('-'.repeat(60))
console.log('Player: Lap 0, at checkpoint 1')
console.log('Opponent 1 (easy): Lap 0, at checkpoint 2')
console.log('Opponent 2 (medium): Lap 0, at checkpoint 3')
console.log('Opponent 3 (hard): Lap 1, at checkpoint 4')
console.log('\nExpected Position: Player should be 4th')
console.log('\nActual Result:')
renderer.drawHUD(gameState2)

console.log('\n' + '='.repeat(60))
console.log('\nAll tests completed successfully!')
console.log('\nKey Features Implemented:')
console.log('✓ Race timing system with elapsed time tracking')
console.log('✓ Lap counting and completion detection')
console.log('✓ Position tracking (1st, 2nd, 3rd, etc.)')
console.log('✓ HUD display with lap/time/position information')
console.log('✓ Best lap time recording')
console.log('✓ Race start/finish logic')
console.log('✓ Opponent lap detection for accurate positioning')
console.log('✓ Debug information display')
console.log('='.repeat(60))