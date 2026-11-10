/*
 * config.js — every tunable number lives here.
 *
 * Units: world distances are in "pixels" (1 px = 0.1 m if you want real-world
 * intuition: the car is 4.4 m long), time is in seconds, angles in radians.
 * The world uses screen conventions (x right, y down), so a positive angle turns
 * clockwise on screen.
 */
(function () {
  'use strict';
  const R = (globalThis.Racer = globalThis.Racer || {});

  const CAR = {
    // --- body (rendering + collision) ---
    length: 44,
    width: 20,
    wheelbase: 28,
    mass: 1000,
    // Collision shape: a row of overlapping circles along the car's axis
    // (a cheap, very robust stand-in for a rounded rectangle).
    circleRadius: 10,
    circleOffsets: [-12, -4, 4, 12],

    // --- drivetrain (px/s, px/s^2) ---
    maxSpeed: 560,      // "gearing limit"; real top speed is a bit lower once drag is subtracted
    accel: 300,         // peak engine acceleration at standstill
    brake: 700,         // braking deceleration
    reverseAccel: 240,
    reverseMax: 170,
    rolling: 36,        // constant rolling resistance
    drag: 1.0e-4,       // quadratic air drag coefficient

    // --- tyres ---
    gripLong: 900,      // longitudinal friction budget (px/s^2)
    gripLat: 640,       // lateral friction budget (px/s^2); shared with longitudinal via an ellipse
    gripK: 16,          // how stiffly the tyres kill sideways velocity (1/s)

    // --- steering ---
    maxTanSteer: 0.72,  // tan of the max road-wheel angle at crawling speed
    steerOverGrip: 1.08,// steering lock is limited so full lock asks for ~108% of the lateral grip
    steerRate: 6,       // how quickly the wheel is turned in (tan units / s)
    steerReturnRate: 10,
    yawResponse: 10,    // how quickly yaw rate follows the kinematic target (1/s)

    // --- surfaces ---
    grass: { speed: 0.5, grip: 0.55, rolling: 3.2, accel: 0.7 },

    // --- handbrake (drift) ---
    handbrake: { grip: 0.3, K: 2.5, yaw: 1.5, decel: 90 },
  };

  R.CONFIG = {
    DT: 1 / 120,          // fixed simulation timestep
    MAX_FRAME: 0.25,      // max real time consumed per rendered frame (spiral-of-death guard)
    DEFAULT_SEED: 7,
    LAPS: 3,
    NUM_AI: 3,
    COUNTDOWN: 3,         // seconds of "3-2-1" before the lights go out
    GATES: 8,             // checkpoint gates per lap (gate 0 is the start/finish line)

    TRACK: {
      width: 132,         // asphalt width
      runoff: 34,         // grass strip between asphalt and the barrier
      spacing: 10,        // centreline sample spacing
      minRadius: 150,     // tightest allowed corner (centreline radius)
      sepArc: 300,        // two samples further apart than this along the track...
      sepDist: 262,       // ...must be at least this far apart in space
      minLength: 8000,
      maxLength: 13000,
      radiusMin: 1200,    // size of the generated blob
      radiusMax: 1700,
      maxAttempts: 400,
    },

    CAR,

    COLLISION: {
      carRestitution: 0.35,
      carFriction: 0.25,
      wallRestitution: 0.3,
      wallFriction: 0.3,
      bounceThreshold: 30, // slower impacts are perfectly inelastic (stops jitter)
      slop: 0.3,           // penetration we tolerate before pushing apart (px)
      percent: 0.85,       // fraction of the penetration corrected per pass
      iterations: 4,       // sequential-impulse passes over the contacts of a pair
      passes: 2,           // wall + car passes per tick
      pairRange: 50,       // broad-phase: centres further apart than this can't touch
    },

    AI: {
      edgeMargin: 26,      // racing line stays this far from the asphalt edge
      lineStencil: 6,      // racing-line relaxation looks +/- this many samples
      lineIterations: 900,
      lineRelax: 0.4,
      latFrac: 0.80,       // fraction of the tyre lateral budget the speed profile uses
      brakeFrac: 0.55,     // fraction of the braking budget the speed profile uses
      topFrac: 0.985,      // fraction of the car's terminal speed the AI will ask for
      lookMin: 28,         // pure-pursuit look-ahead = lookMin + lookGain * speed
      lookGain: 0.2,
      brakeLead: 0.12,     // seconds of look-ahead on the speed profile
      throttleGain: 45,
      brakeGain: 35,
      coastBand: 8,
      avoidAhead: 170,     // start reacting to cars this far ahead...
      avoidBehind: 34,     // ...and to cars this far alongside/behind
      avoidWidth: 31,      // lateral distance considered "in my way"
      avoidClear: 40,      // lateral separation we try to reach when avoiding
      avoidSlew: 100,      // px/s the lateral target may move
      cooldownSpeed: 170,  // speed after the chequered flag
      skill: [0.9, 0.985], // per-driver pace multiplier range (drawn from the seeded RNG)
      bias: 9,             // per-driver lateral line bias range (+/-)
      rubber: 0.035,       // gentle rubber-banding (+/-) towards the human player; 0 disables
      stuckTime: 1.1,
      reverseTime: 0.9,
    },

    GRID: { first: 38, spacing: 34, lateral: 28 },
  };
})();
