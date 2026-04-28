import * as THREE from "three";

// const telemetryEl = document.querySelector("#telemetry");
// const reticleEl = document.querySelector("#reticle");
// const minimapEl = document.querySelector("#minimap");
// const minimapCtx = minimapEl ? minimapEl.getContext("2d") : null;
const SKY_COLOR = 0xbfdcf6;
const FOG_COLOR = 0xd8ebfa;
const OCEAN_COLOR = 0x1a4f82;
const START_POSITION = new THREE.Vector3(0, 2380, -1050);
const START_YAW = 0;
const SHIP_SCALE = 1.8;
const FLAK_KILL_CHANCE = 0.04;
const SHIP_HEALTH = 320;
const BULLET_DAMAGE = 1;
const ENEMY_PLANE_HEALTH = 2;
const PLAYER_HULL = 50;
const MINIMAP_WORLD_SPAN = 7600;
const MAP_HALF_SIZE = 4200;
const scene = new THREE.Scene();
const AA_BOAT_HEALTH = 15;
const AA_BOAT_SCALE = 1.1;
const SHIP_TURRET_HEALTH = 5;
const rearTurret = {
  yaw: 0,
  pitch: 0.12,
  maxYaw: 0.38,
  minPitch: -1.0, // limited down
  maxPitch: 0, // straight back / no upward over-rotation
  sensitivity: 0.0014,
};

const aaBoatPlacements = [
  [-600, 2100],
  [0, 2200],
  [600, 2150],
  [-900, 2550],
  [900, 2600],

  // more AA boats
  [-1200, 2250],
  [1200, 2300],
  [-300, 2600],
  [300, 2700],
  [-1500, 2750],
  [1500, 2850],
  [-750, 3050],
  [750, 3100],
].map(([x, z]) => [x * 2.5, z]);
scene.fog = new THREE.Fog(FOG_COLOR, 220, 1700);
function onPointerDown(event) {
  unlockAudio();

  cameraState.pointerX = event.clientX;
  cameraState.pointerY = event.clientY;

  if (cameraState.mode === 2) {
    enterPointerLock();

    if (event.button === 0) {
      rearTurret.firing = true;
    }

    return;
  }

  cameraState.dragging = true;
}
function onPointerMove(event) {
  const dx =
    document.pointerLockElement === renderer.domElement
      ? event.movementX
      : event.clientX - cameraState.pointerX;

  const dy =
    document.pointerLockElement === renderer.domElement
      ? event.movementY
      : event.clientY - cameraState.pointerY;

  cameraState.pointerX = event.clientX;
  cameraState.pointerY = event.clientY;

  if (cameraState.mode === 2) {
    rearTurret.yaw -= dx * rearTurret.sensitivity;
    rearTurret.pitch -= dy * rearTurret.sensitivity;

    rearTurret.yaw = THREE.MathUtils.clamp(
      rearTurret.yaw,
      -rearTurret.maxYaw,
      rearTurret.maxYaw
    );

    rearTurret.pitch = THREE.MathUtils.clamp(
      rearTurret.pitch,
      rearTurret.minPitch,
      rearTurret.maxPitch
    );

    return;
  }

  if (!cameraState.dragging) return;

  cameraState.orbitYaw -= dx * 0.0055;
  cameraState.orbitPitch = THREE.MathUtils.clamp(
    cameraState.orbitPitch - dy * 0.004,
    -1.15,
    1.15
  );
}
function onPointerUp(event) {
  if (event.button === 0) rearTurret.firing = false;
  cameraState.dragging = false;
}

function buildAABoat(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.set(AA_BOAT_SCALE, AA_BOAT_SCALE * 1.6, AA_BOAT_SCALE);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x3e4752,
    flatShading: true,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x8a7f66,
    flatShading: true,
  });
  const gunMat = new THREE.MeshStandardMaterial({
    color: 0x20242a,
    flatShading: true,
  });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 34), hullMat);
  hull.position.y = 1.4;
  group.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 24), deckMat);
  deck.position.y = 2.8;
  group.add(deck);

  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.4, 0.9, 12),
    gunMat
  );
  turretBase.position.set(0, 3.6, 3);
  group.add(turretBase);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 8, 8),
    gunMat
  );
  barrel.rotation.x = Math.PI * 0.5;
  barrel.position.set(0, 4, 8);
  group.add(barrel);

  scene.add(group);

  return {
    group,
    alive: true,
    health: AA_BOAT_HEALTH,
    radius: 10 * AA_BOAT_SCALE,
    flakCooldown: 0.8 + Math.random(),
  };
}
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
renderer.setClearColor(SKY_COLOR, 1);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  4000
);

const hemi = new THREE.HemisphereLight(0xdcefff, 0x355b7a, 2.1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0c7, 2.4);
sun.position.set(180, 260, 90);
scene.add(sun);

scene.add(new THREE.AmbientLight(0x7da4c7, 0.6));

const planeRoot = new THREE.Group();
scene.add(planeRoot);
planeRoot.add(buildPlaceholderPlane());
const loadedBomb = planeRoot.getObjectByName("loadedBomb");

const bullets = [];
const enemyBullets = [];
const bombs = [];
const flakShells = [];
const effects = [];
const keyState = new Set();
const speedLines = [];
const flight = {
  wreckVelocity: new THREE.Vector3(),
  wreckSpin: new THREE.Vector3(),
  crashing: false,
  position: START_POSITION.clone(),
  yaw: START_YAW,
  pitch: 0,
  roll: 0,
  speed: 58,
  gunCooldown: 0,
  bombCooldown: 0,
  propellerAngle: 0,
  diveLock: false,
  diveRecovering: false,
  flakShake: 0,
  hitsRemaining: PLAYER_HULL,
  destroyed: false,
};

const constants = {
  cruiseSpeed: 58,
  minSpeed: 34,
  maxSpeed: 118,
  boostExtraSpeed: 200,
  boostAcceleration: 46,
  bulletSpeed: 280,
  bombCooldownTime: 1,
  bombGravity: 38,
  minAltitude: 10,
  maxAltitude: 3400,
  diveSnapStart: Math.PI * 0.42,
  maxDivePitch: Math.PI * 0.5 - 0.01,
  maxClimbPitch: -1.05,
  diveLockPitchBand: 0.34,
  diveLockPitchAdjustRate: 1.35,
  diveLockYawAssist: 0.62,
  divePropBoost: 1.65,
  aimViewPitchScale: 0.22, // was 0.42
  aimViewRollScale: 0.22, // was 0.4
  cloudBaseAltitude: 1880,
  cloudTopAltitude: 2060,
  mapTurnRate: 2.4,
  flakRange: 1920,
  flakShellSpeed: 620,
  flakDamageRadius: 115,
  flakKillRadius: 85,
  enemyFireRange: 1600,
  enemyBulletSpeed: 410,
  enemyBulletHitRadius: 5.4,
  enemyDetectRange: 1280,
  enemyDisengageRange: 1350,
  enemyDiveDisengageRange: 2400,
  enemyPatrolSpeed: 118,
  enemyAttackSpeed: 118,
  enemyRegroupSpeed: 118,
  enemyTurnRate: 1.75,
  enemyDiveTurnRate: 1.25, // was 2.8
  enemyDiveCatchupSpeed: 185, // was 255
  enemyDiveAttackSpeed: 150, // was 170
  enemyAcceleration: 6, // was 8
  enemyDiveAcceleration: 14, // was 28
  enemyDeceleration: 8,
  enemyGuardPathFollow: 1.15,
  enemySeparationDistance: 150,
  enemySeparationWeight: 0.95,
  enemyAttackPassDistance: 120,
  enemyDivePassBehind: -210,
  enemyDivePassAhead: 360,
  enemyDiveRecoverAltitude: 1120,
  enemyDiveRecoverTrack: 320,
  enemyPulloutTurnRate: 2.1,
  enemyPulloutAttackSpeed: 138,
  enemyPulloutCatchupSpeed: 188,
  enemyPulloutAcceleration: 16,
  enemyPulloutPassBehind: -150,
  enemyPulloutPassAhead: 230,
  enemyPulloutRecoverTrack: 170,
  enemyRegroupDistance: 90,
  enemyWaveSpacing: 0.4,
  enemyWaveResetDelay: 1.7,
  enemyCloudFloor: 2100,
  enemyCloudChaseFloor: 1700,
  enemyIngressDistance: 320,
  enemyAttackDuration: 4.8,
  enemyOffmapDepth: 420,
  enemyGunCooldown: 0.09,
  fogNear: 700,
  fogFar: 5200,
};

const cameraState = {
  mode: 3, // 1 = close, 2 = rear gun, 3 = normal
  distance: 18,
  height: 6.4,
  lookAhead: 18,
  fov: 60,
  aimView: false,
  diveBlend: 0,
  orbitYaw: 0,
  orbitPitch: 0.18,
  dragging: false,
  pointerX: 0,
  pointerY: 0,
};

const audioState = {
  context: null,
  masterGain: null,
  noiseBuffer: null,
  engineOsc: null,
  engineLowOsc: null,
  engineNoise: null,
  engineToneGain: null,
  engineLowGain: null,
  engineNoiseGain: null,
};
const shipPlacements = [
  [-280, 2050],
  [-110, 2230],
  [80, 2010],
  [250, 2310],
  [430, 2130],
  [-360, 2510],
  [-190, 2690],
  [30, 2570],
  [260, 2750],
  [500, 2450],

  // added ships
  [-620, 2140],
  [-520, 2740],
  [-420, 3030],
  [-80, 3040],
  [180, 3180],
  [420, 3040],
  [690, 2720],
  [760, 2260],
  [-760, 2440],
  [650, 1980],
].map(([x, z]) => [x * 2.5, z]);

const enemyPlaneSpawns = [
  {
    center: [-340, 2180],
    altitude: 2160,
    radius: 170,
    angularSpeed: 0.22,
    phase: 0.2,
    attackMode: "dive",
  },
  {
    center: [310, 2210],
    altitude: 2185,
    radius: 180,
    angularSpeed: -0.2,
    phase: 1.8,
    attackMode: "dive",
  },
  {
    center: [-520, 2280],
    altitude: 1810,
    radius: 210,
    angularSpeed: 0.14,
    phase: 0.9,
    attackMode: "recover",
    patrolFloor: 1760,
    regroupAltitude: 1815,
  },
  {
    center: [520, 2360],
    altitude: 1830,
    radius: 220,
    angularSpeed: -0.15,
    phase: 2.2,
    attackMode: "recover",
    patrolFloor: 1770,
    regroupAltitude: 1835,
  },
];

