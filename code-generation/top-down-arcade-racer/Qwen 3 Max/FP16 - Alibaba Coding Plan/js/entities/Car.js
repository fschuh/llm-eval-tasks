import { Vector2 } from '../utils/Vector2.js';
import { GameConfig } from '../core/Constants.js';

export class Car {
    constructor(id, position = new Vector2(), rotation = 0) {
        this.id = id;
        this.position = position;
        this.rotation = rotation;
        this.velocity = new Vector2();
        this.angularVelocity = 0;
        
        // Input state
        this.inputState = {
            accelerate: false,
            brake: false,
            left: false,
            right: false
        };
        
        // Physics properties
        this.maxSpeed = 400;           // pixels/second
        this.accelerationRate = 350;   // pixels/second² (more responsive acceleration)
        this.brakingRate = 450;        // pixels/second² (stronger braking)
        this.reverseMaxSpeed = 150;    // pixels/second
        this.turnRate = 4.0;           // radians/second at full speed (more responsive steering)
        this.friction = 0.96;          // linear friction coefficient (less friction for sliding)
        this.angularFriction = 0.92;   // angular friction coefficient (slower rotation decay)
        this.dragCoefficient = 0.015;  // air resistance proportional to speed² (less drag)
        
        // Dimensions
        this.width = GameConfig.CAR_WIDTH;
        this.length = GameConfig.CAR_LENGTH;
        
        // Visual feedback for collisions
        this.collisionEffectTimer = 0;
        this.collisionEffectDuration = 0.2; // seconds
        
        // State
        this.isOnTrack = true;
        this.lapProgress = {
            currentLap: 0,
            lastCheckpoint: -1,
            checkpointsPassed: new Set(),
            lapStartTime: 0,
            bestLapTime: null
        };
    }
    
    // Add method to trigger collision visual effect
    triggerCollisionEffect() {
        this.collisionEffectTimer = this.collisionEffectDuration;
    }
    
    updateCollisionEffect(dt) {
        if (this.collisionEffectTimer > 0) {
            this.collisionEffectTimer -= dt;
        }
    }
    
