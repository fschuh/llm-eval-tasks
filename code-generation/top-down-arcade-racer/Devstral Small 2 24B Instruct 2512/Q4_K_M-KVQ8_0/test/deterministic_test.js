/**
 * Test script to verify deterministic behavior
 * 
 * This script runs the game twice with the same seed and verifies
 * that the game state is identical after the same number of updates.
 */

const { PRNG } = require('../src/core/rng')
const Vehicle = require('../src/physics/vehicle')
const { WaypointGraph } = require('../src/ai/waypoints')
const AIOpponent = require('../src/ai/opponent')
const GameState = require('../src/game/gameState')
const { LapDetector, TrackBoundary } = require('../src/physics/track')

// Test deterministic RNG
function testRNG() {
  console.log('Testing deterministic RNG...')
  
  const seed = 12345
  const rng1 = new PRNG(seed)
  const rng2 = new PRNG(seed)
  
  const values1 = []
  const values2 = []
  
  for (let i = 0; i < 100; i++) {
    values1.push(rng1.next())
    values2.push(rng2.next())
  }
  
  const isDeterministic = JSON.stringify(values1) === JSON.stringify(values2)
  console.log(`RNG deterministic test: ${isDeterministic ? 'PASSED' : 'FAILED'}`)
  
  return isDeterministic
}

// Test deterministic vehicle physics
function testVehiclePhysics() {
  console.log('\nTesting deterministic vehicle physics...')
  
  const seed = 67890
  const rng = new PRNG(seed)
  
  // Create two identical vehicles
  const vehicle1 = new Vehicle(100, 100, 0)
  const vehicle2 = new Vehicle(100, 100, 0)
  
  // Apply same controls to both
  const controls = {
    accelerate: true,
    brake: false,
    steerLeft: false,
    steerRight: true
  }
  
  // Update both vehicles with same deltaTime
  const deltaTime = 1/60
  vehicle1.update(deltaTime, controls)
  vehicle2.update(deltaTime, controls)
  
  const isDeterministic = 
    vehicle1.position.x === vehicle2.position.x &&
    vehicle1.position.y === vehicle2.position.y &&
    vehicle1.angle === vehicle2.angle &&
    vehicle1.speed === vehicle2.speed
  
  console.log(`Vehicle physics deterministic test: ${isDeterministic ? 'PASSED' : 'FAILED'}`)
  console.log(`Vehicle 1 position: (${vehicle1.position.x.toFixed(2)}, ${vehicle1.position.y.toFixed(2)})`)
  console.log(`Vehicle 2 position: (${vehicle2.position.x.toFixed(2)}, ${vehicle2.position.y.toFixed(2)})`)
  
  return isDeterministic
}

// Test deterministic AI behavior
function testAIDeterministic() {
  console.log('\nTesting deterministic AI behavior...')
  
  const seed = 54321
  const rng = new PRNG(seed)
  
  // Create track points
  const trackPoints = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 200 }
  ]
  
  // Create two identical waypoint graphs
  const waypointGraph1 = WaypointGraph.createFromTrackPoints(trackPoints)
  const waypointGraph2 = WaypointGraph.createFromTrackPoints(trackPoints)
  
  // Create two identical vehicles
  const vehicle1 = new Vehicle(150, 150, 0)
  const vehicle2 = new Vehicle(150, 150, 0)
  
  // Create two identical AI opponents
  const opponent1 = new AIOpponent(vehicle1, waypointGraph1)
  const opponent2 = new AIOpponent(vehicle2, waypointGraph2)
  
  // Update both opponents with same deltaTime
  const deltaTime = 1/60
  const controls1 = opponent1.update(deltaTime, [])
  const controls2 = opponent2.update(deltaTime, [])
  
  const isDeterministic = 
    controls1.accelerate === controls2.accelerate &&
    controls1.brake === controls2.brake &&
    controls1.steerLeft === controls2.steerLeft &&
    controls1.steerRight === controls2.steerRight
  
  console.log(`AI behavior deterministic test: ${isDeterministic ? 'PASSED' : 'FAILED'}`)
  console.log(`Controls 1: ${JSON.stringify(controls1)}`)
  console.log(`Controls 2: ${JSON.stringify(controls2)}`)
  
  return isDeterministic
}

// Run all tests
function runTests() {
  console.log('='.repeat(50))
  console.log('DETERMINISTIC BEHAVIOR VERIFICATION')
  console.log('='.repeat(50))
  
  const test1 = testRNG()
  const test2 = testVehiclePhysics()
  const test3 = testAIDeterministic()
  
  console.log('\n' + '='.repeat(50))
  console.log('SUMMARY')
  console.log('='.repeat(50))
  console.log(`RNG Test: ${test1 ? 'PASSED' : 'FAILED'}`)
  console.log(`Vehicle Physics Test: ${test2 ? 'PASSED' : 'FAILED'}`)
  console.log(`AI Behavior Test: ${test3 ? 'PASSED' : 'FAILED'}`)
  
  const allPassed = test1 && test2 && test3
  console.log(`\nOverall Result: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`)
  console.log('='.repeat(50))
  
  return allPassed
}

// Run tests
const success = runTests()
process.exit(success ? 0 : 1)