function respawnEnemyPlane(enemy) {
  const angle = Math.random() * Math.PI * 2;
  const distance = MAP_HALF_SIZE + 350;

  const spawnPos = flight.position
    .clone()
    .add(
      new THREE.Vector3(
        Math.sin(angle) * distance,
        THREE.MathUtils.randFloat(1700, 2300),
        Math.cos(angle) * distance
      )
    );

  spawnPos.x = THREE.MathUtils.clamp(spawnPos.x, -MAP_HALF_SIZE, MAP_HALF_SIZE);
  spawnPos.z = THREE.MathUtils.clamp(spawnPos.z, -MAP_HALF_SIZE, MAP_HALF_SIZE);

  enemy.group.visible = true;
  enemy.alive = true;
  enemy.crashing = false;
  enemy.health = ENEMY_PLANE_HEALTH;
  enemy.state = "attack";
  enemy.fireCooldown = THREE.MathUtils.randFloat(0.8, 1.5);
  enemy.currentSpeed = constants.enemyPatrolSpeed;

  enemy.position.copy(spawnPos);

  enemy.forward = flight.position.clone().sub(enemy.position).normalize();

  enemy.visualForward = enemy.forward.clone();

  setEnemyPlaneTransform(enemy);
}
const sunVisual = buildSunVisual();
scene.add(sunVisual);
const targetShips = buildShipFleet(shipPlacements);
const enemyPlanes = buildEnemySquad(enemyPlaneSpawns);
const oceanSurface = buildOceanSurface();
scene.add(oceanSurface);
const cloudField = buildCloudField();
scene.add(cloudField);
const aaBoats = aaBoatPlacements.map(([x, z]) => buildAABoat(x, z));
window.addEventListener("resize", onResize);
window.addEventListener("keydown", (event) => {
  keyState.add(event.code);
  unlockAudio();
});
window.addEventListener("keyup", (event) => keyState.delete(event.code));
renderer.domElement.addEventListener("pointerdown", (event) => {
  unlockAudio();
  onPointerDown(event);
});
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
renderer.domElement.addEventListener("contextmenu", (event) =>
  event.preventDefault()
);
function spawnWingSpeedLine(wingX, speedFactor) {
  if (Math.random() > speedFactor * 0.55) return;

  const forward = getForward();
  const wingOffset = new THREE.Vector3(wingX, -0.65, 0.4).applyQuaternion(
    planeRoot.quaternion
  );

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 22 + speedFactor * 28, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18 + speedFactor * 0.28,
      depthWrite: false,
    })
  );

  mesh.position
    .copy(flight.position)
    .add(wingOffset)
    .addScaledVector(forward, -22);

  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    forward.clone().multiplyScalar(-1).normalize()
  );

  scene.add(mesh);

  speedLines.push({
    mesh,
    velocity: forward.clone().multiplyScalar(-flight.speed * 0.55),
    ttl: 0.18 + speedFactor * 0.12,
  });
}
function updateSpeedLines(dt) {
  const speedFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(
      105,
      constants.maxSpeed + constants.boostExtraSpeed,
      flight.speed
    ),
    0,
    1
  );

  if (!flight.destroyed && speedFactor > 0.05) {
    spawnWingSpeedLine(-7.8, speedFactor);
    spawnWingSpeedLine(7.8, speedFactor);
  }

  for (let i = speedLines.length - 1; i >= 0; i--) {
    const line = speedLines[i];

    line.ttl -= dt;
    line.mesh.material.opacity = Math.max(
      0,
      line.mesh.material.opacity - 2.8 * dt
    );
    line.mesh.position.addScaledVector(line.velocity, dt);

    if (line.ttl <= 0) {
      scene.remove(line.mesh);
      speedLines.splice(i, 1);
    }
  }
}
function updateAABoatFlak(dt) {
  for (const boat of aaBoats) {
    if (!boat.alive) continue;

    boat.flakCooldown -= dt;

    const rangeToPlane = boat.group.position.distanceTo(flight.position);
    if (rangeToPlane > 1200 || boat.flakCooldown > 0) continue;

    const origin = boat.group.position.clone().add(new THREE.Vector3(0, 5, 0));

    const aimPoint = flight.position
      .clone()
      .addScaledVector(getForward(), 35)
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 30
        )
      );

    const direction = aimPoint.sub(origin).normalize();

    spawnEnemyBullet(origin, direction);

    boat.flakCooldown = THREE.MathUtils.randFloat(0.18, 0.45);
  }
}
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  updateFlight(dt);
  updateSpeedLines(dt);
  updatePlayerWreck(dt);
  updateEngineSound(dt);
  updatePlaneVisual();
  updateRearGunVisual();
  updateEnemyPlanes(dt);
  updateEnemyWrecks(dt);
  updateAtmosphere(dt);
  updateCamera(dt);
  updateOceanSurface();
  updateSunVisual();
  updateBullets(dt);
  updateEnemyBullets(dt);
  updateBombs(dt);
  updateFlak(dt);
  updateShipTurrets(dt);
  updateAABoatFlak(dt);
  updateSinkingShips(dt);
  updateEffects(dt);

  // updateTelemetry();
  // updateReticle();
  // updateMinimap();
  renderer.render(scene, camera);
});

function buildPlaceholderPlane() {
  const group = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({
    color: 0xff8000,
    flatShading: true,
  });
  const wing = new THREE.MeshStandardMaterial({
    color: 0xff8000,
    flatShading: true,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9bcbe6,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1e2430,
    flatShading: true,
  });

  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.35, 7.2), navy);
  fuselage.position.set(0, 0.05, 0.15);
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.72, 2.0, 6), navy);
  nose.rotation.x = Math.PI * 0.5;
  nose.position.z = 4.65;
  group.add(nose);

  const engineFront = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.78, 0.7, 12),
    dark
  );
  engineFront.rotation.x = Math.PI * 0.5;
  engineFront.position.z = 3.85;
  group.add(engineFront);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.72, 1.6), glass);
  canopy.position.set(0, 0.82, 1.15);
  group.add(canopy);

  const centerWing = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 0.22, 2.5),
    wing
  );
  centerWing.position.set(0, -0.2, 0.65);
  group.add(centerWing);

  const leftInnerWing = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.22, 1.9),
    wing
  );
  leftInnerWing.position.set(-2.8, -0.58, 0.55);
  leftInnerWing.rotation.z = 0.22;
  group.add(leftInnerWing);

  const rightInnerWing = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.22, 1.9),
    wing
  );
  rightInnerWing.position.set(2.8, -0.58, 0.55);
  rightInnerWing.rotation.z = -0.22;
  group.add(rightInnerWing);

  const leftOuterWing = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.2, 1.65),
    wing
  );
  leftOuterWing.position.set(-5.6, -0.8, 0.55);
  leftOuterWing.rotation.z = -0.12;
  group.add(leftOuterWing);

  const rightOuterWing = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.2, 1.65),
    wing
  );
  rightOuterWing.position.set(5.6, -0.8, 0.55);
  rightOuterWing.rotation.z = 0.12;
  group.add(rightOuterWing);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 0.95), wing);
  tailWing.position.set(0, 0.18, -3.1);
  group.add(tailWing);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.7, 1.15), navy);
  fin.position.set(0, 0.98, -3.2);
  group.add(fin);

  const prop = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.12), dark);
  prop.position.set(0, 0, 5.05);
  prop.name = "propeller";
  group.add(prop);

  const bombRack = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.12, 1.35),
    dark
  );
  bombRack.position.set(0, -0.92, 0.9);
  group.add(bombRack);

  const bombMount = buildBombVisual("loadedBomb");
  bombMount.position.set(0, -1.18, 0.92);
  bombMount.scale.setScalar(0.92);
  group.add(bombMount);
  const rearGunPivot = new THREE.Group();
  rearGunPivot.name = "rearGunPivot";
  rearGunPivot.position.set(0, 1.05, 0.25); // back/top of cockpit area
  group.add(rearGunPivot);

  const rearGunBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.22, 0.45),
    dark
  );
  rearGunPivot.add(rearGunBase);

  const rearGunBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 1.9, 8),
    dark
  );
  rearGunBarrel.name = "rearGunBarrel";
  rearGunBarrel.rotation.x = Math.PI * 0.5;
  rearGunBarrel.position.z = -1.05;
  rearGunPivot.add(rearGunBarrel);
  return group;
}
function updateRearGunVisual() {
  const pivot = planeRoot.getObjectByName("rearGunPivot");
  if (!pivot) return;

  pivot.rotation.order = "YXZ";
  pivot.rotation.y = rearTurret.yaw;
  pivot.rotation.x = -rearTurret.pitch;
}
function buildBombVisual(name = "") {
  const group = new THREE.Group();
  group.name = name;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x333537,
    flatShading: true,
  });
  const finMaterial = new THREE.MeshStandardMaterial({
    color: 0x232629,
    flatShading: true,
  });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 1.15, 10),
    bodyMaterial
  );
  body.rotation.x = Math.PI * 0.5;
  group.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.42, 10),
    bodyMaterial
  );
  nose.rotation.x = Math.PI * 0.5;
  nose.position.z = 0.78;
  group.add(nose);

  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 0.32, 8),
    finMaterial
  );
  tail.rotation.x = Math.PI * 0.5;
  tail.position.z = -0.7;
  group.add(tail);

  const finA = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.04, 0.24),
    finMaterial
  );
  finA.position.z = -0.86;
  group.add(finA);

  const finB = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.42, 0.24),
    finMaterial
  );
  finB.position.z = -0.86;
  group.add(finB);

  return group;
}

function buildEnemyPlaneVisual() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x19bd39,
    flatShading: true,
  });
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: 0x19bd39,
    flatShading: true,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x8aa9bc,
    flatShading: true,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x20242a,
    flatShading: true,
  });

  const fuselage = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 1.0, 5.5),
    bodyMaterial
  );
  fuselage.position.set(0, 0.02, 0.05);
  group.add(fuselage);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.56, 1.5, 6),
    bodyMaterial
  );
  nose.rotation.x = Math.PI * 0.5;
  nose.position.z = 3.45;
  group.add(nose);

  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.48, 1.05),
    glassMaterial
  );
  canopy.position.set(0, 0.54, 0.7);
  group.add(canopy);

  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(7.4, 0.18, 1.35),
    wingMaterial
  );
  wing.position.set(0, -0.18, 0.4);
  group.add(wing);

  const tailWing = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.14, 0.72),
    wingMaterial
  );
  tailWing.position.set(0, 0.12, -2.35);
  group.add(tailWing);

  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 1.2, 0.9),
    bodyMaterial
  );
  fin.position.set(0, 0.72, -2.45);
  group.add(fin);

  const prop = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.06, 0.1),
    darkMaterial
  );
  prop.position.set(0, 0, 3.92);
  prop.name = "propeller";
  group.add(prop);

  return group;
}

