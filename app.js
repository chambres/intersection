import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Store paths and cars
const paths = [];
const cars = [];
const pedestrians = [];
let waypoints = [];
let waypointCenter = new THREE.Vector3();

// Phase system
const PHASE = {
    CARS: 'cars',
    TRANSITION_TO_PEDESTRIANS: 'transition_to_pedestrians',
    PEDESTRIANS: 'pedestrians',
    TRANSITION_TO_CARS: 'transition_to_cars'
};

let currentPhase = PHASE.CARS;
let phaseTimer = 0;
const CAR_PHASE_DURATION = 125; // 2:05
const PEDESTRIAN_PHASE_DURATION = 45;
const TRANSITION_DURATION = 3; // Time for cars to stop / pedestrians to clear
const TOTAL_CYCLE_DURATION = CAR_PHASE_DURATION + PEDESTRIAN_PHASE_DURATION; // 170 seconds total

// Real-world sync configuration
// Set this to the Unix timestamp (in milliseconds) when the CARS phase STARTS in real life
// To get this: go to the intersection, when light turns green for cars, note Date.now() in browser console
// Example: const CYCLE_REFERENCE_TIME = 1702300000000;
const CYCLE_REFERENCE_TIME = 1765517440280; // Set to null to use simulation time, or a timestamp to sync

// Calculate where we are in the cycle based on real time
function calculateSyncedPhaseState() {
    if (CYCLE_REFERENCE_TIME === null) {
        return null; // Use normal simulation timing
    }

    const now = Date.now();
    const elapsed = (now - CYCLE_REFERENCE_TIME) / 1000; // Convert to seconds
    const cyclePosition = ((elapsed % TOTAL_CYCLE_DURATION) + TOTAL_CYCLE_DURATION) % TOTAL_CYCLE_DURATION; // Handle negative (past reference)

    if (cyclePosition < CAR_PHASE_DURATION) {
        return { phase: PHASE.CARS, timer: cyclePosition };
    } else {
        return { phase: PHASE.PEDESTRIANS, timer: cyclePosition - CAR_PHASE_DURATION };
    }
}

// Initialize phase from real-world sync (call once at startup)
function initializeSyncedPhase() {
    const synced = calculateSyncedPhaseState();
    if (synced) {
        currentPhase = synced.phase;
        phaseTimer = synced.timer;
        console.log(`Synced to real time: ${synced.phase} phase, ${synced.timer.toFixed(1)}s in`);

        // If starting in pedestrian phase, spawn pedestrians
        if (currentPhase === PHASE.PEDESTRIANS) {
            // Will be called after waypoints are loaded
            setTimeout(() => {
                if (waypoints.length > 0 && pedestrians.length === 0) {
                    spawnWaitingPedestrians();
                    // Make them start walking immediately since phase is already active
                    pedestrians.forEach(p => {
                        p.waiting = false;
                        p.progress = -Math.random() * 0.1;
                    });
                }
            }, 100);
        }
    }
}

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(30, 25, 30);
camera.lookAt(0, 0, 0);

// Performance mode - set to true for older hardware
const LOW_PERFORMANCE_MODE = new URLSearchParams(window.location.search).has('lowperf');

const renderer = new THREE.WebGLRenderer({
    antialias: !LOW_PERFORMANCE_MODE,
    powerPreference: LOW_PERFORMANCE_MODE ? 'low-power' : 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !LOW_PERFORMANCE_MODE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (LOW_PERFORMANCE_MODE) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1)); // Cap at 1x
} else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x
}
document.body.appendChild(renderer.domElement);

if (LOW_PERFORMANCE_MODE) {
    console.log('Running in LOW PERFORMANCE MODE');
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false; // Disable panning

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 50, 25);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -100;
directionalLight.shadow.camera.right = 100;
directionalLight.shadow.camera.top = 100;
directionalLight.shadow.camera.bottom = -100;
scene.add(directionalLight);

// UI elements
const timerElement = document.getElementById('timer');
const phaseElement = document.getElementById('phase');
const fpsElement = document.getElementById('fps');

// Frame time tracking
let frameCount = 0;
let lastFpsUpdate = 0;
let fps = 0;
let frameTime = 0;
let elapsedTime = 0;

// Animation loop
const clock = new THREE.Clock();

// Car constants
const CAR_LENGTH = 6;