    update(dt, input) {
        // Store previous state for collision resolution
        const prevPosition = this.position.clone();
        const prevRotation = this.rotation;
        
        // Update input state
        this.updateInputState(input);
        
        // Apply physics forces
        this.applyForces(dt);
        
        // Apply friction and drag
        this.applyResistance(dt);
        
        // Clamp velocity to max speed limits
        this.clampVelocity();
        
        // Update position and rotation
        this.position = this.position.add(this.velocity.multiply(dt));
        this.rotation += this.angularVelocity * dt;
        
        // Normalize rotation to 0-2π range
        this.rotation = ((this.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        
        // Update collision visual effect
        this.updateCollisionEffect(dt);
        
        // Check bounds and keep car on track
        this.enforceBounds();
    }
    
    updateInputState(input) {
        this.inputState.accelerate = input.throttle > 0;
        this.inputState.brake = input.throttle < 0;
        this.inputState.left = input.steering < 0;
        this.inputState.right = input.steering > 0;
    }
    
    applyForces(dt) {
        const currentSpeed = this.velocity.length();
        const forward = this.getForwardVector();
        const currentDirection = this.velocity.dot(forward) >= 0;
        
        // Acceleration/Braking
        if (this.inputState.accelerate) {
            // Accelerating forward
            const accelerationForce = this.accelerationRate;
            this.velocity = this.velocity.add(forward.multiply(accelerationForce * dt));
        } else if (this.inputState.brake) {
            if (currentDirection && currentSpeed > 0) {
                // Braking while moving forward
                const brakeForce = this.brakingRate;
                const braking = forward.multiply(-brakeForce * dt);
                this.velocity = this.velocity.add(braking);
                
                // Stop completely if velocity would reverse
                if (this.velocity.dot(forward) < 0) {
                    this.velocity = new Vector2(0, 0);
                }
            } else if (!currentDirection && currentSpeed > 0) {
                // Braking while moving backward
                const brakeForce = this.brakingRate * 0.7; // Less effective braking in reverse
                const backward = forward.multiply(-1);
                const braking = backward.multiply(-brakeForce * dt);
                this.velocity = this.velocity.add(braking);
                
                // Stop completely if velocity would go forward
                if (this.velocity.dot(backward) < 0) {
                    this.velocity = new Vector2(0, 0);
                }
            } else if (currentSpeed === 0) {
                // Start reversing
                const reverseForce = this.accelerationRate * 0.5;
                const backward = forward.multiply(-1);
                this.velocity = this.velocity.add(backward.multiply(reverseForce * dt));
            }
        }
        
        // Steering
        this.applySteering(dt);
    }
    
    applySteering(dt) {
        const speed = this.velocity.length();
        if (speed === 0) {
            this.angularVelocity = 0;
            return;
        }
        
        // Determine steering direction
        let steeringInput = 0;
        if (this.inputState.left) steeringInput = -1;
        if (this.inputState.right) steeringInput = 1;
        
        if (steeringInput === 0) {
            this.angularVelocity *= 0.9; // Gradual stop when not steering
            return;
        }
        
        // Steering rate is speed-dependent (more responsive at lower speeds)
        const speedFactor = 1.0 - Math.min(speed / this.maxSpeed, 1.0) * 0.6;
        const effectiveTurnRate = this.turnRate * speedFactor;
        
        // Apply steering based on current direction
        const forward = this.getForwardVector();
        const currentDirection = this.velocity.dot(forward) >= 0;
        
        if (currentDirection) {
            // Moving forward - normal steering
            this.angularVelocity = steeringInput * effectiveTurnRate;
        } else {
            // Moving backward - reduced steering effectiveness
            this.angularVelocity = steeringInput * effectiveTurnRate * 0.6;
        }
        
        // For arcade feel, gradually align velocity with car direction
        // This maintains some momentum while ensuring responsive steering
        const targetForward = currentDirection ? this.getForwardVector() : this.getForwardVector().multiply(-1);
        const currentSpeed = this.velocity.length();
        
        if (currentSpeed > 0) {
            // Blend current velocity with target direction based on steering input
            const steeringFactor = Math.abs(steeringInput) * 0.3 + 0.7; // Stronger alignment when steering
            const alignedVelocity = targetForward.multiply(currentSpeed);
            this.velocity = this.velocity.multiply(1 - steeringFactor).add(alignedVelocity.multiply(steeringFactor));
        }
    }
    
    applyResistance(dt) {
        // Linear friction (constant reduction)
        this.velocity = this.velocity.multiply(this.friction);
        
        // Air resistance (proportional to speed squared)
        const speed = this.velocity.length();
        if (speed > 0) {
            const dragForce = speed * speed * this.dragCoefficient;
            const dragVector = this.velocity.normalize().multiply(-dragForce * dt);
            this.velocity = this.velocity.add(dragVector);
        }
        
        // Angular friction
        this.angularVelocity *= this.angularFriction;
    }
    
    clampVelocity() {
        const speed = this.velocity.length();
        if (speed === 0) return;
        
        const forward = this.getForwardVector();
        const currentDirection = this.velocity.dot(forward) >= 0;
        
        if (currentDirection) {
            // Moving forward
            if (speed > this.maxSpeed) {
                this.velocity = this.velocity.normalize().multiply(this.maxSpeed);
            }
        } else {
            // Moving backward
            if (speed > this.reverseMaxSpeed) {
                this.velocity = this.velocity.normalize().multiply(-this.reverseMaxSpeed);
            }
        }
    }
    
    enforceBounds() {
        // Keep car within canvas bounds as a safety net
        const padding = 20;
        const minX = padding;
        const maxX = GameConfig.CANVAS_WIDTH - padding;
        const minY = padding;
        const maxY = GameConfig.CANVAS_HEIGHT - padding;
        
        if (this.position.x < minX) this.position.x = minX;
        if (this.position.x > maxX) this.position.x = maxX;
        if (this.position.y < minY) this.position.y = minY;
        if (this.position.y > maxY) this.position.y = maxY;
        
        // Track boundary checking will be handled by the game loop
        // using the Track.checkCarCollision method
    }
    
    getCorners() {
        const halfWidth = this.width / 2;
        const halfLength = this.length / 2;
        
        // Local space corners (car facing up, origin at center)
        const corners = [
            new Vector2(-halfWidth, -halfLength), // back left
            new Vector2(halfWidth, -halfLength),  // back right
            new Vector2(halfWidth, halfLength),   // front right
            new Vector2(-halfWidth, halfLength)   // front left
        ];
        
        // Rotate and translate to world space
        return corners.map(corner => {
            const rotated = corner.rotate(this.rotation);
            return rotated.add(this.position);
        });
    }
    
    getForwardVector() {
        // Rotation 0 means facing up (negative Y direction in canvas)
        return new Vector2(Math.sin(this.rotation), -Math.cos(this.rotation));
    }
    
    getVelocityVector() {
        return this.velocity.clone();
    }
    
    getBoundingBox() {
        const corners = this.getCorners();
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const corner of corners) {
            minX = Math.min(minX, corner.x);
            minY = Math.min(minY, corner.y);
            maxX = Math.max(maxX, corner.x);
            maxY = Math.max(maxY, corner.y);
        }
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
    
    getInputState() {
        return { ...this.inputState };
    }
    
    // Add mass property for physics calculations
    getMass() {
        return 1.0; // Default mass for all cars
    }
}