function buildEnemySquad(spawns) {
  return spawns.map((spawn, index) => {
    const group = buildEnemyPlaneVisual();
    scene.add(group);
    const startPosition = new THREE.Vector3(
      spawn.center[0] + Math.cos(spawn.phase) * spawn.radius,
      spawn.altitude + Math.sin(spawn.phase * 0.85 + (0.7 + index * 1.4)) * 26,
      spawn.center[1] + Math.sin(spawn.phase) * spawn.radius * 0.72
    );
    const nextPosition = getEnemyPlanePosition(
      {
        center: new THREE.Vector3(
          spawn.center[0],
          spawn.altitude,
          spawn.center[1]
        ),
        radius: spawn.radius,
        bobPhase: 0.7 + index * 1.4,
      },
      spawn.phase + spawn.angularSpeed * 0.12
    );
    const startForward = nextPosition.clone().sub(startPosition).normalize();
    const enemy = {
      group,
      center: new THREE.Vector3(
        spawn.center[0],
        spawn.altitude,
        spawn.center[1]
      ),
      radius: spawn.radius,
      angularSpeed: spawn.angularSpeed,
      phase: spawn.phase,
      basePhase: spawn.phase,
      bobPhase: 0.7 + index * 1.4,
      health: ENEMY_PLANE_HEALTH,
      alive: true,
      hitRadius: 4.8,
      attackMode: spawn.attackMode ?? "dive",
      patrolFloor: spawn.patrolFloor ?? constants.enemyCloudFloor + 20,
      regroupAltitude:
        spawn.regroupAltitude ??
        Math.max(
          constants.enemyCloudFloor + 36,
          spawn.altitude + 20 + (index % 3) * 18
        ),
      fireCooldown: 0.8 + index * 0.35,
      burstShotsLeft: 0,
      burstShotTimer: 0,
      state: "guard",
      waveIndex: index % 3,
      stateTimer: 0.8 + (index % 3) * constants.enemyWaveSpacing,
      regroupPoint: new THREE.Vector3(
        spawn.center[0] + (index % 2 === 0 ? -90 : 90),
        spawn.regroupAltitude ??
          Math.max(
            constants.enemyCloudFloor + 36,
            spawn.altitude + 20 + (index % 3) * 18
          ),
        spawn.center[1] - 140 - (index % 4) * 35
      ),
      fireCooldown: 0.8 + index * 0.35,
      propellerAngle: Math.random() * Math.PI * 2,
      position: startPosition,
      forward: startForward,
      visualForward: startForward.clone(),
      currentSpeed: constants.enemyPatrolSpeed,
    };
    setEnemyPlaneTransform(enemy);
    return enemy;
  });
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function beginEnemyRegroup(enemy, extraDelay = 0) {
  enemy.state = "regroup";
  enemy.stateTimer = Math.max(
    enemy.stateTimer,
    constants.enemyWaveResetDelay + enemy.waveIndex * 0.22 + extraDelay
  );

  const forwardCarry = enemy.forward.clone().setY(0).normalize();
  if (forwardCarry.lengthSq() < 0.001) {
    forwardCarry.set(0, 0, 1);
  }

  const recoveryPoint = enemy.position
    .clone()
    .addScaledVector(forwardCarry, 340)
    .lerp(
      new THREE.Vector3(enemy.center.x, enemy.position.y, enemy.center.z - 40),
      0.28
    );
  recoveryPoint.y = enemy.regroupAltitude;
  enemy.regroupPoint.copy(recoveryPoint);
}

function setEnemyPlaneTransform(enemy) {
  const position = enemy.position ?? getEnemyPlanePosition(enemy, enemy.phase);
  const forward =
    enemy.visualForward ??
    enemy.forward ??
    getEnemyPlanePosition(enemy, enemy.phase + enemy.angularSpeed * 0.12)
      .sub(position.clone())
      .normalize();

  enemy.group.position.copy(position);
  enemy.group.rotation.order = "YXZ";
  enemy.group.rotation.y = Math.atan2(forward.x, forward.z);
  enemy.group.rotation.x = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
  enemy.group.rotation.z =
    enemy.state === "attack"
      ? -0.16 * Math.sign(enemy.angularSpeed || 1)
      : enemy.state === "regroup"
      ? -0.24 * Math.sign(enemy.angularSpeed || 1)
      : -0.34 * Math.sign(enemy.angularSpeed || 1);

  const propeller = enemy.group.getObjectByName("propeller");
  if (propeller) {
    propeller.rotation.z = enemy.propellerAngle;
  }
}

function getEnemyPlanePosition(enemy, phase) {
  return new THREE.Vector3(
    enemy.center.x + Math.cos(phase) * enemy.radius,
    Math.max(
      enemy.patrolFloor,
      enemy.center.y + Math.sin(phase * 0.85 + enemy.bobPhase) * 26
    ),
    enemy.center.z + Math.sin(phase) * enemy.radius * 0.72
  );
}

function unlockAudio() {
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  if (!audioState.context) {
    const context = new AudioContextCtor();
    const masterGain = context.createGain();
    masterGain.gain.value = 0.26;
    masterGain.connect(context.destination);

    audioState.context = context;
    audioState.masterGain = masterGain;
    audioState.noiseBuffer = createNoiseBuffer(context, 1.2);
    initializeEngineSound();
  }

  if (audioState.context.state === "suspended") {
    audioState.context.resume();
  }
}

function initializeEngineSound() {
  if (!audioState.context || !audioState.masterGain || audioState.engineOsc) {
    return;
  }

  const ctx = audioState.context;

  const engineOsc = ctx.createOscillator();
  engineOsc.type = "sawtooth";
  engineOsc.frequency.value = 70;

  const engineLowOsc = ctx.createOscillator();
  engineLowOsc.type = "triangle";
  engineLowOsc.frequency.value = 36;

  const engineNoise = ctx.createBufferSource();
  engineNoise.buffer = audioState.noiseBuffer;
  engineNoise.loop = true;

  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = "lowpass";
  toneFilter.frequency.value = 680;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 180;
  noiseFilter.Q.value = 0.6;

  const engineToneGain = ctx.createGain();
  engineToneGain.gain.value = 0.001;

  const engineLowGain = ctx.createGain();
  engineLowGain.gain.value = 0.001;

  const engineNoiseGain = ctx.createGain();
  engineNoiseGain.gain.value = 0.001;

  engineOsc.connect(toneFilter);
  toneFilter.connect(engineToneGain);
  engineToneGain.connect(audioState.masterGain);

  engineLowOsc.connect(engineLowGain);
  engineLowGain.connect(audioState.masterGain);

  engineNoise.connect(noiseFilter);
  noiseFilter.connect(engineNoiseGain);
  engineNoiseGain.connect(audioState.masterGain);

  const now = ctx.currentTime;
  engineOsc.start(now);
  engineLowOsc.start(now);
  engineNoise.start(now);

  audioState.engineOsc = engineOsc;
  audioState.engineLowOsc = engineLowOsc;
  audioState.engineNoise = engineNoise;
  audioState.engineToneGain = engineToneGain;
  audioState.engineLowGain = engineLowGain;
  audioState.engineNoiseGain = engineNoiseGain;
}

function createNoiseBuffer(context, duration) {
  const sampleRate = context.sampleRate;
  const frameCount = Math.floor(sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createDistanceGain(position, maxDistance) {
  const distance = position.distanceTo(flight.position);
  return THREE.MathUtils.clamp(1 - distance / maxDistance, 0, 1);
}

function playGunfireSound() {
  if (!audioState.context || !audioState.masterGain) return;
  const ctx = audioState.context;
  const now = ctx.currentTime;

  const body = ctx.createOscillator();
  body.type = "square";
  body.frequency.setValueAtTime(180, now);
  body.frequency.exponentialRampToValueAtTime(120, now + 0.05);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.001, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.08, now + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  const crack = ctx.createBufferSource();
  crack.buffer = audioState.noiseBuffer;
  const crackFilter = ctx.createBiquadFilter();
  crackFilter.type = "highpass";
  crackFilter.frequency.value = 900;
  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(0.001, now);
  crackGain.gain.exponentialRampToValueAtTime(0.07, now + 0.003);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

  body.connect(bodyGain);
  bodyGain.connect(audioState.masterGain);
  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(audioState.masterGain);

  body.start(now);
  body.stop(now + 0.07);
  crack.start(now);
  crack.stop(now + 0.05);
}

function playEnemyGunfireSound(position) {
  if (!audioState.context || !audioState.masterGain) return;
  const distanceGain = createDistanceGain(position, 2200);
  if (distanceGain <= 0.02) return;

  const ctx = audioState.context;
  const now = ctx.currentTime;

  const body = ctx.createOscillator();
  body.type = "sawtooth";
  body.frequency.setValueAtTime(135, now);
  body.frequency.exponentialRampToValueAtTime(96, now + 0.06);

  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "lowpass";
  bodyFilter.frequency.setValueAtTime(380, now); // lower = more muffled
  bodyFilter.Q.value = 0.7;

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.001, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.085 * distanceGain, now + 0.005);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

  const crack = ctx.createBufferSource();
  crack.buffer = audioState.noiseBuffer;
  const crackFilter = ctx.createBiquadFilter();
  crackFilter.type = "lowpass";
  crackFilter.frequency.setValueAtTime(700, now); // kills sharp "crack"

  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(0.001, now);
  crackGain.gain.exponentialRampToValueAtTime(
    0.065 * distanceGain,
    now + 0.003
  );
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  body.connect(bodyFilter);
  bodyFilter.connect(bodyGain);
  bodyGain.connect(audioState.masterGain);
  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(audioState.masterGain);

  body.start(now);
  body.stop(now + 0.08);
  crack.start(now);
  crack.stop(now + 0.055);
}

function updateEngineSound(dt) {
  if (
    !audioState.context ||
    !audioState.engineOsc ||
    !audioState.engineLowOsc ||
    !audioState.engineToneGain ||
    !audioState.engineLowGain ||
    !audioState.engineNoiseGain
  ) {
    return;
  }

  const speedBlend = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(
      constants.minSpeed,
      constants.maxSpeed + constants.boostExtraSpeed,
      flight.speed
    ),
    0,
    1
  );
  const diveFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(0.35, constants.maxDivePitch, flight.pitch),
    0,
    1
  );
  const diveBoost = flight.diveLock
    ? 1 + diveFactor * 0.42
    : 1 + diveFactor * 0.18;
  const activeFactor = flight.destroyed ? 0.15 : 1;
  const toneFreq =
    THREE.MathUtils.lerp(72, 148, speedBlend) * diveBoost * activeFactor;
  const lowFreq =
    THREE.MathUtils.lerp(34, 54, speedBlend) *
    (1 + diveFactor * 0.16) *
    activeFactor;
  const toneGain =
    THREE.MathUtils.lerp(0.03, 0.06, speedBlend) *
    (1 + diveFactor * 0.24) *
    activeFactor;
  const lowGain =
    THREE.MathUtils.lerp(0.025, 0.045, speedBlend) *
    (1 + diveFactor * 0.18) *
    activeFactor;
  const noiseGain =
    THREE.MathUtils.lerp(0.012, 0.028, speedBlend) *
    (1 + diveFactor * 0.42) *
    activeFactor;

  const now = audioState.context.currentTime;
  const smoothTime = Math.max(0.03, dt * 1.6);
  audioState.engineOsc.frequency.linearRampToValueAtTime(
    toneFreq,
    now + smoothTime
  );
  audioState.engineLowOsc.frequency.linearRampToValueAtTime(
    lowFreq,
    now + smoothTime
  );
  audioState.engineToneGain.gain.linearRampToValueAtTime(
    toneGain,
    now + smoothTime
  );
  audioState.engineLowGain.gain.linearRampToValueAtTime(
    lowGain,
    now + smoothTime
  );
  audioState.engineNoiseGain.gain.linearRampToValueAtTime(
    noiseGain,
    now + smoothTime
  );
}
function updateShipTurrets(dt) {
  for (const ship of targetShips) {
    if (!ship.alive || !ship.turret || !ship.turret.alive) continue;

    ship.turretCooldown ??= Math.random() * 0.8;
    ship.turretCooldown -= dt;

    const turretPos = ship.turret.group.getWorldPosition(new THREE.Vector3());
    const rangeToPlayer = turretPos.distanceTo(flight.position);

    if (rangeToPlayer > 1200 || ship.turretCooldown > 0) continue;

    const aimPoint = flight.position
      .clone()
      .addScaledVector(getForward(), 35)
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 35,
          (Math.random() - 0.5) * 25,
          (Math.random() - 0.5) * 35
        )
      );

    const direction = aimPoint.sub(turretPos).normalize();

    spawnEnemyBullet(turretPos, direction);

    ship.turretCooldown = THREE.MathUtils.randFloat(0.45, 1.1);
  }
}
function playWaterImpactSound(position, strength = 1) {
  if (!audioState.context || !audioState.masterGain) return;
  const distanceGain = createDistanceGain(position, 1800);
  if (distanceGain <= 0.01) return;

  const ctx = audioState.context;
  const now = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = audioState.noiseBuffer;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 340 + 220 * strength;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(
    0.08 * strength * distanceGain,
    now + 0.015
  );
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34 + strength * 0.12);

  const thump = ctx.createOscillator();
  thump.type = "triangle";
  thump.frequency.setValueAtTime(95 + 25 * strength, now);
  thump.frequency.exponentialRampToValueAtTime(52, now + 0.22);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.001, now);
  thumpGain.gain.exponentialRampToValueAtTime(
    0.045 * strength * distanceGain,
    now + 0.01
  );
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

  noise.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(audioState.masterGain);
  thump.connect(thumpGain);
  thumpGain.connect(audioState.masterGain);

  noise.start(now);
  noise.stop(now + 0.42 + strength * 0.15);
  thump.start(now);
  thump.stop(now + 0.26);
}

function playShipExplosionSound(position) {
  if (!audioState.context || !audioState.masterGain) return;
  const distanceGain = createDistanceGain(position, 3200);
  if (distanceGain <= 0.01) return;

  const ctx = audioState.context;
  const now = ctx.currentTime;

  const boom = ctx.createOscillator();
  boom.type = "sawtooth";
  boom.frequency.setValueAtTime(88, now);
  boom.frequency.exponentialRampToValueAtTime(34, now + 0.65);
  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(0.001, now);
  boomGain.gain.exponentialRampToValueAtTime(0.18 * distanceGain, now + 0.015);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

  const blast = ctx.createBufferSource();
  blast.buffer = audioState.noiseBuffer;
  const blastFilter = ctx.createBiquadFilter();
  blastFilter.type = "bandpass";
  blastFilter.frequency.value = 420;
  blastFilter.Q.value = 0.8;
  const blastGain = ctx.createGain();
  blastGain.gain.setValueAtTime(0.001, now);
  blastGain.gain.exponentialRampToValueAtTime(0.26 * distanceGain, now + 0.02);
  blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

  const tail = ctx.createBufferSource();
  tail.buffer = audioState.noiseBuffer;
  const tailFilter = ctx.createBiquadFilter();
  tailFilter.type = "lowpass";
  tailFilter.frequency.value = 240;
  const tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(0.001, now + 0.08);
  tailGain.gain.exponentialRampToValueAtTime(0.1 * distanceGain, now + 0.16);
  tailGain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

  boom.connect(boomGain);
  boomGain.connect(audioState.masterGain);
  blast.connect(blastFilter);
  blastFilter.connect(blastGain);
  blastGain.connect(audioState.masterGain);
  tail.connect(tailFilter);
  tailFilter.connect(tailGain);
  tailGain.connect(audioState.masterGain);

  boom.start(now);
  boom.stop(now + 0.8);
  blast.start(now);
  blast.stop(now + 1.0);
  tail.start(now + 0.08);
  tail.stop(now + 1.4);
}