// Spawn pedestrians waiting at waypoints
function spawnWaitingPedestrians() {
    if (waypoints.length < 2) return;

    const pedestriansPerWaypoint = 12 + Math.floor(Math.random() * 8); // 12-20 per waypoint

    for (let wpIdx = 0; wpIdx < waypoints.length; wpIdx++) {
        const wp = waypoints[wpIdx];

        for (let i = 0; i < pedestriansPerWaypoint; i++) {
            // Pick a random destination waypoint (different from start)
            let destIdx = Math.floor(Math.random() * waypoints.length);
            while (destIdx === wpIdx) {
                destIdx = Math.floor(Math.random() * waypoints.length);
            }

            // Cluster around waypoint with some randomness
            const clusterRadius = 3 + Math.random() * 5;
            const angle = Math.random() * Math.PI * 2;
            const startPoint = wp.clone();
            startPoint.x += Math.cos(angle) * clusterRadius;
            startPoint.z += Math.sin(angle) * clusterRadius;

            const endPoint = waypoints[destIdx].clone();
            // Add randomness to destination
            endPoint.x += (Math.random() - 0.5) * 8;
            endPoint.z += (Math.random() - 0.5) * 8;

            // Create pedestrian
            const bodyGeometry = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
            const clothColors = [0x2563eb, 0xdc2626, 0x16a34a, 0x9333ea, 0xf59e0b, 0x0d9488, 0x475569, 0x1e293b, 0x7c3aed, 0xea580c];
            const bodyMaterial = new THREE.MeshStandardMaterial({
                color: clothColors[Math.floor(Math.random() * clothColors.length)]
            });
            const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
            bodyMesh.position.copy(startPoint);
            bodyMesh.position.y += 1;
            bodyMesh.castShadow = true;
            scene.add(bodyMesh);

            pedestrians.push({
                mesh: bodyMesh,
                start: startPoint,
                end: endPoint,
                progress: 0,
                speed: 0.025 + Math.random() * 0.015, // Walk speed
                waiting: true, // Start waiting
                completed: false,
                idleOffset: Math.random() * Math.PI * 2 // For idle animation
            });
        }
    }
}

// Remove all pedestrians
function clearPedestrians() {
    pedestrians.forEach(ped => {
        scene.remove(ped.mesh);
        ped.mesh.geometry.dispose();
        ped.mesh.material.dispose();
    });
    pedestrians.length = 0;
}

// Spawn a single car at the beginning of a path
function spawnCarOnPath(pathObj) {
    const curve = pathObj.curve;

    const carGeometry = new THREE.BoxGeometry(CAR_LENGTH, 1.5, 2.5);
    const carColors = [0x1a1a1a, 0xffffff, 0x3b82f6, 0xef4444, 0x22c55e, 0xfbbf24, 0x6b7280, 0x8b5cf6];
    const carMaterial = new THREE.MeshStandardMaterial({
        color: carColors[Math.floor(Math.random() * carColors.length)]
    });
    const carMesh = new THREE.Mesh(carGeometry, carMaterial);
    carMesh.castShadow = true;
    scene.add(carMesh);

    // Each car has slightly different speed
    const speed = 0.018 + Math.random() * 0.012; // 0.018-0.030

    const car = {
        mesh: carMesh,
        path: curve,
        progress: 0,
        speed: speed,
        finished: false
    };

    cars.push(car);
    return car;
}

// Spawn initial cars (one per path)
function spawnInitialCars() {
    paths.forEach((pathObj) => {
        spawnCarOnPath(pathObj);
    });
}

// Car spawn timing
let carSpawnTimers = {}; // Track spawn timers per path
const MIN_SPAWN_INTERVAL = 2; // Minimum seconds between spawns on same path
const MAX_SPAWN_INTERVAL = 5; // Maximum seconds between spawns

// Initialize spawn timers for each path
function initSpawnTimers() {
    paths.forEach((pathObj, index) => {
        carSpawnTimers[index] = Math.random() * 2; // Initial random delay
    });
}

// Spawn new cars continuously
function updateCarSpawning(delta) {
    paths.forEach((pathObj, pathIndex) => {
        carSpawnTimers[pathIndex] -= delta;

        if (carSpawnTimers[pathIndex] <= 0) {
            spawnCarOnPath(pathObj);
            // Reset timer with random interval
            carSpawnTimers[pathIndex] = MIN_SPAWN_INTERVAL + Math.random() * (MAX_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL);
        }
    });
}

// Remove cars that have completed their path
function removeFinishedCars() {
    for (let i = cars.length - 1; i >= 0; i--) {
        if (cars[i].finished) {
            scene.remove(cars[i].mesh);
            cars[i].mesh.geometry.dispose();
            cars[i].mesh.material.dispose();
            cars.splice(i, 1);
        }
    }
}

// Clear all cars
function clearCars() {
    cars.forEach(car => {
        scene.remove(car.mesh);
        car.mesh.geometry.dispose();
        car.mesh.material.dispose();
    });
    cars.length = 0;
}

