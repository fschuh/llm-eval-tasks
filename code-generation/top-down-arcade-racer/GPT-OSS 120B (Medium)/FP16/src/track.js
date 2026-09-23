// Track definition and lap detection
import { Vector2 } from "./physics.js";

// Define way‑points for the circuit (simple rectangular loop)
export const waypoints = [
    new Vector2(100, 100),
    new Vector2(700, 100),
    new Vector2(700, 500),
    new Vector2(100, 500),
];

// Lap line: a segment that the car must cross to count a lap.
// Here we use the line between the first and second waypoint.
export const lapLineStart = waypoints[0];
export const lapLineEnd = waypoints[1];

// Helper: check if two line segments intersect (including colinear cases)
function segmentsIntersect(p1, p2, q1, q2) {
    const orientation = (a, b, c) => {
        const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
        if (Math.abs(val) < 1e-6) return 0; // colinear
        return val > 0 ? 1 : 2; // clockwise or counter‑clockwise
    };
    const o1 = orientation(p1, p2, q1);
    const o2 = orientation(p1, p2, q2);
    const o3 = orientation(q1, q2, p1);
    const o4 = orientation(q1, q2, p2);
    if (o1 !== o2 && o3 !== o4) return true;
    return false; // ignoring colinear overlap for simplicity
}

/**
 * Determines whether a car has crossed the lap line between the previous and current positions.
 * @param {Vector2} prevPos - Car position in the previous frame.
 * @param {Vector2} currPos - Car position in the current frame.
 * @returns {boolean} True if the segment (prevPos → currPos) intersects the lap line.
 */
export function checkLapCrossed(prevPos, currPos) {
    return segmentsIntersect(prevPos, currPos, lapLineStart, lapLineEnd);
}