function playFlakBurstSound(position) {
  if (!audioState.context || !audioState.masterGain) return;
  const distanceGain = createDistanceGain(position, 2200);
  if (distanceGain <= 0.01) return;

  const ctx = audioState.context;
  const now = ctx.currentTime;

  const blast = ctx.createBufferSource();
  blast.buffer = audioState.noiseBuffer;
  const blastFilter = ctx.createBiquadFilter();
  blastFilter.type = "lowpass";
  blastFilter.frequency.value = 280;
  const blastGain = ctx.createGain();
  blastGain.gain.setValueAtTime(0.001, now);
  blastGain.gain.exponentialRampToValueAtTime(0.18 * distanceGain, now + 0.014);
  blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

  const boom = ctx.createOscillator();
  boom.type = "sine";
  boom.frequency.setValueAtTime(82, now);
  boom.frequency.exponentialRampToValueAtTime(38, now + 0.55);
  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(0.001, now);
  boomGain.gain.exponentialRampToValueAtTime(0.095 * distanceGain, now + 0.028);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

  const tail = ctx.createBufferSource();
  tail.buffer = audioState.noiseBuffer;
  const tailFilter = ctx.createBiquadFilter();
  tailFilter.type = "lowpass";
  tailFilter.frequency.value = 190;
  const tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(0.001, now + 0.05);
  tailGain.gain.exponentialRampToValueAtTime(0.075 * distanceGain, now + 0.14);
  tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.82);

  blast.connect(blastFilter);
  blastFilter.connect(blastGain);
  blastGain.connect(audioState.masterGain);
  boom.connect(boomGain);
  boomGain.connect(audioState.masterGain);
  tail.connect(tailFilter);
  tailFilter.connect(tailGain);
  tailGain.connect(audioState.masterGain);

  blast.start(now);
  blast.stop(now + 0.42);
  boom.start(now);
  boom.stop(now + 0.66);
  tail.start(now + 0.04);
  tail.stop(now + 0.88);
}

function playBombFallSound(position) {
  if (!audioState.context || !audioState.masterGain) return;
  const distanceGain = createDistanceGain(position, 2000);
  if (distanceGain <= 0.01) return;

  const ctx = audioState.context;
  const now = ctx.currentTime;

  const whistle = ctx.createOscillator();
  whistle.type = "triangle";
  whistle.frequency.setValueAtTime(1280, now);
  whistle.frequency.exponentialRampToValueAtTime(420, now + 0.9);
  const whistleFilter = ctx.createBiquadFilter();
  whistleFilter.type = "bandpass";
  whistleFilter.frequency.value = 820;
  whistleFilter.Q.value = 2.8;
  const whistleGain = ctx.createGain();
  whistleGain.gain.setValueAtTime(0.001, now);
  whistleGain.gain.exponentialRampToValueAtTime(
    0.055 * distanceGain,
    now + 0.03
  );
  whistleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

  const air = ctx.createBufferSource();
  air.buffer = audioState.noiseBuffer;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "highpass";
  airFilter.frequency.value = 750;
  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(0.001, now);
  airGain.gain.exponentialRampToValueAtTime(0.03 * distanceGain, now + 0.04);
  airGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

  whistle.connect(whistleFilter);
  whistleFilter.connect(whistleGain);
  whistleGain.connect(audioState.masterGain);
  air.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(audioState.masterGain);

  whistle.start(now);
  whistle.stop(now + 0.95);
  air.start(now);
  air.stop(now + 0.82);
}

function buildSunVisual() {
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(42, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false })
  );
  sunMesh.renderOrder = 1;
  return sunMesh;
}

function buildOceanSurface() {
  const ocean = new THREE.Mesh(
    new THREE.CircleGeometry(MAP_HALF_SIZE + 1400, 120),
    new THREE.MeshStandardMaterial({
      color: OCEAN_COLOR,
      roughness: 0.95,
      metalness: 0.02,
      fog: true,
    })
  );
  ocean.rotation.x = -Math.PI * 0.5;
  ocean.position.y = -2;
  return ocean;
}

function buildCloudField() {
  const group = new THREE.Group();
  const rng = createFixedRandom(1337);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const cloudHeightRange =
    constants.cloudTopAltitude - constants.cloudBaseAltitude;

  function addCluster(baseX, baseY, baseZ, densityScale = 1) {
    const cluster = new THREE.Group();
    const puffCount = 5 + Math.floor(rng() * 6 * densityScale);

    for (let j = 0; j < puffCount; j += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(80 + rng() * (140 * densityScale), 10, 10),
        material
      );
      puff.position.set(
        (rng() * 2 - 1) * (120 * densityScale),
        (rng() * 2 - 1) * 30, // more vertical variation
        (rng() * 2 - 1) * (120 * densityScale)
      );
      puff.rotation.y = (rng() - 0.5) * 0.45;
      puff.scale.y *= 0.5;
      puff.material.opacity = 0.7 + rng() * 0.2;
      cluster.add(puff);
    }

    cluster.position.set(baseX, baseY, baseZ);
    group.add(cluster);
  }

  for (let i = 0; i < 70; i += 1) {
    const baseX = (rng() * 2 - 1) * (MAP_HALF_SIZE - 240);
    const baseZ = (rng() * 2 - 1) * (MAP_HALF_SIZE - 240);
    const baseY = constants.cloudBaseAltitude + rng() * cloudHeightRange;
    addCluster(baseX, baseY, baseZ, 1);
  }

  const fleetCenterX =
    shipPlacements.reduce((sum, placement) => sum + placement[0], 0) /
    shipPlacements.length;
  const fleetCenterZ =
    shipPlacements.reduce((sum, placement) => sum + placement[1], 0) /
    shipPlacements.length;

  for (let i = 0; i < 32; i += 1) {
    const baseX = fleetCenterX + (rng() * 2 - 1) * 720;
    const baseZ = fleetCenterZ + (rng() * 2 - 1) * 840;
    const baseY =
      constants.cloudBaseAltitude + 20 + rng() * (cloudHeightRange - 30);
    addCluster(baseX, baseY, baseZ, 1.45);
  }

  return group;
}

function createFixedRandom(seedValue) {
  let seed = seedValue >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function buildTargetShip(x, y) {
  const group = new THREE.Group();
  group.userData.startY = 0;
  group.position.set(x, 0, y);
  group.scale.setScalar(SHIP_SCALE);

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x56606e,
    flatShading: true,
  });
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a7f66,
    flatShading: true,
  });
  const detailMaterial = new THREE.MeshStandardMaterial({
    color: 0xc2c7ce,
    flatShading: true,
  });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(20, 2.8, 72), hullMaterial);
  hull.position.y = 1.9;
  group.add(hull);

  // const bow = new THREE.Mesh(new THREE.ConeGeometry(10, 16, 6), hullMaterial);
  // bow.rotation.x = Math.PI * 0.5;
  // bow.rotation.z = Math.PI;
  // bow.position.set(0, 1.9, 44);
  // group.add(bow);

  const stern = new THREE.Mesh(
    new THREE.BoxGeometry(16, 2.4, 14),
    hullMaterial
  );
  stern.position.set(0, 1.8, -37);
  group.add(stern);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 52), deckMaterial);
  deck.position.set(0, 3.6, -2);
  group.add(deck);

  const towerBase = new THREE.Mesh(
    new THREE.BoxGeometry(8, 6, 10),
    detailMaterial
  );
  towerBase.position.set(0, 6.8, -6);
  group.add(towerBase);

  const towerTop = new THREE.Mesh(
    new THREE.BoxGeometry(5, 4, 6),
    detailMaterial
  );
  towerTop.position.set(0, 11.2, -5);
  group.add(towerTop);

  const funnel = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 3), hullMaterial);
  funnel.position.set(0, 9.2, 9);
  group.add(funnel);

  const mast = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 9, 0.4),
    detailMaterial
  );
  mast.position.set(0, 13.4, -2);
  group.add(mast);

  const mastCross = new THREE.Mesh(
    new THREE.BoxGeometry(5, 0.3, 0.3),
    detailMaterial
  );
  mastCross.position.set(0, 15.2, -2);
  group.add(mastCross);

  const wake = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.1, 45),
    new THREE.MeshStandardMaterial({
      color: 0xe6eef5,
      transparent: true,
      opacity: 0.4,
      flatShading: true,
    })
  );
  wake.position.set(0, 0.05, -64);
  group.add(wake);

  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16, 14, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff2a2a,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    })
  );
  hitbox.position.y = 7;
  hitbox.name = "hitbox";
  hitbox.visible = false;
  group.add(hitbox);
  const turret = new THREE.Group();

  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.4, 1.0, 12),
    detailMaterial
  );
  turretBase.position.y = 4.6;
  turret.add(turretBase);

  const turretGun = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0x20242a,
      flatShading: true,
    })
  );
  turretGun.rotation.x = Math.PI * 0.5;
  turretGun.position.set(0, 5.0, 6);
  turret.add(turretGun);

  turret.position.set(0, 0, 22);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
      transparent: true,
      opacity: 0.9,
    })
  );

  marker.position.set(0, 7, 0);
  turret.add(marker);

  group.add(turret);

  return {
    group,
    radius: 16 * SHIP_SCALE,
    alive: true,
    turret: {
      group: turret,
      alive: true,
      health: SHIP_TURRET_HEALTH,
      radius: 5 * SHIP_SCALE,
    },
    health: SHIP_HEALTH,
    flakCooldown: 1.2,
  };
}

function buildShipFleet(placements) {
  return placements.map(([x, z], index) => {
    const ship = buildTargetShip(x, z);
    ship.group.rotation.y = (index % 2 === 0 ? 1 : -1) * 0.08;
    scene.add(ship.group);
    return ship;
  });
}
function crashPlayerIntoWater() {
  if (flight.destroyed) return;

  flight.destroyed = true;
  flight.speed = 0;
  flight.roll = 0;
  flight.flakShake = 3.2;
  planeRoot.visible = false;

  spawnWaterSplash(flight.position, {
    radius: 10,
    height: 24,
    ttl: 1.1,
    grow: 34,
    fade: 1.3,
  });

  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(9, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0x3f4147,
      transparent: true,
      opacity: 0.75,
    })
  );

  smoke.position.copy(flight.position).add(new THREE.Vector3(0, 8, 0));
  scene.add(smoke);
  effects.push({ mesh: smoke, ttl: 2.5, grow: 9, rise: 12, fade: 0.32 });
}

