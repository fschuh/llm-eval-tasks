// Simple 2D vector and physics integration
export class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }
    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }
    mul(s) {
        this.x *= s;
        this.y *= s;
        return this;
    }
    length() {
        return Math.hypot(this.x, this.y);
    }
    normalize() {
        const len = this.length();
        if (len > 0) this.mul(1 / len);
        return this;
    }
    clone() {
        return new Vector2(this.x, this.y);
    }
}

export class Body {
    constructor(position = new Vector2(), velocity = new Vector2()) {
        this.position = position;
        this.velocity = velocity;
        this.mass = 1; // default mass
        this.invMass = 1 / this.mass;
    }
    // Simple Euler integration
    integrate(dt) {
        this.position.add(this.velocity.clone().mul(dt));
    }
    applyImpulse(impulse) {
        // Δv = impulse / mass
        this.velocity.add(impulse.clone().mul(this.invMass));
    }
}

export function resolveCollision(bodyA, bodyB, normal) {
    // normal should be a unit vector pointing from A to B
    const relativeVelocity = bodyB.velocity.clone().sub(bodyA.velocity);
    const velAlongNormal = relativeVelocity.x * normal.x + relativeVelocity.y * normal.y;
    if (velAlongNormal > 0) return; // bodies separating
    const restitution = 0.5; // simple bounce factor
    const impulseMag = -(1 + restitution) * velAlongNormal / (bodyA.invMass + bodyB.invMass);
    const impulse = normal.clone().mul(impulseMag);
    bodyA.applyImpulse(impulse.clone().mul(-1));
    bodyB.applyImpulse(impulse);
}
