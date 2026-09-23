/**
 * Core game loop implementation with fixed timestep
 * 
 * This module provides the game loop that ensures deterministic
 * game state updates using a fixed timestep approach.
 */

class GameLoop {
  /**
   * Create a new GameLoop instance
   * @param {number} fixedTimestep - Target time per logic update (e.g., 1/60)
   * @param {number} maxFrameSkip - Maximum number of fixed updates per render
   */
  constructor(fixedTimestep = 1/60, maxFrameSkip = 5) {
    this.lastUpdateTime = 0
    this.accumulator = 0
    this.fixedTimestep = fixedTimestep
    this.maxFrameSkip = maxFrameSkip
    this.frameSkip = 0
    this.lag = 0
  }

  /**
   * Start the game loop
   * @param {function} updateCallback - Function to call for game state updates
   * @param {function} renderCallback - Function to call for rendering
   */
  start(updateCallback, renderCallback) {
    this.updateCallback = updateCallback
    this.renderCallback = renderCallback
    this.lastUpdateTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
    
    // Use appropriate animation frame function based on environment
    const animationFrame = typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 16)
    
    animationFrame(this.gameLoop.bind(this))
  }

  /**
   * Main game loop implementation
   * @private
   */
  gameLoop(currentTime) {
    // Calculate frame time
    const frameTime = currentTime - this.lastUpdateTime
    this.lastUpdateTime = currentTime

    // Accumulate time
    this.accumulator += frameTime
    this.lag = this.accumulator

    // Reset frame skip counter
    this.frameSkip = 0

    // Process fixed updates
    while (this.accumulator >= this.fixedTimestep && this.frameSkip < this.maxFrameSkip) {
      this.updateCallback(this.fixedTimestep)
      this.accumulator -= this.fixedTimestep
      this.frameSkip++
    }

    // Calculate interpolation factor for smooth rendering
    const alpha = this.lag / this.fixedTimestep

    // Render with interpolation
    this.renderCallback(alpha)

    // Use appropriate animation frame function based on environment
    const animationFrame = typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 16)
    
    animationFrame(this.gameLoop.bind(this))
  }
}

module.exports = GameLoop