function updateFlight(dt) {
  if (consumeSinglePress("Digit2")) {
    cameraState.mode = 2;
    cameraState.aimView = false;
    enterPointerLock();
  }

  if (consumeSinglePress("Digit1")) {
    cameraState.mode = 1;
    cameraState.aimView = true;
    exitPointerLock();
  }

  if (consumeSinglePress("Digit3")) {
    cameraState.mode = 3;
    cameraState.aimView = false;
    exitPointerLock();
  }
  if (consumeSinglePress("Digit4")) cameraState.mode = 4;
  if (consumeSinglePress("Digit5")) cameraState.mode = 5;
  if (consumeSinglePress("Digit6")) cameraState.mode = 6; // front of plane
  if (consumeSinglePress("Digit7")) cameraState.mode = 7; // back of plane
  if (consumeSinglePress("KeyQ")) {
    cameraState.mode = cameraState.mode === 1 ? 3 : 1;
    cameraState.aimView = cameraState.mode === 1;
  }

  if (consumeSinglePress("Digit0")) {
    resetFlight();
    return;
  }

  if (flight.destroyed) {
    return;
  }

  let pitchInput = 0;
  if (keyState.has("KeyW")) pitchInput += 1;
  if (keyState.has("KeyS")) pitchInput -= 1;

  let rollInput = 0;
  if (keyState.has("KeyA")) rollInput -= 0.5;
  if (keyState.has("KeyD")) rollInput += 0.5;

  if (cameraState.aimView || cameraState.mode === 2) {
    pitchInput *= 0.22;
    rollInput *= 0.22;
  }

  if (consumeSinglePress("KeyE")) {
    if (flight.diveLock) {
      flight.diveLock = false;
      flight.diveRecovering = true;
    } else {
      flight.diveLock = true;
      flight.diveRecovering = false;
    }
  }

  const proposedPitch = THREE.MathUtils.clamp(
    flight.pitch + pitchInput * 1.08 * dt,
    constants.maxClimbPitch,
    constants.maxDivePitch
  );

  const diveLockTargetPitch = THREE.MathUtils.clamp(
    flight.pitch + pitchInput * constants.diveLockPitchAdjustRate * dt,
    constants.maxDivePitch - constants.diveLockPitchBand,
    constants.maxDivePitch
  );

  flight.pitch = flight.diveLock
    ? THREE.MathUtils.damp(flight.pitch, diveLockTargetPitch, 9, dt)
    : proposedPitch;

  if (flight.diveRecovering) {
    flight.pitch = THREE.MathUtils.damp(flight.pitch, -0.22, 3.2, dt);
  }

  const targetRoll = flight.diveLock
    ? rollInput * 0.46
    : flight.diveRecovering
    ? 0
    : rollInput * 0.96;
  flight.roll = THREE.MathUtils.damp(flight.roll, targetRoll, 6, dt);
  const boosting = keyState.has("ShiftLeft") || keyState.has("ShiftRight");

  const boostSpeedFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(
      constants.maxSpeed,
      constants.maxSpeed + constants.boostExtraSpeed,
      flight.speed
    ),
    0,
    1
  );

  // at full boost, turning is about 25% slower
  const boostTurnPenalty = boosting
    ? THREE.MathUtils.lerp(1, 0.75, boostSpeedFactor)
    : 1;

  flight.yaw += flight.roll * (0.6 + flight.speed / 82) * boostTurnPenalty * dt;
  if (flight.diveLock) {
    flight.yaw += rollInput * constants.diveLockYawAssist * dt;
  }

  // how hard you're turning (based on roll)
  const turnFactor = Math.abs(flight.roll); // 0 → straight, ~1 → hard turn

  // reduce boost when turning hard
  const turnPenalty = THREE.MathUtils.lerp(1, 0.4, turnFactor);

  // final boost scale
  const boostScale = turnPenalty;

  const boostAccel = boosting ? constants.boostAcceleration * boostScale : 0;
  const speedDelta =
    flight.pitch * 26 +
    boostAccel -
    (flight.speed - constants.cruiseSpeed - boostAccel) * 0.9;
  flight.speed = THREE.MathUtils.clamp(
    flight.speed + speedDelta * dt,
    constants.minSpeed,
    constants.maxSpeed + boostAccel
  );
  const forward = getForward();

  flight.position.addScaledVector(forward, flight.speed * dt);
  // flight.position.y = THREE.MathUtils.clamp(
  //   flight.position.y,
  //   constants.minAltitude,
  //   constants.maxAltitude
  // );
  flight.position.y = Math.max(flight.position.y, constants.minAltitude);
  const boundaryPull = new THREE.Vector3(
    -flight.position.x,
    0,
    -flight.position.z
  );
  const outsideBoundary =
    Math.abs(flight.position.x) > MAP_HALF_SIZE ||
    Math.abs(flight.position.z) > MAP_HALF_SIZE;
  if (outsideBoundary && boundaryPull.lengthSq() > 0.001) {
    boundaryPull.normalize();
    const targetYaw = Math.atan2(boundaryPull.x, boundaryPull.z);
    const yawDelta =
      THREE.MathUtils.euclideanModulo(
        targetYaw - flight.yaw + Math.PI,
        Math.PI * 2
      ) - Math.PI;
    flight.yaw += yawDelta * Math.min(1, constants.mapTurnRate * dt);
  }
  const divePropFactor = flight.diveLock
    ? THREE.MathUtils.lerp(
        1,
        constants.divePropBoost,
        THREE.MathUtils.clamp(
          THREE.MathUtils.inverseLerp(
            0.35,
            constants.maxDivePitch,
            flight.pitch
          ),
          0,
          1
        )
      )
    : 1;
  flight.propellerAngle += flight.speed * 0.22 * divePropFactor * dt;

  flight.gunCooldown = Math.max(0, flight.gunCooldown - dt);
  flight.bombCooldown = Math.max(0, flight.bombCooldown - dt);

  if (
    flight.diveRecovering &&
    flight.pitch <= 0.02 &&
    Math.abs(flight.roll) < 0.06
  ) {
    flight.diveRecovering = false;
  }

  if (keyState.has("Space") && flight.gunCooldown <= 0) {
    fireBullets();
    flight.gunCooldown = 0.08;
  }
  if (
    (keyState.has("Backspace") ||
      (cameraState.mode === 2 && rearTurret.firing)) &&
    flight.gunCooldown <= 0
  ) {
    fireRearBullets();
    flight.gunCooldown = 0.08;
  }

  if (
    consumeSinglePress("KeyB") &&
    flight.diveLock &&
    flight.bombCooldown <= 0
  ) {
    dropBomb();
    flight.bombCooldown = constants.bombCooldownTime;
  }

  if (flight.position.y <= constants.minAltitude + 0.5) {
    crashPlayerIntoWater();
    return;
  }
}

function consumeSinglePress(code) {
  if (!keyState.has(code)) return false;
  keyState.delete(code);
  return true;
}

function resetFlight() {
  for (const boat of aaBoats) {
    boat.alive = true;
    boat.health = AA_BOAT_HEALTH;
    boat.group.visible = true;
    boat.flakCooldown = 0.8 + Math.random();
  }
  flight.crashing = false;
  flight.wreckVelocity.set(0, 0, 0);
  flight.wreckSpin.set(0, 0, 0);
  planeRoot.visible = true;
  flight.position.copy(START_POSITION);
  flight.yaw = START_YAW;
  flight.pitch = 0;
  flight.roll = 0;
  flight.speed = constants.cruiseSpeed;
  flight.propellerAngle = 0;
  flight.gunCooldown = 0;
  flight.bombCooldown = 0;
  flight.diveLock = false;
  flight.diveRecovering = false;
  flight.flakShake = 0;
  flight.destroyed = false;
  cameraState.aimView = false;
  planeRoot.visible = true;
  bullets.splice(0).forEach((entry) => scene.remove(entry.mesh));
  enemyBullets.splice(0).forEach((entry) => scene.remove(entry.mesh));
  bombs.splice(0).forEach((entry) => scene.remove(entry.mesh));
  flakShells.splice(0).forEach((entry) => scene.remove(entry.mesh));
  effects.splice(0).forEach((entry) => scene.remove(entry.mesh));
  flight.hitsRemaining = PLAYER_HULL;
  rearTurret.yaw = 0;
  rearTurret.pitch = 0.12;
  for (const ship of targetShips) {
    ship.group.visible = true;
    ship.alive = true;
    ship.sinking = false;
    ship.sinkTimer = 0;
    ship.smokeTimer = 0;
    ship.health = SHIP_HEALTH;
    ship.flakCooldown = 1.2 + Math.random() * 0.5;
    if (ship.turret) {
      ship.turret.alive = true;
      ship.turret.health = SHIP_TURRET_HEALTH;
      ship.turret.group.visible = true;
      ship.turretCooldown = Math.random() * 0.8;
    }
    // IMPORTANT: restore ship after sinking animation
    ship.group.position.y = 0;
    ship.group.rotation.z = 0;
    ship.group.position.y = ship.group.userData.startY;
    ship.group.rotation.z = 0;
  }
  for (const enemy of enemyPlanes) {
    enemy.crashing = false;
    enemy.wreckVelocity = new THREE.Vector3();
    enemy.wreckSpin = new THREE.Vector3();
    enemy.burstShotsLeft = 0;
    enemy.burstShotTimer = 0;
    enemy.fireCooldown = 1.2 + Math.random() * 1.4;
    enemy.group.visible = true;
    enemy.alive = true;
    enemy.health = ENEMY_PLANE_HEALTH;
    enemy.state = "guard";
    enemy.phase = enemy.basePhase;
    enemy.stateTimer = 0.8 + enemy.waveIndex * constants.enemyWaveSpacing;
    enemy.propellerAngle = Math.random() * Math.PI * 2;
    enemy.currentSpeed = constants.enemyPatrolSpeed;
    enemy.position = getEnemyPlanePosition(enemy, enemy.phase);
    enemy.forward = getEnemyPlanePosition(
      enemy,
      enemy.phase + enemy.angularSpeed * 0.12
    )
      .sub(enemy.position.clone())
      .normalize();
    setEnemyPlaneTransform(enemy);
    enemy.visualForward = enemy.forward.clone();
  }
}
function updatePlayerWreck(dt) {
  if (!flight.crashing) return;

  flight.wreckVelocity.y -= 42 * dt;
  flight.position.addScaledVector(flight.wreckVelocity, dt);

  flight.pitch += flight.wreckSpin.x * dt;
  flight.yaw += flight.wreckSpin.y * dt;
  flight.roll += flight.wreckSpin.z * dt;

  flight.flakShake = Math.max(flight.flakShake, 0.45);

  if (flight.position.y <= 1) {
    flight.crashing = false;
    planeRoot.visible = false;

    spawnWaterSplash(flight.position, {
      radius: 12,
      height: 28,
      ttl: 1.2,
      grow: 38,
      fade: 1.2,
    });
  }
}
function updatePlaneVisual() {
  planeRoot.visible = !flight.destroyed || flight.crashing;
  planeRoot.position.copy(flight.position);
  planeRoot.rotation.order = "YXZ";
  planeRoot.rotation.y = flight.yaw;
  planeRoot.rotation.x = flight.pitch;
  planeRoot.rotation.z = -flight.roll;

  const propeller = planeRoot.getObjectByName("propeller");
  if (propeller) {
    propeller.rotation.z = flight.propellerAngle;
  }

  if (loadedBomb) {
    loadedBomb.visible = !flight.destroyed && flight.bombCooldown <= 0;
  }

  for (const ship of targetShips) {
    const hitbox = ship.group.getObjectByName("hitbox");
    if (hitbox) {
      hitbox.visible = flight.diveLock && ship.alive;
    }
  }
}
function updateEnemyPlanes(dt) {
  for (const enemy of enemyPlanes) {
    if (!enemy.alive) continue;

    enemy.state = "attack";
    enemy.stateTimer = constants.enemyAttackDuration;

    const rangeToPlayer = enemy.position.distanceTo(flight.position);
    const playerForward = getForward();
    const playerIsDiving = flight.diveLock || flight.pitch > 0.45;

    let chaseTarget;

    if (playerIsDiving) {
      const safeY = Math.max(flight.position.y + 25, 120);

      chaseTarget = flight.position
        .clone()
        .addScaledVector(playerForward, -55)
        .add(new THREE.Vector3(0, 18, 0));

      chaseTarget.y = Math.max(chaseTarget.y, safeY);
    } else {
      // Normal chase: stay behind you
      chaseTarget = flight.position
        .clone()
        .addScaledVector(playerForward, -130)
        .add(new THREE.Vector3(0, 10, 0));
    }

    const targetDirection = chaseTarget.sub(enemy.position).normalize();

    const separation = new THREE.Vector3();

    for (const other of enemyPlanes) {
      if (other === enemy || !other.alive) continue;

      const away = enemy.position.clone().sub(other.position);
      const distance = away.length();

      if (distance > 0.001 && distance < constants.enemySeparationDistance) {
        separation.add(
          away
            .normalize()
            .multiplyScalar(1 - distance / constants.enemySeparationDistance)
        );
      }
    }

    const desiredDirection = targetDirection.add(
      separation.multiplyScalar(constants.enemySeparationWeight)
    );

    if (desiredDirection.lengthSq() > 0.0001) {
      desiredDirection.normalize();
    }

    const nearWater = enemy.position.y < 180;

    const enemyTargetSpeed = playerIsDiving
      ? constants.enemyDiveCatchupSpeed + 15
      : constants.enemyDiveCatchupSpeed;

    enemy.currentSpeed = moveToward(
      enemy.currentSpeed,
      enemyTargetSpeed,
      nearWater
        ? 75 * dt
        : playerIsDiving
        ? 34 * dt
        : constants.enemyDiveAcceleration * dt
    );

    const turnRate = nearWater ? 2.2 : playerIsDiving ? 1.05 : 0.9;

    enemy.forward.lerp(
      desiredDirection,
      THREE.MathUtils.clamp(turnRate * dt, 0, 1)
    );
    enemy.forward.normalize();
    if (nearWater) {
      enemy.forward.y = Math.max(enemy.forward.y, 0.25);
      enemy.forward.normalize();
    }
    enemy.visualForward ??= enemy.forward.clone();
    enemy.visualForward.lerp(
      enemy.forward,
      THREE.MathUtils.clamp(4.2 * dt, 0, 1)
    );
    enemy.visualForward.normalize();

    enemy.position.addScaledVector(enemy.forward, enemy.currentSpeed * dt);

    if (!playerIsDiving) {
      enemy.position.y = THREE.MathUtils.damp(
        enemy.position.y,
        flight.position.y + 8,
        2.4,
        dt
      );
    }

    enemy.propellerAngle += 24 * dt;
    setEnemyPlaneTransform(enemy);
    enemy.fireCooldown -= dt;
    enemy.burstShotTimer -= dt;

    const toPlayer = flight.position.clone().sub(enemy.position).normalize();
    const fireCone = playerIsDiving ? 0.82 : 0.9;
    const facingPlayer = enemy.forward.dot(toPlayer) > fireCone;

    const fireRange = playerIsDiving
      ? constants.enemyFireRange * 1.25
      : constants.enemyFireRange;

    if (!flight.destroyed && rangeToPlayer <= fireRange && facingPlayer) {
      if (enemy.burstShotsLeft <= 0 && enemy.fireCooldown <= 0) {
        enemy.burstShotsLeft = THREE.MathUtils.randInt(3, 30);
        enemy.burstShotTimer = 0;
      }

      if (enemy.burstShotsLeft > 0 && enemy.burstShotTimer <= 0) {
        fireEnemyBurst(enemy);
        enemy.burstShotsLeft -= 1;
        enemy.burstShotTimer = 0.11;

        if (enemy.burstShotsLeft <= 0) {
          enemy.fireCooldown = THREE.MathUtils.randFloat(1.4, 2.4);
        }
      }
    } else {
      enemy.burstShotsLeft = 0;
    }
  }
}
function updateAtmosphere(dt) {
  scene.fog.near = THREE.MathUtils.damp(
    scene.fog.near,
    constants.fogNear,
    3.2,
    dt
  );
  scene.fog.far = THREE.MathUtils.damp(
    scene.fog.far,
    constants.fogFar,
    3.2,
    dt
  );
}