// Format time as M:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    elapsedTime += delta;

    // Update FPS counter
    frameCount++;
    frameTime = delta * 1000;
    if (elapsedTime - lastFpsUpdate >= 0.5) {
        fps = Math.round(frameCount / (elapsedTime - lastFpsUpdate));
        frameCount = 0;
        lastFpsUpdate = elapsedTime;
        fpsElement.textContent = `${fps} FPS | ${frameTime.toFixed(1)} ms`;
    }

    // Phase state machine
    phaseTimer += delta;

    // Spawn new cars continuously
    updateCarSpawning(delta);

    // Remove finished cars
    removeFinishedCars();

    // Update cars - simple movement along path
    cars.forEach(car => {
        // Move along path at constant speed
        car.progress += car.speed * delta;

        if (car.progress >= 1) {
            // Car finished its path - mark for removal
            car.finished = true;
            return;
        }

        // Update mesh position and rotation
        const point = car.path.getPointAt(car.progress);
        if (point) {
            car.mesh.position.copy(point);
            const tangent = car.path.getTangentAt(car.progress);
            const lookAtPoint = point.clone().add(tangent);
            car.mesh.lookAt(lookAtPoint);
            car.mesh.rotateY(Math.PI / 2);
        }
    });

    // Update pedestrians
    const canWalk = currentPhase === PHASE.PEDESTRIANS;

    pedestrians.forEach(ped => {
        if (ped.completed) return;

        if (ped.waiting) {
            // Waiting animation - slight sway
            ped.mesh.rotation.y = Math.sin(elapsedTime * 0.5 + ped.idleOffset) * 0.1;
            ped.mesh.position.y = ped.start.y + 1 + Math.sin(elapsedTime * 2 + ped.idleOffset) * 0.02;

            if (canWalk) {
                ped.waiting = false;
                // Stagger start times
                ped.progress = -Math.random() * 0.1;
            }
        } else {
            // Walking
            if (ped.progress < 0) {
                ped.progress += ped.speed * delta;
            } else {
                ped.progress += ped.speed * delta;

                if (ped.progress >= 1) {
                    // Reached destination
                    scene.remove(ped.mesh);
                    ped.mesh.geometry.dispose();
                    ped.mesh.material.dispose();
                    ped.completed = true;
                } else {
                    // Lerp position
                    ped.mesh.position.lerpVectors(ped.start, ped.end, Math.max(0, ped.progress));
                    ped.mesh.position.y = ped.start.y + 1;

                    // Face walking direction
                    const direction = new THREE.Vector3().subVectors(ped.end, ped.start).normalize();
                    ped.mesh.lookAt(ped.mesh.position.clone().add(direction));

                    // Walking bob
                    ped.mesh.position.y += Math.abs(Math.sin(elapsedTime * 12 + ped.idleOffset)) * 0.08;
                }
            }
        }
    });

    // Remove completed pedestrians
    for (let i = pedestrians.length - 1; i >= 0; i--) {
        if (pedestrians[i].completed) {
            pedestrians.splice(i, 1);
        }
    }

    // Phase transitions
    switch (currentPhase) {
        case PHASE.CARS:
            const carTimeLeft = CAR_PHASE_DURATION - phaseTimer;
            timerElement.textContent = formatTime(Math.max(0, carTimeLeft));
            phaseElement.textContent = 'Cars Moving';
            phaseElement.className = 'car-phase';

            if (phaseTimer >= CAR_PHASE_DURATION) {
                // Spawn waiting pedestrians
                spawnWaitingPedestrians();
                phaseTimer = 0;
                currentPhase = PHASE.TRANSITION_TO_PEDESTRIANS;
            }
            break;

        case PHASE.TRANSITION_TO_PEDESTRIANS:
            timerElement.textContent = 'STOPPING';
            phaseElement.textContent = 'Cars Stopping...';
            phaseElement.className = 'pedestrian-phase';

            // Check if all cars have stopped or cleared intersection
            const allStopped = cars.every(car => car.stopped || car.currentSpeed < 0.001 || isInStopZone(car.mesh.position));

            if (phaseTimer >= TRANSITION_DURATION || allStopped) {
                phaseTimer = 0;
                currentPhase = PHASE.PEDESTRIANS;
            }
            break;

        case PHASE.PEDESTRIANS:
            const pedTimeLeft = PEDESTRIAN_PHASE_DURATION - phaseTimer;
            timerElement.textContent = formatTime(Math.max(0, pedTimeLeft));
            const activePeds = pedestrians.filter(p => !p.waiting && !p.completed).length;
            const waitingPeds = pedestrians.filter(p => p.waiting).length;
            phaseElement.textContent = `Walking: ${activePeds} | Waiting: ${waitingPeds}`;
            phaseElement.className = 'pedestrian-phase';

            if (phaseTimer >= PEDESTRIAN_PHASE_DURATION) {
                phaseTimer = 0;
                currentPhase = PHASE.TRANSITION_TO_CARS;
            }
            break;

        case PHASE.TRANSITION_TO_CARS:
            timerElement.textContent = 'CLEARING';
            phaseElement.textContent = 'Pedestrians Clearing...';
            phaseElement.className = 'car-phase';

            // Wait for pedestrians to clear or timeout
            const activePedestrians = pedestrians.filter(p => !p.completed && !p.waiting).length;

            if (phaseTimer >= TRANSITION_DURATION + 2 || activePedestrians === 0) {
                // Clear remaining pedestrians and restart
                clearPedestrians();
                phaseTimer = 0;
                currentPhase = PHASE.CARS;
            }
            break;
    }

    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Store model center offset for path alignment
