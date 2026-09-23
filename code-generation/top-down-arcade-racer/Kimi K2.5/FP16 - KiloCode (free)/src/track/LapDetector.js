import { Vector2 } from '../utils/Vector2.js';

/**
 * Lap detector with checkpoint-based validation
 */
export class LapDetector {
    constructor(track) {
        this.track = track;
        this.checkpointCount = track.checkpoints.length;
    }

    /**
     * Update lap detection for a car
     */
    update(car, dt) {
        // Update car's race time
        if (!car.finished) {
            car.raceTime += dt;
        }

        // Find which waypoint the car just passed
        const currentWaypoint = this.track.waypoints[car.currentCheckpoint];
        const nextWaypoint = currentWaypoint.next;

        // Check if car passed the next waypoint
        if (this.hasPassedWaypoint(car, currentWaypoint, nextWaypoint)) {
            car.currentCheckpoint = (car.currentCheckpoint + 1) % this.track.waypoints.length;
            
            // Track that we passed this checkpoint
            const passedWaypoint = this.track.waypoints[car.currentCheckpoint];
            if (passedWaypoint.isCheckpoint) {
                car.checkpointsPassed.add(car.currentCheckpoint);
            }

            // Check if crossed start/finish line
            if (car.currentCheckpoint === this.track.startLine) {
                this.checkLapCompletion(car);
            }
        }

        // Validate car is on track (anti-cheat)
        this.validateTrackPosition(car);
    }

    /**
     * Check if car has passed from one waypoint to the next
     */
    hasPassedWaypoint(car, from, to) {
        const pos = car.physics.position;

        // Vector from 'from' to car
        const toCar = pos.subtract(from.position);
        // Vector from 'from' to 'to'
        const toNext = to.position.subtract(from.position);

        // Check if car has moved past the waypoint line
        const dot = toCar.dot(toNext);
        const nextDistSq = toNext.lengthSquared();

        // Car has passed if projection is beyond the waypoint
        if (dot > nextDistSq * 0.5) {
            // Also check if within track width
            const closestPoint = this.closestPointOnSegment(pos, from.position, to.position);
            const distFromCenter = pos.distanceTo(closestPoint);
            return distFromCenter < this.track.trackWidth;
        }

        return false;
    }

    /**
     * Get closest point on a line segment
     */
    closestPointOnSegment(point, a, b) {
        const ab = b.subtract(a);
        const ap = point.subtract(a);
        const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSquared()));
        return a.add(ab.multiply(t));
    }

    /**
     * Check if a lap is valid and increment lap count
     */
    checkLapCompletion(car) {
        // Check if all checkpoints were hit
        const requiredCheckpoints = this.track.checkpoints.length;

        if (car.checkpointsPassed.size >= requiredCheckpoints) {
            car.lapCount++;
            car.checkpointsPassed.clear();

            // Check if race is complete
            if (car.lapCount >= this.track.totalLaps) {
                car.finished = true;
                car.finishTime = car.raceTime;
            }
        } else {
            // Missed checkpoints - invalid lap
            this.handleInvalidLap(car);
        }
    }

    /**
     * Handle invalid lap (missed checkpoints)
     */
    handleInvalidLap(car) {
        // Reset checkpoints but don't count lap
        car.checkpointsPassed.clear();

        // Optional: Penalty for cutting
        car.physics.velocity = car.physics.velocity.multiply(0.5);
    }

    /**
     * Validate car is on track (anti-cheat)
     */
    validateTrackPosition(car) {
        // Find closest point on track
        let closestDist = Infinity;

        for (let i = 0; i < this.track.waypoints.length; i++) {
            const current = this.track.waypoints[i];
            const next = current.next;
            const closest = this.closestPointOnSegment(car.physics.position, current.position, next.position);
            const dist = car.physics.position.distanceTo(closest);

            if (dist < closestDist) {
                closestDist = dist;
            }
        }

        // If too far from track, apply penalty
        const maxDistance = this.track.trackWidth * 1.5;
        if (closestDist > maxDistance) {
            // Slow down car significantly
            car.physics.velocity = car.physics.velocity.multiply(0.9);
        }
    }

    /**
     * Calculate progress along track (0 to 1)
     */
    getTrackProgress(car) {
        const currentIndex = car.currentCheckpoint;
        const current = this.track.waypoints[currentIndex];
        const next = current.next;

        // Distance along current segment
        const segmentLength = current.position.distanceTo(next.position);
        const distFromCurrent = car.physics.position.distanceTo(current.position);
        const segmentProgress = Math.min(1, distFromCurrent / segmentLength);

        // Total progress
        const totalWaypoints = this.track.waypoints.length;
        return (currentIndex + segmentProgress) / totalWaypoints;
    }

    /**
     * Get race progress for position calculation
     */
    getRaceProgress(car) {
        // Progress = laps completed + current lap progress
        const lapProgress = this.getTrackProgress(car);
        return car.lapCount + lapProgress;
    }
}