function getBombReleaseState() {
  const origin = loadedBomb
    ? loadedBomb.getWorldPosition(new THREE.Vector3())
    : flight.position
        .clone()
        .add(
          new THREE.Vector3(0, -1.18, 0.92).applyQuaternion(
            planeRoot.quaternion
          )
        );
  const planeVelocity = getForward().multiplyScalar(flight.speed);

  return {
    origin,
    velocity: planeVelocity.add(new THREE.Vector3(0, -4.5, 0)),
  };
}

function enterPointerLock() {
  // if (renderer.domElement.requestPointerLock) {
  //   renderer.domElement.requestPointerLock();
  // }
}

function exitPointerLock() {
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }
}

function updateCamera(dt) {
  const forward = getForward();
  const rearForward = forward.clone().multiplyScalar(-1);

  const worldUp = new THREE.Vector3(0, 1, 0);
  const planeUp = getUp();
  const planeRight = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(planeRoot.quaternion)
    .normalize();
  const orbitFocus = flight.position
    .clone()
    .addScaledVector(forward, 5.5)
    .addScaledVector(planeUp, 1.4);
  const speedFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(
      constants.cruiseSpeed,
      constants.maxSpeed + constants.boostExtraSpeed,
      flight.speed
    ),
    0,
    1
  );

  const targetDistance = cameraState.aimView
    ? THREE.MathUtils.lerp(5.1, 6.6, speedFactor)
    : THREE.MathUtils.lerp(18, 31, speedFactor);
  const targetHeight = cameraState.aimView
    ? THREE.MathUtils.lerp(1.45, 1.85, speedFactor)
    : THREE.MathUtils.lerp(6.4, 8.8, speedFactor);
  const targetLookAhead = cameraState.aimView
    ? THREE.MathUtils.lerp(30, 42, speedFactor)
    : THREE.MathUtils.lerp(18, 27, speedFactor);
  const targetFov = cameraState.aimView
    ? THREE.MathUtils.lerp(43, 49, speedFactor)
    : THREE.MathUtils.lerp(60, 68, speedFactor);
  const diveCameraActive = flight.diveLock || flight.diveRecovering;

  cameraState.distance = THREE.MathUtils.damp(
    cameraState.distance,
    targetDistance,
    4.5,
    dt
  );
  cameraState.height = THREE.MathUtils.damp(
    cameraState.height,
    targetHeight,
    4.5,
    dt
  );
  cameraState.lookAhead = THREE.MathUtils.damp(
    cameraState.lookAhead,
    targetLookAhead,
    4.5,
    dt
  );
  cameraState.fov = THREE.MathUtils.damp(cameraState.fov, targetFov, 4.5, dt);
  cameraState.diveBlend = THREE.MathUtils.damp(
    cameraState.diveBlend,
    diveCameraActive ? 1 : 0,
    diveCameraActive ? 5.2 : 2.6,
    dt
  );
  flight.flakShake = THREE.MathUtils.damp(flight.flakShake, 0, 8, dt);

  if (diveCameraActive || cameraState.aimView) {
    cameraState.orbitYaw = THREE.MathUtils.damp(
      cameraState.orbitYaw,
      0,
      3.5,
      dt
    );
    cameraState.orbitPitch = THREE.MathUtils.damp(
      cameraState.orbitPitch,
      0.28,
      3.5,
      dt
    );
  }

  const orbitDirection = new THREE.Vector3(0, 0, 1)
    .applyEuler(
      new THREE.Euler(cameraState.orbitPitch, cameraState.orbitYaw, 0, "YXZ")
    )
    .normalize();
  if (cameraState.mode === 2) {
    camera.position
      .copy(flight.position)
      .addScaledVector(forward, 4.5)
      .addScaledVector(planeUp, 2.2);

    camera.up.copy(planeUp);

    camera.lookAt(
      flight.position
        .clone()
        .addScaledVector(rearForward, 55)
        .addScaledVector(planeUp, 0.5)
    );

    camera.fov = 48;
    camera.updateProjectionMatrix();
    return;
  }
  if (cameraState.mode === 4 || cameraState.mode === 5) {
    const side = cameraState.mode === 4 ? -1 : 1;

    // get plane right vector
    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(planeRoot.quaternion)
      .normalize();

    // position camera to the side
    camera.position
      .copy(flight.position)
      .addScaledVector(right, side * 22) // side distance
      .addScaledVector(planeUp, 5); // height

    camera.up.copy(planeUp);

    // look slightly forward so it feels dynamic
    camera.lookAt(
      flight.position
        .clone()
        .addScaledVector(forward, 10)
        .addScaledVector(planeUp, 1.5)
    );

    camera.fov = 60;
    camera.updateProjectionMatrix();
    return;
  }
  if (cameraState.mode === 6) {
    const distance = 40; // how far in front
    const height = 8;

    const targetPosition = flight.position
      .clone()
      .addScaledVector(forward, distance)
      .addScaledVector(planeUp, height);

    const lookTarget = flight.position.clone().addScaledVector(planeUp, 2); // look at center of plane

    camera.position.copy(targetPosition);
    camera.up.copy(planeUp);
    camera.lookAt(lookTarget);

    camera.fov = 65; // slightly wider so whole plane fits
    camera.updateProjectionMatrix();
    return;
  }
  if (cameraState.mode === 7) {
    const distance = 45;
    const height = 10;

    const targetPosition = flight.position
      .clone()
      .addScaledVector(forward, -distance)
      .addScaledVector(planeUp, height);

    const lookTarget = flight.position.clone().addScaledVector(planeUp, 2);

    camera.position.copy(targetPosition);
    camera.up.copy(planeUp);
    camera.lookAt(lookTarget);

    camera.fov = 65;
    camera.updateProjectionMatrix();
    return;
  }
  if (cameraState.aimView) {
    camera.position
      .copy(flight.position)
      .addScaledVector(forward, -cameraState.distance + 7.6)
      .addScaledVector(planeUp, cameraState.height - 0.2)
      .addScaledVector(planeRight, 0.18);
    camera.up.copy(planeUp);
    camera.lookAt(
      flight.position
        .clone()
        .addScaledVector(forward, cameraState.lookAhead)
        .addScaledVector(planeUp, 0.45)
    );
  } else {
    const divePosition = flight.position
      .clone()
      .addScaledVector(forward, -cameraState.distance)
      .addScaledVector(planeUp, 1.2)
      .add(new THREE.Vector3(0, 8, 0));

    const diveLookAt = flight.position
      .clone()
      .addScaledVector(forward, cameraState.lookAhead * 0.45)
      .add(new THREE.Vector3(0, -18, 0));
    const orbitPosition = flight.position
      .clone()
      .addScaledVector(orbitDirection, -cameraState.distance)
      .addScaledVector(worldUp, cameraState.height);
    const orbitLookAt = orbitFocus.clone();
    const blendedPosition = orbitPosition.lerp(
      divePosition,
      cameraState.diveBlend
    );
    const blendedLookAt = orbitLookAt.lerp(diveLookAt, cameraState.diveBlend);
    const blendedUp = worldUp.lerp(planeUp.clone(), cameraState.diveBlend);

    camera.position.copy(blendedPosition);
    camera.up.copy(blendedUp.normalize());
    camera.lookAt(blendedLookAt);
  }
  if (flight.flakShake > 0.001) {
    camera.position.add(
      new THREE.Vector3(
        (Math.random() - 0.5) * flight.flakShake,
        (Math.random() - 0.5) * flight.flakShake,
        (Math.random() - 0.5) * flight.flakShake
      )
    );
  }
  camera.fov = cameraState.fov;
  camera.updateProjectionMatrix();
}

function updateSunVisual() {
  sunVisual.position
    .copy(flight.position)
    .add(new THREE.Vector3(1100, 900, -1500));
}

function updateOceanSurface() {
  oceanSurface.position.x = flight.position.x;
  oceanSurface.position.z = flight.position.z;
}

function updateFlak(dt) {
  for (const ship of targetShips) {
    if (!ship.alive) continue;
    ship.flakCooldown -= dt;
    const rangeToPlane = ship.group.position.distanceTo(flight.position);
    if (rangeToPlane <= constants.flakRange && ship.flakCooldown <= 0) {
      fireFlakShell(ship);
      ship.flakCooldown = 0.35 + Math.random() * 0.55;
    }
  }

  for (let i = flakShells.length - 1; i >= 0; i -= 1) {
    const shell = flakShells[i];
    shell.mesh.position.addScaledVector(shell.velocity, dt);
    shell.ttl -= dt;
    if (shell.ttl <= 0) {
      spawnFlakBurst(shell.burstPosition);
      scene.remove(shell.mesh);
      flakShells.splice(i, 1);
    }
  }
}