let modelCenterOffset = new THREE.Vector3();

// Load GLB model and path data
const loader = new GLTFLoader();

// Load model, path JSON, and waypoints JSON
Promise.all([
    new Promise((resolve, reject) => {
        loader.load(
            'untitled.glb',
            (gltf) => resolve(gltf),
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(1);
                console.log('Loading model:', percent + '%');
                timerElement.textContent = `Loading: ${percent}%`;
            },
            (error) => reject(error)
        );
    }),
    fetch('mesh_paths.json').then(r => r.json()),
    fetch('waypoints.json').then(r => r.json()).catch(() => ({}))
]).then(([gltf, pathData, waypointData]) => {
    const model = gltf.scene;

    // Get model bounds
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    console.log('Model loaded successfully');
    console.log('Model size:', size);
    console.log('Model center:', center);

    modelCenterOffset.copy(center);
    model.position.sub(center);

    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    scene.add(model);

    // Create paths from JSON data
    console.log('Path data loaded:', Object.keys(pathData));

    const allYValues = [];
    for (const points of Object.values(pathData)) {
        for (const p of points) {
            allYValues.push(p[1]);
        }
    }
    allYValues.sort((a, b) => a - b);
    const medianY = allYValues[Math.floor(allYValues.length / 2)];
    console.log('Median Y height:', medianY);

    // Use all paths - cars spawn at beginning and drive to end (one direction per path)
    for (const [pathName, points] of Object.entries(pathData)) {
        if (points.length >= 2) {
            const vectorPoints = points.map(p => {
                return new THREE.Vector3(
                    p[0] - modelCenterOffset.x,
                    medianY - modelCenterOffset.y,
                    p[2] - modelCenterOffset.z
                );
            });

            console.log(`Path "${pathName}": ${vectorPoints.length} points`);

            const curve = new THREE.CatmullRomCurve3(vectorPoints);
            paths.push({ name: pathName, curve, points: vectorPoints });
        }
    }

    // Initialize car spawning system and spawn initial cars
    initSpawnTimers();
    spawnInitialCars();

    // Sync phase with real-world time if configured
    initializeSyncedPhase();

    console.log(`Total paths: ${paths.length}, Total cars: ${cars.length}`);

    // Load waypoints for pedestrian crossings
    console.log('Waypoint data:', waypointData);
    for (const [wpName, coords] of Object.entries(waypointData)) {
        const wpPosition = new THREE.Vector3(
            coords[0] - modelCenterOffset.x,
            medianY - modelCenterOffset.y,
            coords[2] - modelCenterOffset.z
        );
        waypoints.push(wpPosition);
        console.log(`Waypoint "${wpName}":`, wpPosition);
    }
    console.log(`Total waypoints: ${waypoints.length}`);

    // Calculate center of waypoints for camera target
    if (waypoints.length > 0) {
        waypoints.forEach(wp => waypointCenter.add(wp));
        waypointCenter.divideScalar(waypoints.length);
    }
    console.log('Waypoint center:', waypointCenter);

    // Set camera to look at waypoint center, zoomed in
    const cameraDistance = 80;
    camera.position.set(
        waypointCenter.x + cameraDistance * 0.7,
        waypointCenter.y + cameraDistance * 0.5,
        waypointCenter.z + cameraDistance * 0.7
    );
    camera.lookAt(waypointCenter);

    controls.target.copy(waypointCenter);
    controls.update();

    timerElement.textContent = 'Model Loaded';
    phaseElement.textContent = `Size: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`;
}).catch((error) => {
    console.error('Error loading:', error);
    timerElement.textContent = 'Error loading';
    phaseElement.textContent = 'Check console for details';
});

// Start
timerElement.textContent = 'Loading...';
phaseElement.textContent = '';
animate();
