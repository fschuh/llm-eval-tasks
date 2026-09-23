import { Vector2D } from '../core/Vector2D.js';

/**
 * Default track data - creates an oval/figure-8 style track
 */
export function createDefaultTrack() {
    const centerX = 512;
    const centerY = 384;
    const scaleX = 350;
    const scaleY = 250;

    // Create waypoints in an oval pattern
    const waypoints = [];
    const numWaypoints = 16;
    
    for (let i = 0; i < numWaypoints; i++) {
        const angle = (i / numWaypoints) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * scaleX;
        const y = centerY + Math.sin(angle) * scaleY * 0.7;
        
        waypoints.push({
            index: i,
            position: new Vector2D(x, y),
            width: 80,
            isCheckpoint: i === 0 // Start/finish line
        });
    }

    // Create start positions (grid)
    const startPositions = [];
    const startAngle = 0; // Facing right
    const gridSpacing = 40;
    
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
            const offsetX = -60 - col * gridSpacing;
            const offsetY = (row === 0 ? -20 : 20);
            
            startPositions.push({
                position: new Vector2D(
                    centerX + scaleX + offsetX,
                    centerY + offsetY
                ),
                rotation: startAngle
            });
        }
    }

    // Create track boundaries (walls at corners)
    const boundaries = [];
    
    // Outer walls
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        boundaries.push({
            type: 'wall',
            position: new Vector2D(
                centerX + Math.cos(angle) * (scaleX + 100),
                centerY + Math.sin(angle) * (scaleY * 0.7 + 100)
            ),
            radius: 30,
            restitution: 0.3
        });
    }

    return {
        name: 'Oval Circuit',
        lapCount: 3,
        sectorCount: 4,
        waypoints,
        startPositions,
        boundaries,
        width: 1024,
        height: 768
    };
}

/**
 * Create a more complex track with chicanes
 */
export function createComplexTrack() {
    const waypoints = [
        { index: 0, position: new Vector2D(100, 384), width: 80, isCheckpoint: true },
        { index: 1, position: new Vector2D(200, 200), width: 80, isCheckpoint: false },
        { index: 2, position: new Vector2D(400, 150), width: 80, isCheckpoint: false },
        { index: 3, position: new Vector2D(600, 200), width: 80, isCheckpoint: false },
        { index: 4, position: new Vector2D(800, 300), width: 80, isCheckpoint: false },
        { index: 5, position: new Vector2D(900, 384), width: 80, isCheckpoint: false },
        { index: 6, position: new Vector2D(800, 500), width: 80, isCheckpoint: false },
        { index: 7, position: new Vector2D(600, 600), width: 80, isCheckpoint: false },
        { index: 8, position: new Vector2D(400, 600), width: 80, isCheckpoint: false },
        { index: 9, position: new Vector2D(200, 550), width: 80, isCheckpoint: false },
        { index: 10, position: new Vector2D(100, 384), width: 80, isCheckpoint: false }
    ];

    const startPositions = [
        { position: new Vector2D(60, 364), rotation: 0 },
        { position: new Vector2D(60, 384), rotation: 0 },
        { position: new Vector2D(60, 404), rotation: 0 },
        { position: new Vector2D(20, 374), rotation: 0 }
    ];

    const boundaries = [
        // Corner barriers
        { type: 'wall', position: new Vector2D(200, 150), radius: 40, restitution: 0.3 },
        { type: 'wall', position: new Vector2D(600, 150), radius: 40, restitution: 0.3 },
        { type: 'wall', position: new Vector2D(850, 300), radius: 40, restitution: 0.3 },
        { type: 'wall', position: new Vector2D(850, 500), radius: 40, restitution: 0.3 },
        { type: 'wall', position: new Vector2D(600, 650), radius: 40, restitution: 0.3 },
        { type: 'wall', position: new Vector2D(200, 600), radius: 40, restitution: 0.3 }
    ];

    return {
        name: 'Complex Circuit',
        lapCount: 3,
        sectorCount: 4,
        waypoints,
        startPositions,
        boundaries,
        width: 1024,
        height: 768
    };
}

// Export default track
export const DEFAULT_TRACK = createDefaultTrack();