function fireFlakShell(ship) {
  const projectedTarget = flight.position
    .clone()
    .addScaledVector(getForward(), 80 + Math.random() * 220);
  const burstPosition = projectedTarget.add(
    new THREE.Vector3(
      (Math.random() - 0.5) * 180,
      (Math.random() - 0.5) * 140,
      (Math.random() - 0.5) * 180
    )
  );

  const shellOrigin = ship.group.position
    .clone()
    .add(new THREE.Vector3(0, 14 * SHIP_SCALE, 0));
  const travelVector = burstPosition.clone().sub(shellOrigin);
  const travelDistance = travelVector.length();
  const travelTime = Math.max(0.35, travelDistance / constants.flakShellSpeed);
  const velocity = travelVector.clone().multiplyScalar(1 / travelTime);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x2a2a2a })
  );
  mesh.position.copy(shellOrigin);
  scene.add(mesh);
  flakShells.push({
    mesh,
    velocity,
    ttl: travelTime,
    burstPosition,
  });
}

function spawnFlakBurst(position) {
  playFlakBurstSound(position);

  const group = new THREE.Group();
  group.position.copy(position);

  const material = new THREE.MeshStandardMaterial({
    color: 0x2e3136,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  const puffCount = 6 + Math.floor(Math.random() * 5);

  for (let i = 0; i < puffCount; i++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(4 + Math.random() * 4, 8, 8),
      material
    );

    puff.position.set(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    );

    puff.scale.y *= 0.7; // slightly flattened like smoke

    group.add(puff);
  }

  scene.add(group);

  effects.push({
    mesh: group,
    ttl: 6.5, // was 2.8
    grow: 2.8, // slower expansion
    fade: 0.09, // slower fade
  });

  // damage logic stays same ↓
  const burstDistance = position.distanceTo(flight.position);
  if (burstDistance < constants.flakDamageRadius) {
    const intensity = THREE.MathUtils.clamp(
      1 - burstDistance / constants.flakDamageRadius,
      0.15,
      1
    );
    flight.flakShake = Math.max(flight.flakShake, 1.6 * intensity);

    if (
      !flight.destroyed &&
      burstDistance < constants.flakKillRadius &&
      Math.random() <
        FLAK_KILL_CHANCE *
          Math.pow(1 - burstDistance / constants.flakKillRadius, 2.4)
    ) {
      destroyPlayerPlane(position, intensity);
    }
  }
}

function destroyPlayerPlane(position, intensity) {
  flight.destroyed = true;
  flight.crashing = true;
  flight.wreckVelocity.copy(getForward()).multiplyScalar(flight.speed * 0.75);
  flight.wreckVelocity.y -= 45;

  flight.wreckSpin.set(
    THREE.MathUtils.randFloat(-1.4, 1.4),
    THREE.MathUtils.randFloat(-0.8, 0.8),
    THREE.MathUtils.randFloat(-2.2, 2.2)
  );
  flight.flakShake = Math.max(flight.flakShake, 2.8 * intensity);

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(5.5, 14, 14),
    new THREE.MeshBasicMaterial({
      color: 0xffc06b,
      transparent: true,
      opacity: 0.95,
    })
  );
  blast.position.copy(flight.position);
  scene.add(blast);
  effects.push({ mesh: blast, ttl: 0.55, grow: 24, fade: 1.9 });

  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(8.5, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0x4c4e55,
      transparent: true,
      opacity: 0.82,
    })
  );
  smoke.position.copy(flight.position).add(new THREE.Vector3(0, 4, 0));
  scene.add(smoke);
  effects.push({ mesh: smoke, ttl: 2.2, grow: 10, rise: 12, fade: 0.38 });

  spawnImpactFlash(position);
}

function fireBullets() {
  playGunfireSound();
  const forward = getForward();
  const left = new THREE.Vector3(-1.25, -0.15, 1.7).applyQuaternion(
    planeRoot.quaternion
  );
  const right = new THREE.Vector3(1.25, -0.15, 1.7).applyQuaternion(
    planeRoot.quaternion
  );

  spawnBullet(flight.position.clone().add(left), forward);
  spawnBullet(flight.position.clone().add(right), forward);
}

function fireRearBullets() {
  playGunfireSound();

  const pivot = planeRoot.getObjectByName("rearGunPivot");
  if (!pivot) return;

  // get direction from pivot rotation
  const direction = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(pivot.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();

  const origin = pivot.getWorldPosition(new THREE.Vector3());

  spawnBullet(origin, direction);
}
function spawnBullet(origin, forward) {
  const mesh = new THREE.Group();

  // tracer (long streak)
  const tracer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.1, 4.5, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff000 })
  );
  tracer.rotation.x = Math.PI * 0.5;
  mesh.add(tracer);

  // // glow tip
  // const glow = new THREE.Mesh(
  //   new THREE.SphereGeometry(0.18, 6, 6),
  //   new THREE.MeshBasicMaterial({ color: 0xffffaa })
  // );
  // glow.position.z = 6;
  // mesh.add(glow);

  mesh.position.copy(origin);

  // orient bullet to direction
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    forward.clone().normalize()
  );

  scene.add(mesh);

  bullets.push({
    mesh,
    velocity: forward
      .clone()
      .multiplyScalar(constants.bulletSpeed + flight.speed),
    ttl: 1.6,
  });
}

function dropBomb() {
  const mesh = buildBombVisual();
  const { origin, velocity } = getBombReleaseState();
  mesh.position.copy(origin);
  mesh.quaternion.copy(planeRoot.quaternion);
  scene.add(mesh);
  playBombFallSound(origin);
  if (loadedBomb) {
    loadedBomb.visible = false;
  }
  bombs.push({
    mesh,
    velocity,
    ttl: 12,
  });
}

function fireEnemyBurst(enemy) {
  playEnemyGunfireSound(enemy.group.position);
  const forward = enemy.forward.clone().normalize();
  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(enemy.group.quaternion)
    .normalize();

  const leftOrigin = enemy.group.position
    .clone()
    .addScaledVector(forward, 2.2)
    .addScaledVector(right, -1.15);
  const rightOrigin = enemy.group.position
    .clone()
    .addScaledVector(forward, 2.2)
    .addScaledVector(right, 1.15);

  spawnEnemyBullet(leftOrigin, forward);
  spawnEnemyBullet(rightOrigin, forward);
}

function spawnEnemyBullet(origin, forward) {
  const mesh = new THREE.Group();
  const tracer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.11, 5.2, 6),
    new THREE.MeshBasicMaterial({ color: 0xff7e36 })
  );
  tracer.rotation.x = Math.PI * 0.5;
  mesh.add(tracer);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffdc7a })
  );
  glow.position.z = 1.8;
  mesh.add(glow);

  mesh.position.copy(origin);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    forward.clone().normalize()
  );
  scene.add(mesh);
  enemyBullets.push({
    mesh,
    velocity: forward.clone().multiplyScalar(constants.enemyBulletSpeed),
    ttl: 3.4,
  });
}
function checkBulletHitAABoat(position) {
  for (const boat of aaBoats) {
    if (!boat.alive) continue;

    const dx = position.x - boat.group.position.x;
    const dz = position.z - boat.group.position.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    if (
      position.y >= 1 &&
      position.y <= 8 &&
      horizontalDistance <= boat.radius
    ) {
      return boat;
    }
  }

  return null;
}

function damageAABoat(boat, position) {
  boat.health -= 1;
  spawnImpactFlash(position);

  if (boat.health <= 0) {
    boat.alive = false;
    boat.group.visible = false;
    explodeAABoat(position);
  }
}

function explodeAABoat(position) {
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(5, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff9a3c,
      transparent: true,
      opacity: 0.95,
    })
  );

  blast.position.copy(position).add(new THREE.Vector3(0, 4, 0));
  scene.add(blast);
  effects.push({ mesh: blast, ttl: 0.45, grow: 18, fade: 2.2 });

  spawnWaterSplash(position, {
    radius: 5,
    height: 12,
    ttl: 0.7,
    grow: 20,
    fade: 1.4,
  });
}
function damageShipTurret(turret, position) {
  turret.health -= 1;
  spawnImpactFlash(position);

  if (turret.health <= 0) {
    turret.alive = false;
    turret.group.visible = false;

    const blast = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffa24a,
        transparent: true,
        opacity: 0.9,
      })
    );

    blast.position.copy(position);
    scene.add(blast);
    effects.push({ mesh: blast, ttl: 0.35, grow: 12, fade: 2.4 });
  }
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];

    bullet.mesh.position.addScaledVector(bullet.velocity, dt);
    bullet.ttl -= dt;

    const hitAABoat = checkBulletHitAABoat(bullet.mesh.position);
    if (hitAABoat) {
      damageAABoat(hitAABoat, bullet.mesh.position);
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
      continue;
    }

    const hitEnemy = checkBulletHitEnemy(bullet.mesh.position);
    if (hitEnemy) {
      damageEnemyPlane(hitEnemy, bullet.mesh.position);
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
      continue;
    }

    const hitShip = checkBulletHitTarget(bullet.mesh.position);
    if (hitShip) {
      if (hitShip.type === "shipTurret") {
        damageShipTurret(hitShip.turret, bullet.mesh.position);
      } else {
        damageTarget(hitShip.ship, BULLET_DAMAGE, bullet.mesh.position);
      }
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
      continue;
    }

    if (bullet.mesh.position.y <= 0) {
      spawnWaterSplash(bullet.mesh.position, {
        radius: 1.1,
        height: 4.2,
        ttl: 0.32,
        grow: 5.5,
        fade: 3.2,
      });

      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
      continue;
    }

    if (bullet.ttl <= 0) {
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
    }
  }
}

function updateEnemyBullets(dt) {
  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = enemyBullets[i];
    bullet.mesh.position.addScaledVector(bullet.velocity, dt);
    bullet.ttl -= dt;

    if (
      !flight.destroyed &&
      bullet.mesh.position.distanceTo(flight.position) <=
        constants.enemyBulletHitRadius
    ) {
      damagePlayerFromEnemyBullet(bullet.mesh.position);
      scene.remove(bullet.mesh);
      enemyBullets.splice(i, 1);
      continue;
    }
    if (bullet.mesh.position.y <= 0) {
      spawnWaterSplash(bullet.mesh.position, {
        radius: 1.4,
        height: 5.5,
        ttl: 0.35,
        grow: 6.5,
        fade: 3.0,
      });

      scene.remove(bullet.mesh);
      enemyBullets.splice(i, 1);
      continue;
    }

    if (bullet.ttl <= 0) {
      scene.remove(bullet.mesh);
      enemyBullets.splice(i, 1);
    }
  }
}

function updateBombs(dt) {
  for (let i = bombs.length - 1; i >= 0; i -= 1) {
    const bomb = bombs[i];
    bomb.velocity.y -= constants.bombGravity * dt;
    bomb.mesh.position.addScaledVector(bomb.velocity, dt);
    bomb.ttl -= dt;
    const hitShip = checkBombHitTarget(bomb.mesh.position);
    if (hitShip) {
      explodeTarget(hitShip, bomb.mesh.position);
      scene.remove(bomb.mesh);
      bombs.splice(i, 1);
      continue;
    }
    if (bomb.ttl <= 0 || bomb.mesh.position.y <= 0.5) {
      if (bomb.mesh.position.y <= 0.5) {
        spawnWaterSplash(bomb.mesh.position, {
          radius: 6,
          height: 12,
          ttl: 0.7,
          grow: 30,
          fade: 1.55,
        });
      }
      scene.remove(bomb.mesh);
      bombs.splice(i, 1);
    }
  }
}

function checkBombHitTarget(position) {
  for (const ship of targetShips) {
    if (!ship.alive) continue;
    const dx = position.x - ship.group.position.x;
    const dz = position.z - ship.group.position.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    if (position.y <= 10 && horizontalDistance <= ship.radius) {
      return ship;
    }
  }
  return null;
}

function checkBulletHitTarget(position) {
  for (const ship of targetShips) {
    if (!ship.alive) continue;
    const dx = position.x - ship.group.position.x;
    const dz = position.z - ship.group.position.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    if (
      position.y >= 1 &&
      position.y <= 14 &&
      horizontalDistance <= ship.radius * 0.9
    ) {
      return {
        type: "ship",
        ship,
      };
    }
    if (ship.turret && ship.turret.alive) {
      const turretPos = ship.turret.group.getWorldPosition(new THREE.Vector3());

      if (position.distanceTo(turretPos) <= ship.turret.radius) {
        return {
          type: "shipTurret",
          ship,
          turret: ship.turret,
        };
      }
    }
  }
  return null;
}

function checkBulletHitEnemy(position) {
  for (const enemy of enemyPlanes) {
    if (!enemy.alive) continue;
    if (position.distanceTo(enemy.group.position) <= enemy.hitRadius) {
      return enemy;
    }
  }
  return null;
}

function damageTarget(ship, amount, position) {
  ship.health = Math.max(0, ship.health - amount);
  spawnImpactFlash(position);
  if (ship.health <= 0) {
    explodeTarget(ship, position);
  }
}

function damageEnemyPlane(enemy, position) {
  enemy.health = Math.max(0, enemy.health - 1);
  spawnImpactFlash(position);
  if (enemy.health <= 0) {
    explodeEnemyPlane(enemy, position);
  }
}

function damagePlayerFromEnemyBullet(position) {
  flight.hitsRemaining = Math.max(0, flight.hitsRemaining - 1);
  flight.flakShake = Math.max(flight.flakShake, 0.75);
  spawnImpactFlash(position);
  if (flight.hitsRemaining <= 0) {
    destroyPlayerPlane(position, 1);
  }
}

function spawnImpactFlash(position) {
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xfff2bf,
      transparent: true,
      opacity: 0.85,
    })
  );
  flash.position.copy(position);
  scene.add(flash);
  effects.push({ mesh: flash, ttl: 0.18, grow: 10, fade: 4.2 });
}

function spawnWaterSplash(position, options) {
  playWaterImpactSound(
    position,
    THREE.MathUtils.clamp(options.height / 12, 0.35, 1.2)
  );
  const splash = new THREE.Mesh(
    new THREE.ConeGeometry(options.radius, options.height, 10),
    new THREE.MeshBasicMaterial({
      color: 0xf5f8ff,
      transparent: true,
      opacity: 0.92,
    })
  );
  splash.position.set(position.x, options.height * 0.5, position.z);
  scene.add(splash);
  effects.push({
    mesh: splash,
    ttl: options.ttl,
    grow: options.grow,
    fade: options.fade,
    rise: options.height * 0.12,
  });
}
function updateSinkingShips(dt) {
  for (const ship of targetShips) {
    if (!ship.sinking) continue;

    ship.sinkTimer += dt;
    ship.smokeTimer -= dt;

    ship.group.position.y -= 1.8 * dt;
    ship.group.rotation.z += 0.035 * dt;

    if (ship.smokeTimer <= 0) {
      const smokePos = ship.group.position
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 22,
            16,
            (Math.random() - 0.5) * 45
          )
        );

      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(8 + Math.random() * 5, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0x3f4147,
          transparent: true,
          opacity: 0.75,
        })
      );

      smoke.position.copy(smokePos);
      scene.add(smoke);

      effects.push({
        mesh: smoke,
        ttl: 3.8,
        grow: 8,
        rise: 18,
        fade: 0.22,
      });

      ship.smokeTimer = 0.18;
    }

    if (ship.sinkTimer >= ship.sinkDuration) {
      ship.sinking = false;
      ship.group.visible = false;
    }
  }
}
function explodeTarget(ship, position) {
  if (!ship.alive) return;
  ship.alive = false;
  ship.sinking = true;
  ship.sinkTimer = 0;
  ship.sinkDuration = 8;
  ship.smokeTimer = 0;
  playShipExplosionSound(position);
  // medium fireball
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff8a24,
      transparent: true,
      opacity: 0.95,
    })
  );
  blast.position.copy(position).add(new THREE.Vector3(0, 7, 0));
  scene.add(blast);
  effects.push({ mesh: blast, ttl: 0.65, grow: 22, fade: 1.7 });

  // quick inner flash
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(4, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xfff1a8,
      transparent: true,
      opacity: 0.9,
    })
  );
  flash.position.copy(position).add(new THREE.Vector3(0, 9, 0));
  scene.add(flash);
  effects.push({ mesh: flash, ttl: 0.22, grow: 34, fade: 4.2 });

  // smoke
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(13, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0x2f3035,
      transparent: true,
      opacity: 0.82,
    })
  );
  smoke.position.copy(position).add(new THREE.Vector3(0, 15, 0));
  scene.add(smoke);
  effects.push({ mesh: smoke, ttl: 4.2, grow: 8, rise: 20, fade: 0.2 });

  spawnWaterSplash(position, {
    radius: 9,
    height: 22,
    ttl: 1.0,
    grow: 30,
    fade: 1.3,
  });

  flight.flakShake = Math.max(flight.flakShake, 1.1);
}

function explodeEnemyPlane(enemy, position) {
  if (!enemy.alive) return;

  enemy.alive = false;
  enemy.crashing = true;
  enemy.group.visible = true;

  enemy.wreckVelocity = enemy.forward
    .clone()
    .multiplyScalar(enemy.currentSpeed * 0.65);
  enemy.wreckVelocity.y -= 18;

  enemy.wreckDiveDirection = enemy.forward
    .clone()
    .add(new THREE.Vector3(0, -1.15, 0))
    .normalize();

  enemy.wreckRollSpeed =
    THREE.MathUtils.randFloat(8, 14) * (Math.random() < 0.5 ? -1 : 1);
  enemy.wreckYawDrift = THREE.MathUtils.randFloat(-0.35, 0.35);

  playFlakBurstSound(position);

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffb05d,
      transparent: true,
      opacity: 0.92,
    })
  );

  blast.position.copy(position);
  scene.add(blast);
  effects.push({ mesh: blast, ttl: 0.5, grow: 20, fade: 2.1 });

  setTimeout(() => {
    respawnEnemyPlane(enemy);
  }, THREE.MathUtils.randInt(2500, 5000));
}
function updateEnemyWrecks(dt) {
  for (const enemy of enemyPlanes) {
    if (!enemy.crashing) continue;

    enemy.wreckVelocity.y -= 42 * dt;

    const divePull = enemy.wreckDiveDirection
      ? enemy.wreckDiveDirection.clone().multiplyScalar(55 * dt)
      : new THREE.Vector3(0, -55 * dt, 0);

    enemy.wreckVelocity.add(divePull);
    enemy.position.addScaledVector(enemy.wreckVelocity, dt);

    if (enemy.wreckDiveDirection) {
      enemy.forward.lerp(
        enemy.wreckDiveDirection,
        THREE.MathUtils.clamp(2.8 * dt, 0, 1)
      );
      enemy.forward.normalize();
    }

    enemy.group.position.copy(enemy.position);
    enemy.group.rotation.order = "YXZ";

    enemy.group.rotation.y = Math.atan2(enemy.forward.x, enemy.forward.z);
    enemy.group.rotation.x = Math.asin(
      THREE.MathUtils.clamp(enemy.forward.y, -1, 1)
    );

    enemy.group.rotation.z += enemy.wreckRollSpeed * dt;
    enemy.group.rotation.y += enemy.wreckYawDrift * dt;

    const propeller = enemy.group.getObjectByName("propeller");
    if (propeller) {
      propeller.rotation.z += 40 * dt;
    }

    if (enemy.position.y <= 1) {
      enemy.crashing = false;
      enemy.group.visible = false;

      spawnWaterSplash(enemy.position, {
        radius: 10,
        height: 26,
        ttl: 1.15,
        grow: 34,
        fade: 1.35,
      });
    }
  }
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const effect = effects[i];
    effect.ttl -= dt;
    const scaleStep = 1 + effect.grow * dt * 0.08;
    effect.mesh.scale.multiplyScalar(scaleStep);
    if (effect.rise) {
      effect.mesh.position.y += effect.rise * dt;
    }
    if (effect.mesh.material) {
      // single mesh
      if (effect.mesh.material.transparent) {
        effect.mesh.material.opacity = Math.max(
          0,
          effect.mesh.material.opacity - effect.fade * dt
        );
      }
    } else if (effect.mesh.children) {
      // group (like flak cloud)
      for (const child of effect.mesh.children) {
        if (child.material && child.material.transparent) {
          child.material.opacity = Math.max(
            0,
            child.material.opacity - effect.fade * dt
          );
        }
      }
    }
    if (effect.ttl <= 0) {
      scene.remove(effect.mesh);
      effects.splice(i, 1);
    }
  }
}

function updateTelemetry() {
  const shipsRemaining = targetShips.filter((ship) => ship.alive).length;
  const enemyRemaining = enemyPlanes.filter((enemy) => enemy.alive).length;
  telemetryEl.textContent = `ALT ${flight.position.y.toFixed(
    0
  )}m   SPD ${flight.speed.toFixed(0)}   BUL ${bullets.length}   BMB ${
    bombs.length
  }   FLK ${flakShells.length}   DIVE ${
    flight.diveLock ? "LOCK" : flight.diveRecovering ? "RECOVER" : "FREE"
  }   SHP ${shipsRemaining}/${targetShips.length}   ENM ${enemyRemaining}/${
    enemyPlanes.length
  }   HUL ${flight.hitsRemaining}   FLK% ${Math.round(
    FLAK_KILL_CHANCE * 100
  )}   ${flight.destroyed ? "SHOT DOWN - R TO RESET" : "AIRBORNE"}`;
}

function updateMinimap() {
  if (!minimapCtx || !minimapEl) return;

  const { width, height } = minimapEl;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const halfSpan = MINIMAP_WORLD_SPAN * 0.5;
  const pixelsPerUnit = width / MINIMAP_WORLD_SPAN;

  minimapCtx.clearRect(0, 0, width, height);

  minimapCtx.fillStyle = "rgba(6, 16, 28, 0.88)";
  minimapCtx.fillRect(0, 0, width, height);

  minimapCtx.strokeStyle = "rgba(160, 198, 226, 0.2)";
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(8, 8, width - 16, height - 16);

  minimapCtx.beginPath();
  minimapCtx.arc(centerX, centerY, width * 0.34, 0, Math.PI * 2);
  minimapCtx.strokeStyle = "rgba(160, 198, 226, 0.12)";
  minimapCtx.stroke();

  drawMinimapEntities(
    targetShips
      .filter((ship) => ship.alive)
      .map((ship) => ({
        position: ship.group.position,
        color: "#6cc6ff",
        radius: 4,
      })),
    centerX,
    centerY,
    halfSpan,
    pixelsPerUnit
  );

  drawMinimapEntities(
    enemyPlanes
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({
        position: enemy.group.position,
        color: "#ff715a",
        radius: 3.5,
      })),
    centerX,
    centerY,
    halfSpan,
    pixelsPerUnit
  );

  minimapCtx.save();
  minimapCtx.translate(centerX, centerY);
  minimapCtx.rotate(-flight.yaw);
  minimapCtx.fillStyle = flight.destroyed ? "#ff5555" : "#fff7d6";
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, -10);
  minimapCtx.lineTo(6, 8);
  minimapCtx.lineTo(0, 4);
  minimapCtx.lineTo(-6, 8);
  minimapCtx.closePath();
  minimapCtx.fill();
  minimapCtx.restore();
}

function drawMinimapEntities(
  entities,
  centerX,
  centerY,
  halfSpan,
  pixelsPerUnit
) {
  if (!minimapCtx) return;

  for (const entity of entities) {
    const dx = entity.position.x - flight.position.x;
    const dz = entity.position.z - flight.position.z;
    const clampedX = THREE.MathUtils.clamp(dx, -halfSpan, halfSpan);
    const clampedZ = THREE.MathUtils.clamp(dz, -halfSpan, halfSpan);
    const x = centerX + clampedX * pixelsPerUnit;
    const y = centerY - clampedZ * pixelsPerUnit;

    minimapCtx.fillStyle = entity.color;
    minimapCtx.beginPath();
    minimapCtx.arc(x, y, entity.radius, 0, Math.PI * 2);
    minimapCtx.fill();
  }
}

function getForward() {
  return new THREE.Vector3(0, 0, 1)
    .applyEuler(new THREE.Euler(flight.pitch, flight.yaw, 0, "YXZ"))
    .normalize();
}

function getUp() {
  return new THREE.Vector3(0, 1, 0)
    .applyQuaternion(planeRoot.quaternion)
    .normalize();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

resetFlight();
