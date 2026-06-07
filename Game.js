const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

if (typeof Matter === "undefined") {
  throw new Error("Matter.js is missing. Add Matter.js before this script in your HTML.");
}

const { Engine, World, Bodies, Body, Constraint, Events } = Matter;

canvas.width = 900;
canvas.height = 500;

/* =========================================================
   GAME SETUP
========================================================= */

const W = 900;
const H = 500;
const WORLD_WIDTH = 2000;
const GROUND_Y = 455;
const STRUCTURE_START_X = 950;
const CAMERA_MAX_X = WORLD_WIDTH - W;

const SLING = { x: 160, y: 350 };
const KITTY_OFFSET = { x: -25, y: -10 };

const TRAJECTORY_GRAVITY = 0.35;
const TRAJECTORY_FRICTION = 0.98;
const LAUNCH_POWER = 0.42;

const LEVEL_COIN_REWARDS = {
  1: 5,
  2: 10,
  3: 15
};

const CHARACTER_COSTS = {
  mymelody: 50,
  badtzmaru: 60,
  cinnamoroll: 70
};

const CHARACTER_NAMES = {
  main: "Main Kitty",
  mymelody: "My Melody",
  badtzmaru: "Badtz Maru",
  cinnamoroll: "Cinnamoroll"
};

const MATERIALS = {
  wood: {
    health: 70,
    density: 0.004,
    friction: 0.9,
    frictionAir: 0.005,
    restitution: 0.08
  }
};

const PHYSICS = {
  anchorStiffness: 0.92,
  anchorDamping: 0.88,
  anchorBreakDistance: 24,
  anchorBreakAngle: 0.45,
  blockDamageMultiplier: 8,
  birdImpactVelocityScale: 0.18,
  supportSpeedBreak: 0.65,
  enemyStructureKillSpeed: 4.2,
  enemyFallingKillSpeed: 3.0
};

const BADTZ = {
  fuseTime: 3000,
  explosionRadius: 150,
  instantBreakRadius: 92,
  blastForce: 0.055
};

const CINNAMOROLL = {
  heavyDensityMultiplier: 2,
  heavyImpactMultiplier: 2,
  heavyDamageMultiplier: 2
};

const engine = Engine.create();
const world = engine.world;

Object.assign(engine, {
  positionIterations: 10,
  velocityIterations: 8,
  constraintIterations: 5
});

engine.gravity.y = 1;

/* =========================================================
   GLOBAL STATE
========================================================= */

let gameState = "loading";
let loadingStartTime = Date.now();

let currentLevel = null;
let levelCompleteHandled = false;
let highestUnlockedLevel = 1;

let currentSaveSlot = null;
let coins = 0;

let selectedCharacter = "main";
let myMelodyUnlocked = false;
let badtzMaruUnlocked = false;
let cinnamorollUnlocked = false;

let fakeFullscreen = false;
let settingsMenuOpen = false;

let levelCharacterQueue = [];
let currentQueueIndex = 0;
let levelOutOfCharacters = false;
let queuedAdvanceTimer = null;

let cameraX = 0;
let targetCameraX = 0;
let cameraDragging = false;
let cameraDragPointerId = null;
let lastCameraDragX = 0;

let characterScrollX = 0;
let characterScrollDragging = false;
let characterScrollPointerId = null;
let characterScrollLastX = 0;
let characterScrollMoved = false;

let levelPreviewActive = false;
let levelPreviewStep = "none";
let levelPreviewTimer = 0;

let spoonBend = 0;
let spoonTargetBend = 0;

let myMelodySplitUsed = false;
let myMelodyCopies = [];

let canReloadBird = false;
let activePointerId = null;

let badtzExplosion = {
  armed: false,
  exploded: false,
  startTime: 0,
  x: 0,
  y: 0,
  body: null
};

let explosionFlash = {
  active: false,
  startTime: 0,
  x: 0,
  y: 0
};

let blocks = [];
let enemies = [];
let blockAnchors = [];
let structureHasBeenTouched = false;

let physicsGround;
let physicsLeftWall;
let physicsRightWall;

const bird = {
  x: SLING.x + KITTY_OFFSET.x,
  y: SLING.y + KITTY_OFFSET.y,
  radius: 28,
  vx: 0,
  vy: 0,
  launched: false,
  dragging: false,
  body: null
};

/* =========================================================
   UI BOXES
========================================================= */

const box = (x, y, w, h, text = "") => ({ x, y, w, h, text });

const saveSlots = [
  box(110, 180, 200, 210),
  box(350, 180, 200, 210),
  box(590, 180, 200, 210)
].map((b, i) => ({ ...b, slot: i + 1 }));

const resetButton = box(760, 20, 120, 45, "Reset");
const characterButton = box(710, 125, 160, 45, "Characters");
const backToLevelsButton = box(365, 20, 170, 45, "Back to Levels");

const settingsButton = box(W / 2 - 28, 12, 56, 50, "⚙");
const settingsPanelBox = box(W / 2 - 120, 70, 240, 205, "Settings");
const settingsFullscreenButton = box(W / 2 - 95, 118, 190, 40, "Fullscreen");
const settingsResetButton = box(W / 2 - 95, 168, 190, 40, "Reset");
const settingsLeaveButton = box(W / 2 - 95, 218, 190, 40, "Leave");

const characterViewport = box(90, 185, 720, 245);
const characterCardW = 220;
const characterCardH = 210;
const characterSpacing = 285;

const levelButtons = Array.from({ length: 8 }, (_, i) => {
  const x = 150 + (i % 4) * 150;
  const y = i < 4 ? 150 : 300;

  return {
    ...box(x, y, 110, 110),
    level: i + 1,
    unlocked: i === 0
  };
});

/* =========================================================
   ASSETS
========================================================= */

const img = src => Object.assign(new Image(), { src });

const loadingScreenImg = img("./LoadingScreen.png");
const backgroundImg = img("./Background.png");

const mainSpriteImg = img("./Main_sprite.png");
const myMelodyImg = img("./MyMelody.png");
const badtzMaruImg = img("./Badtz maru.png");
const cinnamorollImg = img("./Cinnamoroll.png");
const kuromiImg = img("./Kuromi_Kuromi.png");

const spoonImg = img("./Spoon.png");
const woodImg = img("./Wood.png");

const characterImages = {
  main: mainSpriteImg,
  mymelody: myMelodyImg,
  badtzmaru: badtzMaruImg,
  cinnamoroll: cinnamorollImg
};

function characterImgById(id) {
  return characterImages[id] || mainSpriteImg;
}

function characterNameById(id) {
  return CHARACTER_NAMES[id] || CHARACTER_NAMES.main;
}

function currentImg() {
  return characterImgById(selectedCharacter);
}

/* =========================================================
   PAGE STYLES
========================================================= */

function setStyles(el, styles) {
  Object.assign(el.style, styles);
}

setStyles(document.documentElement, {
  margin: 0,
  padding: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "black"
});

setStyles(document.body, {
  margin: 0,
  padding: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "black"
});

setStyles(canvas, {
  display: "block",
  width: "100vw",
  height: "100vh",
  touchAction: "none",
  userSelect: "none",
  webkitUserSelect: "none",
  webkitTouchCallout: "none"
});

/* =========================================================
   HELPERS
========================================================= */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clampCameraX = v => clamp(v, 0, CAMERA_MAX_X);
const dist = (x, y) => Math.sqrt(x * x + y * y);

function inside(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

function pointerScreen(e) {
  const r = canvas.getBoundingClientRect();

  return {
    x: (e.clientX - r.left) * W / r.width,
    y: (e.clientY - r.top) * H / r.height
  };
}

function pointerWorld(e) {
  const p = pointerScreen(e);

  return {
    x: p.x + cameraX,
    y: p.y
  };
}

function capturePointer(e) {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
}

function releasePointer(e) {
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {}
}

/* =========================================================
   SAVE SYSTEM
========================================================= */

function saveKey(slot) {
  return "helloKittySaveSlot" + slot;
}

function getSaveData(slot) {
  try {
    const raw = localStorage.getItem(saveKey(slot));
    if (!raw) return null;

    const save = JSON.parse(raw);

    if (save.selectedCharacter === "b" + "lack" + "penguin") {
      save.selectedCharacter = "badtzmaru";
    }

    return save;
  } catch {
    return null;
  }
}

function applySave(save, slot) {
  currentSaveSlot = slot;
  coins = +save.coins || 0;

  selectedCharacter = "main";

  myMelodyUnlocked = save.myMelodyUnlocked === true;
  badtzMaruUnlocked =
    save.badtzMaruUnlocked === true ||
    save["b" + "lack" + "PenguinUnlocked"] === true;
  cinnamorollUnlocked = save.cinnamorollUnlocked === true;

  highestUnlockedLevel = +save.highestUnlockedLevel || 1;

  syncLevelUnlocks();
  gameState = "levelSelect";
}

function createNewSave(slot) {
  applySave(
    {
      coins: 0,
      myMelodyUnlocked: false,
      badtzMaruUnlocked: false,
      cinnamorollUnlocked: false,
      highestUnlockedLevel: 1
    },
    slot
  );

  saveGameData();
}

function loadSaveFile(slot) {
  const save = getSaveData(slot);
  if (save) applySave(save, slot);
}

function deleteSaveFile(slot) {
  localStorage.removeItem(saveKey(slot));

  if (currentSaveSlot === slot) {
    applySave(
      {
        coins: 0,
        myMelodyUnlocked: false,
        badtzMaruUnlocked: false,
        cinnamorollUnlocked: false,
        highestUnlockedLevel: 1
      },
      null
    );
  }

  gameState = "saveSelect";
}

function saveGameData() {
  if (currentSaveSlot === null) return;

  localStorage.setItem(
    saveKey(currentSaveSlot),
    JSON.stringify({
      exists: true,
      coins,
      selectedCharacter: "main",
      myMelodyUnlocked,
      badtzMaruUnlocked,
      cinnamorollUnlocked,
      highestUnlockedLevel
    })
  );
}

/* =========================================================
   CHARACTERS
========================================================= */

function getCharacterList() {
  return [
    {
      id: "main",
      title: "Main Kitty",
      img: mainSpriteImg,
      unlocked: true,
      cost: 0,
      bottom: "Always in lineup"
    },
    {
      id: "mymelody",
      title: "My Melody",
      img: myMelodyImg,
      unlocked: myMelodyUnlocked,
      cost: CHARACTER_COSTS.mymelody,
      bottom: myMelodyUnlocked
        ? "Joined lineup"
        : "Unlock: " + CHARACTER_COSTS.mymelody + " coins"
    },
    {
      id: "badtzmaru",
      title: "Badtz maru",
      img: badtzMaruImg,
      unlocked: badtzMaruUnlocked,
      cost: CHARACTER_COSTS.badtzmaru,
      bottom: badtzMaruUnlocked
        ? "Joined lineup"
        : "Unlock: " + CHARACTER_COSTS.badtzmaru + " coins"
    },
    {
      id: "cinnamoroll",
      title: "Cinnamoroll",
      img: cinnamorollImg,
      unlocked: cinnamorollUnlocked,
      cost: CHARACTER_COSTS.cinnamoroll,
      bottom: cinnamorollUnlocked
        ? "Joined lineup"
        : "Unlock: " + CHARACTER_COSTS.cinnamoroll + " coins"
    }
  ];
}

function getUnlockedCharacterQueue() {
  const queue = ["main"];

  if (myMelodyUnlocked) queue.push("mymelody");
  if (badtzMaruUnlocked) queue.push("badtzmaru");
  if (cinnamorollUnlocked) queue.push("cinnamoroll");

  return queue;
}

function setupLevelCharacterQueue() {
  if (queuedAdvanceTimer) clearTimeout(queuedAdvanceTimer);

  queuedAdvanceTimer = null;
  levelCharacterQueue = getUnlockedCharacterQueue();
  currentQueueIndex = 0;
  levelOutOfCharacters = false;
  selectedCharacter = levelCharacterQueue[0] || "main";
}

function hasNextQueuedCharacter() {
  return currentQueueIndex + 1 < levelCharacterQueue.length;
}

function advanceToNextQueuedCharacter() {
  queuedAdvanceTimer = null;

  if (gameState !== "playing" || !anyEnemyAlive() || bird.dragging) return;

  if (!hasNextQueuedCharacter()) {
    levelOutOfCharacters = true;
    return;
  }

  currentQueueIndex++;
  selectedCharacter = levelCharacterQueue[currentQueueIndex];

  resetBirdBase(true);
}

function scheduleNextQueuedCharacter() {
  if (queuedAdvanceTimer || levelOutOfCharacters || !anyEnemyAlive()) return;

  queuedAdvanceTimer = setTimeout(advanceToNextQueuedCharacter, 700);
}

function chooseCharacter(id) {
  if (id === "main") return;

  if (id === "mymelody" && !myMelodyUnlocked) {
    if (coins < CHARACTER_COSTS.mymelody) return;
    coins -= CHARACTER_COSTS.mymelody;
    myMelodyUnlocked = true;
  } else if (id === "badtzmaru" && !badtzMaruUnlocked) {
    if (coins < CHARACTER_COSTS.badtzmaru) return;
    coins -= CHARACTER_COSTS.badtzmaru;
    badtzMaruUnlocked = true;
  } else if (id === "cinnamoroll" && !cinnamorollUnlocked) {
    if (coins < CHARACTER_COSTS.cinnamoroll) return;
    coins -= CHARACTER_COSTS.cinnamoroll;
    cinnamorollUnlocked = true;
  }

  selectedCharacter = "main";
  saveGameData();
}

/* =========================================================
   PHYSICS WORLD
========================================================= */

function resetPhysicsWorld() {
  Engine.clear(engine);
  World.clear(world, false);

  blockAnchors = [];

  physicsGround = Bodies.rectangle(
    WORLD_WIDTH / 2,
    GROUND_Y + 35,
    WORLD_WIDTH + 400,
    70,
    {
      isStatic: true,
      label: "ground",
      friction: 1,
      restitution: 0.15,
      render: { visible: false }
    }
  );

  physicsLeftWall = Bodies.rectangle(-40, H / 2, 80, H * 3, {
    isStatic: true,
    label: "wall"
  });

  physicsRightWall = Bodies.rectangle(WORLD_WIDTH + 40, H / 2, 80, H * 3, {
    isStatic: true,
    label: "wall"
  });

  World.add(world, [physicsGround, physicsLeftWall, physicsRightWall]);
}

function syncBody(obj) {
  if (!obj?.body) return;

  if (obj.w) obj.x = obj.body.position.x - obj.w / 2;
  else obj.x = obj.body.position.x;

  if (obj.h) obj.y = obj.body.position.y - obj.h / 2;
  else obj.y = obj.body.position.y;

  obj.vx = obj.body.velocity.x;
  obj.vy = obj.body.velocity.y;
  obj.angle = obj.body.angle;
  obj.angularVelocity = obj.body.angularVelocity;
}

function syncAllBodies() {
  [bird, ...myMelodyCopies, ...blocks, ...enemies.filter(e => e.alive)].forEach(syncBody);
}

function makeBlock(x, y, w, h) {
  const health = Math.max(MATERIALS.wood.health, (w * h) / 38);

  return {
    x,
    y,
    w,
    h,
    startX: x,
    startY: y,
    startAngle: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    angularVelocity: 0,
    body: null,
    anchor: null,
    anchorBroken: false,
    isBreaking: false,
    material: "wood",
    health,
    maxHealth: health,
    supportedBy: [],
    supportIds: []
  };
}

function createBlockBody(block, index) {
  const material = MATERIALS[block.material] || MATERIALS.wood;

  const body = Bodies.rectangle(
    block.x + block.w / 2,
    block.y + block.h / 2,
    block.w,
    block.h,
    {
      label: "block",
      density: material.density,
      friction: material.friction,
      frictionAir: material.frictionAir,
      restitution: material.restitution,
      angle: block.angle || 0
    }
  );

  Object.assign(body, {
    gameType: "block",
    gameIndex: index,
    gameRef: block
  });

  Object.assign(block, {
    body,
    startX: block.x,
    startY: block.y,
    startCenterX: block.x + block.w / 2,
    startCenterY: block.y + block.h / 2,
    startAngle: body.angle,
    anchorBroken: false
  });

  block.anchor = Constraint.create({
    pointA: {
      x: block.startCenterX,
      y: block.startCenterY
    },
    bodyB: body,
    pointB: { x: 0, y: 0 },
    length: 0,
    stiffness: PHYSICS.anchorStiffness,
    damping: PHYSICS.anchorDamping,
    render: { visible: false }
  });

  blockAnchors.push(block.anchor);
  World.add(world, [body, block.anchor]);
}

function createEnemyBody(enemy, index) {
  const body = Bodies.circle(enemy.x, enemy.y, enemy.radius, {
    label: "enemy",
    density: 0.003,
    friction: 0.8,
    frictionAir: 0.01,
    restitution: 0.2
  });

  Object.assign(body, {
    gameType: "enemy",
    gameIndex: index,
    gameRef: enemy
  });

  enemy.body = body;
  World.add(world, body);
}

function getMainBirdDensity() {
  return selectedCharacter === "cinnamoroll"
    ? 0.006 * CINNAMOROLL.heavyDensityMultiplier
    : 0.006;
}

function applyMainBirdCharacterPhysics() {
  if (!bird.body) return;
  Body.setDensity(bird.body, getMainBirdDensity());
}

function ensureBirdBody() {
  if (bird.body) {
    applyMainBirdCharacterPhysics();
    return;
  }

  bird.body = Bodies.circle(bird.x, bird.y, bird.radius, {
    label: "kitty",
    density: getMainBirdDensity(),
    friction: 0.6,
    frictionAir: 0.01,
    restitution: 0.25
  });

  Object.assign(bird.body, {
    gameType: "kitty",
    gameRef: bird
  });

  Body.setStatic(bird.body, true);
  World.add(world, bird.body);

  applyMainBirdCharacterPhysics();
}

/* =========================================================
   PROJECTILE HELPERS
========================================================= */

function isCinnamorollProjectile(body) {
  return (
    selectedCharacter === "cinnamoroll" &&
    body?.gameType === "kitty" &&
    body.gameRef === bird
  );
}

function getProjectileImpactMultiplier(body) {
  return isCinnamorollProjectile(body)
    ? CINNAMOROLL.heavyImpactMultiplier
    : 1;
}

function getProjectileDamageMultiplier(body) {
  return isCinnamorollProjectile(body)
    ? CINNAMOROLL.heavyDamageMultiplier
    : 1;
}

function activeProjectiles() {
  return [bird, ...myMelodyCopies].filter(p => {
    const isMainBird = p === bird;
    return (isMainBird ? bird.launched : true) && p.body;
  });
}

function areAllProjectilesDone() {
  const projectiles = activeProjectiles();

  return (
    projectiles.length > 0 &&
    projectiles.every(p => {
      const slow = Math.abs(p.vx) + Math.abs(p.vy) < 0.45;
      const outOfBounds =
        p.x > WORLD_WIDTH + 100 ||
        p.x < -100 ||
        p.y > H + 150;

      return slow || outOfBounds;
    })
  );
}

/* =========================================================
   MY MELODY POWER
========================================================= */

function clearMyMelodyCopies() {
  myMelodyCopies.forEach(copy => {
    if (copy.body) World.remove(world, copy.body);
  });

  myMelodyCopies = [];
}

function createMyMelodyCopy(x, y, vx, vy, radius) {
  const copy = {
    x,
    y,
    radius,
    vx,
    vy,
    body: Bodies.circle(x, y, radius, {
      label: "kitty",
      density: 0.005,
      friction: 0.6,
      frictionAir: 0.01,
      restitution: 0.25
    })
  };

  Object.assign(copy.body, {
    gameType: "kitty",
    gameRef: copy
  });

  Body.setVelocity(copy.body, { x: vx, y: vy });
  Body.setAngularVelocity(copy.body, vx * 0.012);

  World.add(world, copy.body);
  myMelodyCopies.push(copy);

  return copy;
}

function canUseMyMelodySplit() {
  return (
    gameState === "playing" &&
    selectedCharacter === "mymelody" &&
    bird.launched &&
    bird.body &&
    !bird.dragging &&
    !myMelodySplitUsed &&
    bird.y < GROUND_Y - bird.radius * 0.5
  );
}

function splitMyMelody() {
  if (!canUseMyMelodySplit()) return false;

  myMelodySplitUsed = true;

  let { x: vx, y: vy } = bird.body.velocity;

  if (Math.abs(vx) < 4) {
    vx = vx >= 0 ? 4 : -4;
  }

  const speed = Math.max(6, Math.sqrt(vx * vx + vy * vy));

  const forwardX = vx / speed;
  const forwardY = vy / speed;

  const sideX = -forwardY;
  const sideY = forwardX;

  const spacing = 18;
  const copyRadius = bird.radius * 0.88;

  Body.setVelocity(bird.body, {
    x: forwardX * speed,
    y: forwardY * speed
  });

  Body.setAngularVelocity(bird.body, vx * 0.018);

  createMyMelodyCopy(
    bird.x + sideX * spacing,
    bird.y + sideY * spacing,
    forwardX * speed * 0.98,
    forwardY * speed * 0.98,
    copyRadius
  );

  createMyMelodyCopy(
    bird.x - sideX * spacing,
    bird.y - sideY * spacing,
    forwardX * speed * 1.02,
    forwardY * speed * 1.02,
    copyRadius
  );

  return true;
}

/* =========================================================
   BADTZ MARU POWER
========================================================= */

function resetBadtzExplosion() {
  badtzExplosion = {
    armed: false,
    exploded: false,
    startTime: 0,
    x: 0,
    y: 0,
    body: null
  };

  explosionFlash = {
    active: false,
    startTime: 0,
    x: 0,
    y: 0
  };
}

function isMainBadtzProjectile(body) {
  return (
    selectedCharacter === "badtzmaru" &&
    body?.gameType === "kitty" &&
    body.gameRef === bird &&
    bird.launched
  );
}

function armBadtzExplosion(body) {
  if (!isMainBadtzProjectile(body)) return;
  if (badtzExplosion.armed || badtzExplosion.exploded) return;

  badtzExplosion = {
    armed: true,
    exploded: false,
    startTime: Date.now(),
    x: body.position.x,
    y: body.position.y,
    body
  };
}

function canManualExplodeBadtzMaru() {
  return (
    gameState === "playing" &&
    selectedCharacter === "badtzmaru" &&
    bird.launched &&
    !bird.dragging &&
    bird.body &&
    !badtzExplosion.exploded
  );
}

function triggerManualBadtzExplosion() {
  if (!canManualExplodeBadtzMaru()) return false;

  if (!badtzExplosion.armed) {
    armBadtzExplosion(bird.body);
  }

  explodeBadtzMaru();
  return true;
}

function explodeBadtzMaru() {
  if (!badtzExplosion.armed || badtzExplosion.exploded) return;

  badtzExplosion.armed = false;
  badtzExplosion.exploded = true;

  const bx = badtzExplosion.body?.position.x ?? badtzExplosion.x;
  const by = badtzExplosion.body?.position.y ?? badtzExplosion.y;

  badtzExplosion.x = bx;
  badtzExplosion.y = by;

  explosionFlash = {
    active: true,
    startTime: Date.now(),
    x: bx,
    y: by
  };

  structureHasBeenTouched = true;

  [...blocks].forEach(block => {
    if (!block?.body || block.isBreaking) return;

    const cx = block.body.position.x;
    const cy = block.body.position.y;
    const d = Math.max(1, dist(cx - bx, cy - by));

    if (d > BADTZ.explosionRadius) return;

    const strength = 1 - d / BADTZ.explosionRadius;
    const nx = (cx - bx) / d;
    const ny = (cy - by) / d;

    releaseBlock(
      block,
      nx * 8 * strength,
      ny * 8 * strength - 2.5 * strength
    );

    if (d <= BADTZ.instantBreakRadius) {
      breakBlock(block);
      return;
    }

    damageBlock(block, 12 + strength * 18);

    if (!block.body) return;

    Body.applyForce(block.body, block.body.position, {
      x: nx * BADTZ.blastForce * strength,
      y:
        ny * BADTZ.blastForce * strength -
        BADTZ.blastForce * 0.35 * strength
    });

    Body.setAngularVelocity(
      block.body,
      block.body.angularVelocity + nx * 0.18 * strength
    );
  });

  enemies.forEach(enemy => {
    if (!enemy?.alive) return;

    const d = dist(enemy.x - bx, enemy.y - by);

    if (d <= BADTZ.explosionRadius * 0.9) {
      killEnemy(enemy);
    }
  });

  if (bird.body) {
    Body.setVelocity(bird.body, { x: 0, y: 0 });
    Body.setAngularVelocity(bird.body, 0);
  }

  canReloadBird = false;
}

function updateBadtzExplosion() {
  if (badtzExplosion.armed) {
    if (badtzExplosion.body) {
      badtzExplosion.x = badtzExplosion.body.position.x;
      badtzExplosion.y = badtzExplosion.body.position.y;
    }

    if (Date.now() - badtzExplosion.startTime >= BADTZ.fuseTime) {
      explodeBadtzMaru();
    }
  }

  if (explosionFlash.active && Date.now() - explosionFlash.startTime > 550) {
    explosionFlash.active = false;
  }
}

/* =========================================================
   BLOCKS AND ENEMIES
========================================================= */

function setEnemies(list) {
  enemies = list.map(e => ({
    x: e.x,
    y: e.y,
    radius: e.radius,
    alive: e.alive !== false,
    vx: 0,
    vy: 0,
    body: null
  }));
}

function anyEnemyAlive() {
  return enemies.some(e => e.alive);
}

function allEnemiesVanquished() {
  return enemies.length > 0 && enemies.every(e => !e.alive);
}

function moveLevelToStructureArea() {
  if (!blocks.length && !enemies.length) return;

  const minX = Math.min(
    ...blocks.map(b => b.x),
    ...enemies.map(e => e.x - e.radius)
  );

  const shift = STRUCTURE_START_X - minX;

  blocks.forEach(block => {
    block.x += shift;
    block.startX += shift;
  });

  enemies.forEach(enemy => {
    enemy.x += shift;
  });
}

function assignBlockSupports() {
  blocks.forEach(block => {
    block.supportedBy = [];
    block.supportIds = [];
  });

  blocks.forEach((block, i) => {
    blocks.forEach((support, j) => {
      if (i === j) return;

      const overlap =
        block.x < support.x + support.w &&
        block.x + block.w > support.x;

      const close = Math.abs(block.y + block.h - support.y) <= 36;

      const below =
        support.y + support.h / 2 > block.y + block.h / 2;

      if (overlap && close && below) {
        block.supportedBy.push(support);
        block.supportIds.push(j);
      }
    });
  });
}

function stabilizeStructureBeforeTouch() {
  if (structureHasBeenTouched) return;

  blocks.forEach(block => {
    if (!block.body || block.isBreaking || block.anchorBroken) return;

    Body.setPosition(block.body, {
      x: block.startCenterX,
      y: block.startCenterY
    });

    Body.setAngle(block.body, block.startAngle);
    Body.setVelocity(block.body, { x: 0, y: 0 });
    Body.setAngularVelocity(block.body, 0);
  });
}

function breakBlockAnchor(block) {
  if (!block || block.anchorBroken) return;

  block.anchorBroken = true;

  if (!block.anchor) return;

  World.remove(world, block.anchor);
  blockAnchors = blockAnchors.filter(anchor => anchor !== block.anchor);
  block.anchor = null;
}

function releaseBlock(block, ix = 0, iy = 0) {
  if (!block?.body || block.isBreaking) return;

  breakBlockAnchor(block);

  Body.setVelocity(block.body, {
    x: block.body.velocity.x + ix,
    y: block.body.velocity.y + iy
  });

  Body.setAngularVelocity(
    block.body,
    block.body.angularVelocity +
      ix * (block.h > block.w * 1.4 ? 0.004 : 0.018)
  );
}

function isSupportUnstable(support) {
  if (!support?.body || support.isBreaking || support.health <= 0) return true;

  const moved = dist(
    support.body.position.x - support.startCenterX,
    support.body.position.y - support.startCenterY
  );

  const angle = Math.abs(support.body.angle - support.startAngle);
  const speed = dist(support.body.velocity.x, support.body.velocity.y);

  return (
    (support.anchorBroken &&
      (moved > 4 ||
        angle > 0.14 ||
        speed > PHYSICS.supportSpeedBreak)) ||
    moved > PHYSICS.anchorBreakDistance ||
    angle > PHYSICS.anchorBreakAngle
  );
}

function updateAnchorStress() {
  if (!structureHasBeenTouched) return;

  blocks.forEach(block => {
    if (!block?.body || block.isBreaking || block.anchorBroken) return;

    const moved = dist(
      block.body.position.x - block.startCenterX,
      block.body.position.y - block.startCenterY
    );

    const angle = Math.abs(block.body.angle - block.startAngle);
    const damagePercent = 1 - block.health / block.maxHealth;

    if (
      moved > PHYSICS.anchorBreakDistance ||
      angle > PHYSICS.anchorBreakAngle ||
      damagePercent > 0.72
    ) {
      breakBlockAnchor(block);
    }
  });
}

function updateStructureBalance() {
  if (!structureHasBeenTouched) return;

  for (let pass = 0; pass < 3; pass++) {
    blocks.forEach(block => {
      if (!block?.body || block.isBreaking || block.anchorBroken) return;
      if (!block.supportedBy?.length) return;

      if (block.supportedBy.some(isSupportUnstable)) {
        releaseBlock(block, 0, 0.35);
      }
    });
  }
}

function keepTallBlocksFromGoingCrazy() {
  if (!structureHasBeenTouched) return;

  blocks.forEach(block => {
    if (!block.body || block.isBreaking || block.h <= block.w * 1.7) return;

    Body.setAngularVelocity(
      block.body,
      block.body.angularVelocity * 0.93
    );
  });
}

function impactPower(a, b) {
  return dist(
    a.velocity.x - b.velocity.x,
    a.velocity.y - b.velocity.y
  );
}

function shouldBlockKillEnemy(blockBody, enemyBody, impactSpeed) {
  const block = blockBody?.gameRef;

  if (!block || !enemyBody?.gameRef) return false;

  const blockSpeed = dist(blockBody.velocity.x, blockBody.velocity.y);

  const movedFromStart =
    block.startCenterX !== undefined
      ? dist(
          blockBody.position.x - block.startCenterX,
          blockBody.position.y - block.startCenterY
        )
      : 0;

  const fallingOntoEnemy =
    blockBody.position.y < enemyBody.position.y &&
    blockBody.velocity.y > 1.2;

  const blockIsActuallyLoose =
    block.anchorBroken || movedFromStart > 18;

  return (
    impactSpeed >= PHYSICS.enemyStructureKillSpeed ||
    (blockIsActuallyLoose &&
      fallingOntoEnemy &&
      blockSpeed >= PHYSICS.enemyFallingKillSpeed)
  );
}

function damageBlock(block, power) {
  if (!block?.body || block.isBreaking) return;

  const damage = power * PHYSICS.blockDamageMultiplier;

  if (damage < 5) return;

  block.health -= damage;

  if (block.health <= 0) {
    breakBlock(block);
  }
}

function breakBlock(block) {
  if (!block?.body || block.isBreaking) return;

  block.isBreaking = true;
  breakBlockAnchor(block);

  World.remove(world, block.body);

  blocks = blocks.filter(other => other !== block);

  blocks.forEach(other => {
    other.supportedBy = other.supportedBy.filter(support => support !== block);
  });
}

function killEnemy(enemy) {
  if (!enemy?.alive) return;

  enemy.alive = false;

  if (enemy.body) {
    World.remove(world, enemy.body);
    enemy.body = null;
  }
}

/* =========================================================
   COLLISIONS
========================================================= */

Events.on(engine, "collisionStart", event => {
  event.pairs.forEach(({ bodyA, bodyB }) => {
    const typeA = bodyA.gameType || bodyA.label;
    const typeB = bodyB.gameType || bodyB.label;
    const power = impactPower(bodyA, bodyB);

    handleCollision(bodyA, bodyB, typeA, typeB, power);
  });
});

function handleCollision(a, b, ta, tb, power) {
  if (isCollision(ta, tb, "kitty", "block")) {
    structureHasBeenTouched = true;

    const kittyBody = ta === "kitty" ? a : b;
    const blockBody = ta === "block" ? a : b;
    const block = blockBody.gameRef;

    const heavyImpact = getProjectileImpactMultiplier(kittyBody);

    releaseBlock(
      block,
      kittyBody.velocity.x * PHYSICS.birdImpactVelocityScale * heavyImpact,
      kittyBody.velocity.y * PHYSICS.birdImpactVelocityScale * heavyImpact
    );

    damageBlock(
      block,
      power * getProjectileDamageMultiplier(kittyBody)
    );

    armBadtzExplosion(kittyBody);
    return;
  }

  if (isCollision(ta, tb, "kitty", "enemy")) {
    const enemyBody = ta === "enemy" ? a : b;
    killEnemy(enemyBody.gameRef);
    return;
  }

  if (isCollision(ta, tb, "block", "enemy")) {
    const blockBody = ta === "block" ? a : b;
    const enemyBody = ta === "enemy" ? a : b;

    if (shouldBlockKillEnemy(blockBody, enemyBody, power)) {
      killEnemy(enemyBody.gameRef);
    }

    return;
  }

  if (ta === "block" && tb === "block" && power > 1.8) {
    const blockA = a.gameRef;
    const blockB = b.gameRef;

    if (blockA.anchorBroken && !blockB.anchorBroken) {
      releaseBlock(blockB, a.velocity.x * 0.12, a.velocity.y * 0.12);
    }

    if (blockB.anchorBroken && !blockA.anchorBroken) {
      releaseBlock(blockA, b.velocity.x * 0.12, b.velocity.y * 0.12);
    }

    damageBlock(blockA, power * 0.35);
    damageBlock(blockB, power * 0.35);
  }
}

function isCollision(a, b, x, y) {
  return (a === x && b === y) || (a === y && b === x);
}

/* =========================================================
   LEVEL DATA
========================================================= */

const LEVELS = {
  1: {
    b: [
      [585, 430, 245, 25],
      [610, 380, 25, 50],
      [780, 380, 25, 50],
      [585, 355, 245, 25],
      [600, 255, 25, 100],
      [790, 255, 25, 100],
      [585, 230, 245, 25],
      [585, 355, 245, 25],
      [645, 155, 25, 75],
      [745, 155, 25, 75],
      [645, 130, 125, 25],
      [645, 230, 125, 25],
      [695, 80, 25, 50],
      [680, 280, 55, 22],
      [695, 302, 25, 53]
    ],
    e: [[710, 195, 35]]
  },

  2: {
    b: [
      [500, 430, 125, 25],
      [775, 430, 95, 25],
      [625, 405, 25, 50],
      [750, 405, 25, 50],
      [625, 380, 150, 25],
      [550, 405, 75, 25],
      [775, 405, 75, 25],
      [575, 380, 50, 25],
      [775, 380, 50, 25],
      [440, 375, 130, 25],
      [455, 315, 25, 60],
      [545, 315, 25, 60],
      [440, 290, 130, 25],
      [800, 375, 80, 25],
      [805, 315, 25, 60],
      [855, 315, 25, 60],
      [800, 290, 80, 25],
      [585, 330, 245, 25],
      [610, 230, 25, 100],
      [805, 230, 25, 100],
      [585, 205, 245, 25],
      [650, 130, 25, 75],
      [745, 130, 25, 75],
      [650, 105, 120, 25],
      [675, 305, 55, 25],
      [690, 255, 25, 50],
      [675, 230, 55, 25]
    ],
    e: [[700, 420, 35]]
  },

  3: {
    b: [
      [235, 430, 25, 25],
      [340, 430, 25, 25],
      [220, 405, 155, 25],
      [235, 320, 25, 85],
      [350, 320, 25, 85],
      [220, 295, 155, 25],
      [270, 215, 25, 80],
      [370, 215, 25, 80],
      [270, 190, 125, 25],
      [145, 350, 110, 25],
      [160, 250, 25, 100],
      [230, 250, 25, 100],
      [145, 225, 110, 25],
      [385, 390, 145, 25],
      [410, 315, 25, 75],
      [505, 315, 25, 75],
      [385, 290, 145, 25],
      [545, 430, 25, 25],
      [690, 430, 25, 25],
      [520, 405, 220, 25],
      [545, 315, 25, 90],
      [705, 315, 25, 90],
      [520, 290, 220, 25],
      [585, 220, 25, 70],
      [675, 220, 25, 70],
      [585, 195, 115, 25],
      [400, 230, 130, 25],
      [500, 150, 25, 80],
      [520, 150, 150, 25],
      [655, 150, 25, 70],
      [775, 430, 25, 25],
      [860, 430, 25, 25],
      [750, 405, 135, 25],
      [760, 310, 25, 95],
      [860, 310, 25, 95],
      [750, 285, 135, 25],
      [795, 210, 25, 75],
      [855, 210, 25, 75],
      [795, 185, 85, 25],
      [720, 245, 105, 25],
      [820, 145, 25, 100],
      [840, 145, 90, 25],
      [905, 245, 25, 185],
      [115, 430, 75, 25],
      [185, 405, 25, 50],
      [445, 430, 25, 25],
      [620, 90, 25, 105],
      [700, 155, 25, 135]
    ],
    e: [
      [175, 315, 28],
      [300, 255, 30],
      [460, 350, 30],
      [625, 255, 32],
      [625, 155, 28],
      [815, 250, 30],
      [815, 365, 32]
    ]
  }
};

/* =========================================================
   LEVEL LOADING
========================================================= */

function buildPhysicsBodiesForLevel() {
  resetPhysicsWorld();

  blocks.forEach(createBlockBody);
  assignBlockSupports();

  enemies.forEach(createEnemyBody);

  clearMyMelodyCopies();
  resetBadtzExplosion();

  bird.body = null;
  ensureBirdBody();
}

function loadLevel(n) {
  currentLevel = n;
  levelCompleteHandled = false;
  structureHasBeenTouched = false;

  const data = LEVELS[n] || LEVELS[1];

  blocks = data.b.map(values => makeBlock(...values));

  setEnemies(
    data.e.map(([x, y, radius]) => ({
      x,
      y,
      radius,
      alive: true
    }))
  );

  moveLevelToStructureArea();
  buildPhysicsBodiesForLevel();
}

function startLevel(n) {
  settingsMenuOpen = false;

  loadLevel(n);
  setupLevelCharacterQueue();
  resetBirdOnly();

  cameraX = 0;
  targetCameraX = 0;

  gameState = "playing";

  startLevelPreviewCamera();
}

function startLevelPreviewCamera() {
  cameraX = 0;
  targetCameraX = 0;

  levelPreviewActive = true;
  levelPreviewStep = "showSling";
  levelPreviewTimer = Date.now();
}

function syncLevelUnlocks() {
  levelButtons.forEach(button => {
    button.unlocked = button.level <= highestUnlockedLevel && button.level <= 3;
  });
}

/* =========================================================
   CAMERA
========================================================= */

function updateCamera() {
  if (gameState !== "playing") {
    cameraX = 0;
    targetCameraX = 0;
    return;
  }

  if (cameraDragging) {
    cameraX = clampCameraX(cameraX);
    targetCameraX = cameraX;
    return;
  }

  if (levelPreviewActive) {
    updatePreviewCamera();
  } else if (bird.launched) {
    targetCameraX = clampCameraX(bird.x - 250);
  } else {
    targetCameraX = clampCameraX(targetCameraX);
  }

  cameraX += (targetCameraX - cameraX) * 0.08;
}

function updatePreviewCamera() {
  const t = Date.now() - levelPreviewTimer;

  if (levelPreviewStep === "showSling") {
    targetCameraX = 0;

    if (t > 700) {
      levelPreviewStep = "showStructure";
      levelPreviewTimer = Date.now();
    }

    return;
  }

  if (levelPreviewStep === "showStructure") {
    targetCameraX = clampCameraX(STRUCTURE_START_X - 300);

    if (t > 1200) {
      levelPreviewStep = "returnToSling";
      levelPreviewTimer = Date.now();
    }

    return;
  }

  if (levelPreviewStep === "returnToSling") {
    targetCameraX = 0;

    if (t > 1200) {
      levelPreviewActive = false;
      levelPreviewStep = "none";
    }
  }
}

/* =========================================================
   DRAW HELPERS
========================================================= */

function text(t, x, y, size = 20, align = "center", stroke = true) {
  ctx.font = `bold ${size}px Arial`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";

  if (stroke) {
    ctx.strokeStyle = "black";
    ctx.lineWidth = Math.max(2, size / 10);
    ctx.strokeText(t, x, y);
  }

  ctx.fillStyle = "white";
  ctx.fillText(t, x, y);
}

function rect(b, fill = "#ff8ac7", stroke = "white", sw = 3, shadow = true) {
  if (shadow) {
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(b.x + 4, b.y + 4, b.w, b.h);
  }

  ctx.fillStyle = fill;
  ctx.fillRect(b.x, b.y, b.w, b.h);

  ctx.strokeStyle = stroke;
  ctx.lineWidth = sw;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
}

function drawButton(b, label = b.text, size = 20) {
  rect(b);
  text(label, b.x + b.w / 2, b.y + b.h / 2, size, "center", false);
}

function panel(title, size = 48) {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#ffb6d9";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(60, 60, W - 120, H - 100);

  ctx.strokeStyle = "white";
  ctx.lineWidth = 6;
  ctx.strokeRect(60, 60, W - 120, H - 100);

  text(title, W / 2, 105, size);
}

function drawRotatedImage(im, x, y, w, h, angle) {
  if (!im.complete) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(im, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawCircleSprite(im, x, y, radius) {
  if (!im.complete) return;

  const isPenguin = im === badtzMaruImg;
  const isCinnamoroll = im === cinnamorollImg;
  const cinnamorollScale = 1.5;

  const w = isPenguin
    ? radius * 2.55
    : isCinnamoroll
      ? radius * 2.75 * cinnamorollScale
      : radius * 2;

  const h = isCinnamoroll
    ? radius * 1.85 * cinnamorollScale
    : radius * 2;

  ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
}

function drawCharacterById(id, x, y, radius) {
  drawCircleSprite(characterImgById(id), x, y, radius);
}

/* =========================================================
   DRAW SCREENS
========================================================= */

function drawLoadingScreen() {
  ctx.clearRect(0, 0, W, H);

  if (loadingScreenImg.complete) {
    ctx.drawImage(loadingScreenImg, 0, 0, W, H);
    return;
  }

  ctx.fillStyle = "#39bdf8";
  ctx.fillRect(0, 0, W, H);

  text("ANGRY KITTIES", W / 2, H / 2, 64, "center", false);
}

function drawSaveSelect() {
  panel("Choose Save File");
  saveSlots.forEach(drawSaveSlot);
}

function drawSaveSlot(slotBox) {
  const save = getSaveData(slotBox.slot);
  const hasSave = !!save;

  rect(slotBox, hasSave ? "#ff8ac7" : "#777", "white", 4, true);

  text("Save " + slotBox.slot, slotBox.x + slotBox.w / 2, slotBox.y + 35, 28);

  if (hasSave) {
    text("Coins: " + save.coins, slotBox.x + slotBox.w / 2, slotBox.y + 90, 20);

    rect(box(slotBox.x + 35, slotBox.y + 140, 130, 35), "#ffd966", "white", 3, false);
    text("PLAY", slotBox.x + slotBox.w / 2, slotBox.y + 158, 16);

    rect(box(slotBox.x + 35, slotBox.y + 180, 130, 25), "#ff4f8b", "white", 2, false);
    text("DELETE", slotBox.x + slotBox.w / 2, slotBox.y + 193, 13);

    return;
  }

  text("Empty", slotBox.x + slotBox.w / 2, slotBox.y + 95, 24);

  rect(box(slotBox.x + 35, slotBox.y + 145, 130, 40), "#ffd966", "white", 3, false);
  text("NEW GAME", slotBox.x + slotBox.w / 2, slotBox.y + 165, 16);
}

function drawLevelSelect() {
  panel("Choose a Level");

  drawCoinDisplay();
  drawButton(characterButton, "Unlocks", 18);

  levelButtons.forEach(drawLevelButton);
}

function drawLevelButton(button) {
  rect(button, button.unlocked ? "#ff8ac7" : "#777", "white", 4, true);

  text(
    button.unlocked ? button.level : "?",
    button.x + button.w / 2,
    button.y + 45,
    button.unlocked ? 42 : 34,
    "center",
    false
  );

  text(
    button.unlocked ? "PLAY" : "LOCKED",
    button.x + button.w / 2,
    button.y + 82,
    button.unlocked ? 16 : 15,
    "center",
    false
  );
}

function drawCharacterSelect() {
  panel("Unlock Characters", 46);

  drawButton(backToLevelsButton, "← Back to Levels", 17);
  drawCoinDisplay();

  clampCharacterScroll();

  ctx.save();
  ctx.beginPath();
  ctx.rect(characterViewport.x, characterViewport.y, characterViewport.w, characterViewport.h);
  ctx.clip();

  getCharacterList().forEach((character, i) => {
    drawCharacterCard(getCharacterCardBox(i), character);
  });

  ctx.restore();

  ctx.fillStyle = "white";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;

  ctx.strokeText("Unlocked characters automatically join every level", W / 2, 455);
  ctx.fillText("Unlocked characters automatically join every level", W / 2, 455);

  drawCharacterScrollbar();
}

function drawCharacterCard(b, character) {
  rect(b, "#ff8ac7", "white", 4, true);

  text(character.title, b.x + b.w / 2, b.y + 30, 24);

  if (character.img.complete) {
    ctx.globalAlpha = character.unlocked ? 1 : 0.45;

    if (character.id === "mymelody") {
      ctx.drawImage(character.img, b.x + 72, b.y + 50, 95, 110);
    } else if (character.id === "badtzmaru") {
      ctx.drawImage(character.img, b.x + 48, b.y + 55, 125, 100);
    } else if (character.id === "cinnamoroll") {
      ctx.drawImage(character.img, b.x + 8, b.y + 40, 225, 158);
    } else {
      ctx.drawImage(character.img, b.x + 75, b.y + 60, 90, 90);
    }

    ctx.globalAlpha = 1;
  }

  if (!character.unlocked) {
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(b.x, b.y, b.w, b.h);

    text("🔒", b.x + b.w / 2, b.y + 105, 44, "center", false);
  }

  text(character.bottom, b.x + b.w / 2, b.y + 178, 18);
}

function drawCharacterScrollbar() {
  const track = box(165, 470, 570, 10);
  const max = maxCharacterScroll();

  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.fillRect(track.x, track.y, track.w, track.h);

  const knobW =
    max > 0
      ? Math.max(80, track.w * (characterViewport.w / characterContentWidth()))
      : track.w;

  const knobX =
    track.x + (max > 0 ? (track.w - knobW) * (characterScrollX / max) : 0);

  ctx.fillStyle = "#ff8ac7";
  ctx.fillRect(knobX, track.y, knobW, track.h);
}

function drawCoinDisplay() {
  const x = 735;
  const y = 92;

  ctx.save();

  ctx.fillStyle = "#f7c948";
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#9b6b00";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#fff2a8";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", x, y + 1);

  text(coins, x + 30, y + 2, 30, "left");

  ctx.restore();
}

/* =========================================================
   CHARACTER SELECT SCROLL
========================================================= */

function characterContentWidth() {
  return 40 + getCharacterList().length * characterSpacing - (characterSpacing - characterCardW);
}

function maxCharacterScroll() {
  return Math.max(0, characterContentWidth() - characterViewport.w);
}

function clampCharacterScroll() {
  characterScrollX = clamp(characterScrollX, 0, maxCharacterScroll());
}

function getCharacterCardBox(i) {
  return box(
    characterViewport.x + 20 + i * characterSpacing - characterScrollX,
    210,
    characterCardW,
    characterCardH
  );
}

/* =========================================================
   DRAW GAMEPLAY
========================================================= */

function drawBackground() {
  if (backgroundImg.complete) {
    ctx.drawImage(backgroundImg, 0, 0, W, H);
    return;
  }

  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(0, 0, W, H);
}

function drawSpoonCatapult() {
  drawRotatedImage(
    spoonImg,
    SLING.x + 12,
    SLING.y + 45,
    90,
    200,
    -0.35 + spoonBend
  );

  if (!bird.launched) {
    ctx.fillStyle = "rgba(180,180,180,.65)";
    ctx.beginPath();
    ctx.ellipse(bird.x, bird.y + 18, 28, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawQueuedCharacterLineup() {
  if (gameState !== "playing" || levelCharacterQueue.length <= 1) return;

  const groundLineY = GROUND_Y - 24;
  const firstX = SLING.x - 85;

  let spot = 0;

  for (let i = currentQueueIndex + 1; i < levelCharacterQueue.length; i++) {
    drawCharacterById(levelCharacterQueue[i], firstX - spot * 58, groundLineY, 22);
    spot++;
  }
}

function drawCharactersLeftText() {
  if (gameState !== "playing") return;

  const left = Math.max(
    0,
    levelCharacterQueue.length - currentQueueIndex - (bird.launched ? 1 : 0)
  );

  const label = bird.launched
    ? "Next: " + left
    : "Ready: " + characterNameById(selectedCharacter);

  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(20, 72, 230, 32);

  text(label, 35, 89, 15, "left", false);

  if (levelOutOfCharacters && anyEnemyAlive()) {
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(270, 82, 360, 46);

    text("No characters left! Press Reset.", 450, 105, 22, "center", false);
  }
}

function drawCameraHint() {
  if (gameState !== "playing" || bird.launched || levelPreviewActive) return;

  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(285, 20, 330, 35);

  text("Drag empty space left/right to aim view", 450, 38, 16, "center", false);
}

function drawLaunchPath() {
  if (!bird.dragging || bird.launched) return;

  let x = bird.x;
  let y = bird.y;

  let vx = (SLING.x - bird.x) * LAUNCH_POWER;
  let vy = (SLING.y - bird.y) * LAUNCH_POWER;

  ctx.save();

  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.strokeStyle = "rgba(255,79,163,.9)";
  ctx.lineWidth = 2;

  for (let i = 0; i < 90; i++) {
    vy += TRAJECTORY_GRAVITY;

    x += vx;
    y += vy;

    vx *= TRAJECTORY_FRICTION;
    vy *= TRAJECTORY_FRICTION;

    if (y + bird.radius > GROUND_Y) {
      y = GROUND_Y - bird.radius;
      vy *= -0.45;
      vx *= 0.8;
    }

    if (i % 5 === 0) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawWoodBlock(block) {
  if (!block?.body) return;

  const x = block.body.position.x;
  const y = block.body.position.y;
  const angle = block.body.angle;

  const damagePercent = block.maxHealth
    ? 1 - block.health / block.maxHealth
    : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (woodImg.complete && woodImg.naturalWidth > 0) {
    ctx.drawImage(
      woodImg,
      woodImg.naturalWidth * 0.3,
      woodImg.naturalHeight * 0.15,
      woodImg.naturalWidth * 0.42,
      woodImg.naturalHeight * 0.82,
      -block.w / 2 - 1,
      -block.h / 2 - 1,
      block.w + 2,
      block.h + 2
    );
  } else {
    ctx.fillStyle =
      damagePercent > 0.65
        ? "#5b2b10"
        : damagePercent > 0.25
          ? "#744015"
          : "#9b5f22";

    ctx.fillRect(-block.w / 2, -block.h / 2, block.w, block.h);

    ctx.strokeStyle = "#5c3514";
    ctx.lineWidth = 2;
    ctx.strokeRect(-block.w / 2, -block.h / 2, block.w, block.h);
  }

  drawWoodCracks(block, damagePercent);

  ctx.restore();
}

function drawWoodCracks(block, damagePercent) {
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;

  function crack(points) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);

    for (let i = 2; i < points.length; i += 2) {
      ctx.lineTo(points[i], points[i + 1]);
    }

    ctx.stroke();
  }

  if (damagePercent > 0.25) {
    crack([
      -block.w * 0.25,
      -block.h * 0.25,
      -block.w * 0.05,
      -block.h * 0.05,
      -block.w * 0.18,
      block.h * 0.18
    ]);
  }

  if (damagePercent > 0.55) {
    crack([
      block.w * 0.2,
      -block.h * 0.25,
      block.w * 0.05,
      0,
      block.w * 0.25,
      block.h * 0.2
    ]);
  }

  if (damagePercent > 0.75) {
    crack([
      -block.w * 0.35,
      block.h * 0.1,
      0,
      block.h * 0.25,
      block.w * 0.35,
      block.h * 0.05
    ]);
  }
}

function drawBadtzProjectile() {
  drawCircleSprite(badtzMaruImg, bird.x, bird.y, bird.radius * 1.05);

  if (!badtzExplosion.armed) return;

  const elapsed = Date.now() - badtzExplosion.startTime;
  const pulse = 0.5 + Math.sin(elapsed * 0.018) * 0.18;

  ctx.save();

  ctx.globalAlpha = 0.45 + pulse * 0.25;
  ctx.fillStyle = "red";

  ctx.beginPath();
  ctx.ellipse(
    bird.x,
    bird.y,
    bird.radius * 1.35,
    bird.radius * 1.08,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "#ff1c1c";
  ctx.lineWidth = 5;

  ctx.beginPath();
  ctx.ellipse(
    bird.x,
    bird.y,
    bird.radius * (1.45 + pulse * 0.18),
    bird.radius * (1.18 + pulse * 0.12),
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  const countdown = Math.max(0, Math.ceil((BADTZ.fuseTime - elapsed) / 1000));
  text(String(countdown), bird.x, bird.y - bird.radius - 22, 22, "center", true);

  ctx.restore();
}

function drawExplosionFlash() {
  if (!explosionFlash.active) return;

  const t = (Date.now() - explosionFlash.startTime) / 550;
  const radius = BADTZ.explosionRadius * (0.35 + t * 0.9);

  ctx.save();

  ctx.globalAlpha = Math.max(0, 1 - t);

  ctx.fillStyle = "rgba(255,80,30,.35)";
  ctx.beginPath();
  ctx.arc(explosionFlash.x, explosionFlash.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,0,0,.9)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(explosionFlash.x, explosionFlash.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawSettingsGearButton() {
  rect(settingsButton, settingsMenuOpen ? "#ffd966" : "#ff8ac7", "white", 4, true);
  text("⚙", settingsButton.x + settingsButton.w / 2, settingsButton.y + settingsButton.h / 2 + 1, 30, "center", false);
}

function drawSettingsMenu() {
  if (!settingsMenuOpen) return;

  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(settingsPanelBox.x + 5, settingsPanelBox.y + 5, settingsPanelBox.w, settingsPanelBox.h);

  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(settingsPanelBox.x, settingsPanelBox.y, settingsPanelBox.w, settingsPanelBox.h);

  ctx.strokeStyle = "white";
  ctx.lineWidth = 5;
  ctx.strokeRect(settingsPanelBox.x, settingsPanelBox.y, settingsPanelBox.w, settingsPanelBox.h);

  text("Settings", W / 2, 94, 26, "center", false);

  const fullscreenOn =
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    fakeFullscreen;

  drawButton(
    settingsFullscreenButton,
    fullscreenOn ? "Exit Fullscreen" : "⛶ Fullscreen",
    18
  );

  drawButton(settingsResetButton, "Reset", 20);
  drawButton(settingsLeaveButton, "Leave to Levels", 17);

  ctx.restore();
}

function draw() {
  if (gameState === "loading") return drawLoadingScreen();
  if (gameState === "saveSelect") return drawSaveSelect();
  if (gameState === "levelSelect") return drawLevelSelect();
  if (gameState === "characterSelect") return drawCharacterSelect();

  ctx.clearRect(0, 0, W, H);
  drawBackground();

  ctx.save();
  ctx.translate(-cameraX, 0);

  drawQueuedCharacterLineup();
  drawSpoonCatapult();
  drawLaunchPath();

  blocks.forEach(drawWoodBlock);
  drawExplosionFlash();

  enemies.forEach(enemy => {
    if (enemy.alive) {
      drawCircleSprite(kuromiImg, enemy.x, enemy.y, enemy.radius);
    }
  });

  if (selectedCharacter === "badtzmaru") {
    drawBadtzProjectile();
  } else {
    drawCircleSprite(currentImg(), bird.x, bird.y, bird.radius);
  }

  myMelodyCopies.forEach(copy => {
    drawCircleSprite(myMelodyImg, copy.x, copy.y, copy.radius);
  });

  ctx.restore();

  if (enemies.length && allEnemiesVanquished()) {
    ctx.fillStyle = "#ff4fa3";
    ctx.font = "36px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Evil Kuromi Vanquished!", 250, 100);
  }

  drawCameraHint();
  drawCharactersLeftText();
  drawSettingsGearButton();
  drawSettingsMenu();
}

/* =========================================================
   FULLSCREEN
========================================================= */

async function toggleFullscreen() {
  const el = document.documentElement;

  const realFullscreen =
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement;

  if (!realFullscreen && !fakeFullscreen) {
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) await el.msRequestFullscreen();
      else enableFakeMobileFullscreen();

      try {
        if (screen.orientation?.lock) await screen.orientation.lock("landscape");
      } catch {}
    } catch {
      enableFakeMobileFullscreen();
    }

    return;
  }

  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
    else if (document.msExitFullscreen) await document.msExitFullscreen();
  } catch {}

  disableFakeMobileFullscreen();
}

function enableFakeMobileFullscreen() {
  fakeFullscreen = true;

  setStyles(document.documentElement, {
    position: "fixed",
    left: 0,
    top: 0,
    width: "100vw",
    height: "100dvh",
    overflow: "hidden",
    background: "black"
  });

  setStyles(document.body, {
    position: "fixed",
    left: 0,
    top: 0,
    width: "100vw",
    height: "100dvh",
    overflow: "hidden",
    background: "black"
  });

  setStyles(canvas, {
    position: "fixed",
    left: 0,
    top: 0,
    width: "100vw",
    height: "100dvh",
    zIndex: "999999"
  });

  scrollTo(0, 0);
}

function disableFakeMobileFullscreen() {
  fakeFullscreen = false;

  setStyles(document.documentElement, {
    position: "",
    left: "",
    top: "",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    background: "black"
  });

  setStyles(document.body, {
    position: "",
    left: "",
    top: "",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    background: "black"
  });

  setStyles(canvas, {
    position: "",
    left: "",
    top: "",
    width: "100vw",
    height: "100vh",
    zIndex: ""
  });
}

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) fakeFullscreen = false;
});

document.addEventListener("webkitfullscreenchange", () => {
  if (document.webkitFullscreenElement) fakeFullscreen = false;
});

/* =========================================================
   UPDATES
========================================================= */

function updateLoading() {
  if (Date.now() - loadingStartTime >= 5000) {
    gameState = "saveSelect";
  }
}

function updateBird() {
  ensureBirdBody();

  if (bird.dragging && bird.body) {
    Body.setStatic(bird.body, true);
    Body.setPosition(bird.body, { x: bird.x, y: bird.y });
    Body.setVelocity(bird.body, { x: 0, y: 0 });
    Body.setAngularVelocity(bird.body, 0);
  }

  if (bird.launched && bird.body) {
    syncBody(bird);

    spoonTargetBend = 0;

    if (anyEnemyAlive() && areAllProjectilesDone()) {
      scheduleNextQueuedCharacter();
    }
  }

  spoonBend += (spoonTargetBend - spoonBend) * 0.18;
}

function updatePhysics() {
  stabilizeStructureBeforeTouch();

  Engine.update(engine, 1000 / 60);

  updateAnchorStress();
  updateStructureBalance();
  keepTallBlocksFromGoingCrazy();

  syncAllBodies();
}

function checkWinState() {
  if (allEnemiesVanquished()) {
    completeLevel();
  }
}

function completeLevel() {
  if (levelCompleteHandled) return;

  settingsMenuOpen = false;
  levelCompleteHandled = true;

  coins += LEVEL_COIN_REWARDS[currentLevel] || 0;

  if (currentLevel === 1 && highestUnlockedLevel < 2) {
    highestUnlockedLevel = 2;
  }

  if (currentLevel === 2 && highestUnlockedLevel < 3) {
    highestUnlockedLevel = 3;
  }

  syncLevelUnlocks();
  saveGameData();

  setTimeout(() => {
    gameState = "levelSelect";
    currentLevel = null;

    resetBirdOnly();

    cameraX = 0;
    targetCameraX = 0;
  }, 1000);
}

function gameLoop() {
  if (gameState === "loading") {
    updateLoading();
  }

  if (gameState === "playing") {
    updateBird();
    updatePhysics();
    updateBadtzExplosion();
    checkWinState();
    updateCamera();
  }

  draw();
  requestAnimationFrame(gameLoop);
}

/* =========================================================
   INPUT: MAIN POINTER
========================================================= */

canvas.addEventListener("pointerdown", e => {
  e.preventDefault();

  const p = pointerScreen(e);

  if (gameState === "saveSelect") {
    handleSaveSelectClick(p.x, p.y);
    return;
  }

  if (gameState === "characterSelect") {
    if (inside(p.x, p.y, backToLevelsButton)) {
      characterScrollDragging = false;
      characterScrollPointerId = null;
      characterScrollMoved = false;
      gameState = "levelSelect";
      return;
    }

    handleCharacterSelectPointerDown(e, p.x, p.y);
    return;
  }

  if (gameState === "levelSelect") {
    if (inside(p.x, p.y, characterButton)) {
      gameState = "characterSelect";
      return;
    }

    const level = levelButtons.find(button => inside(p.x, p.y, button));

    if (level?.unlocked) {
      startLevel(level.level);
    }

    return;
  }

  if (gameState !== "playing") return;

  if (inside(p.x, p.y, settingsButton)) {
    settingsMenuOpen = !settingsMenuOpen;
    return;
  }

  if (settingsMenuOpen) {
    handleSettingsClick(p.x, p.y);
    return;
  }

  if (triggerManualBadtzExplosion()) return;
  if (canUseMyMelodySplit()) return splitMyMelody();

  levelPreviewActive = false;
  levelPreviewStep = "none";

  const worldPoint = pointerWorld(e);
  const dx = worldPoint.x - bird.x;
  const dy = worldPoint.y - bird.y;

  if (!bird.launched && dist(dx, dy) < bird.radius + 15) {
    startDraggingBird(e);
    return;
  }

  if (!bird.dragging) {
    startDraggingCamera(e, p.x);
  }
});

canvas.addEventListener("pointermove", e => {
  e.preventDefault();

  if (gameState === "characterSelect") {
    handleCharacterSelectPointerMove(e);
    return;
  }

  if (gameState !== "playing" || settingsMenuOpen) return;

  const p = pointerScreen(e);

  if (cameraDragging && e.pointerId === cameraDragPointerId) {
    dragCamera(p.x);
    return;
  }

  if (!bird.dragging) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;

  dragBird(e);
});

canvas.addEventListener("pointerup", e => {
  e.preventDefault();

  if (gameState === "characterSelect") {
    handleCharacterSelectPointerUp(e);
    return;
  }

  if (gameState !== "playing" || settingsMenuOpen) return;

  if (cameraDragging && e.pointerId === cameraDragPointerId) {
    stopDraggingCamera(e);
    return;
  }

  if (activePointerId !== null && e.pointerId !== activePointerId) return;

  launchBird();
  releasePointer(e);
  activePointerId = null;
});

canvas.addEventListener("pointercancel", e => {
  e.preventDefault();

  if (gameState === "characterSelect") {
    handleCharacterSelectPointerCancel(e);
    return;
  }

  if (gameState !== "playing" || settingsMenuOpen) return;

  if (cameraDragging && e.pointerId === cameraDragPointerId) {
    cameraDragging = false;
    cameraDragPointerId = null;
    return;
  }

  if (activePointerId !== null && e.pointerId !== activePointerId) return;

  launchBird();
  activePointerId = null;
});

canvas.addEventListener(
  "wheel",
  e => {
    if (gameState !== "characterSelect") return;

    e.preventDefault();

    characterScrollX = clamp(
      characterScrollX + e.deltaY + e.deltaX,
      0,
      maxCharacterScroll()
    );
  },
  { passive: false }
);

/* =========================================================
   INPUT HELPERS
========================================================= */

function handleSettingsClick(x, y) {
  if (inside(x, y, settingsFullscreenButton)) {
    toggleFullscreen();
    return;
  }

  if (inside(x, y, settingsResetButton)) {
    resetGame();
    return;
  }

  if (inside(x, y, settingsLeaveButton)) {
    leaveToLevelSelect();
    return;
  }

  if (inside(x, y, settingsPanelBox)) return;

  settingsMenuOpen = false;
}

function startDraggingBird(e) {
  bird.dragging = true;
  activePointerId = e.pointerId;

  ensureBirdBody();

  Body.setStatic(bird.body, true);
  Body.setPosition(bird.body, { x: bird.x, y: bird.y });
  Body.setVelocity(bird.body, { x: 0, y: 0 });

  capturePointer(e);
}

function dragBird(e) {
  const worldPoint = pointerWorld(e);

  bird.x = worldPoint.x;
  bird.y = worldPoint.y;

  const dx = bird.x - SLING.x;
  const dy = bird.y - SLING.y;
  const d = dist(dx, dy);
  const maxPull = 100;

  if (d > maxPull) {
    bird.x = SLING.x + (dx / d) * maxPull;
    bird.y = SLING.y + (dy / d) * maxPull;
  }

  if (bird.body) {
    Body.setPosition(bird.body, { x: bird.x, y: bird.y });
    Body.setVelocity(bird.body, { x: 0, y: 0 });
  }

  spoonTargetBend = -0.45 * Math.min(d / maxPull, 1);
}

function startDraggingCamera(e, screenX) {
  cameraDragging = true;
  cameraDragPointerId = e.pointerId;
  lastCameraDragX = screenX;

  capturePointer(e);
}

function dragCamera(screenX) {
  cameraX = clampCameraX(cameraX - (screenX - lastCameraDragX));
  targetCameraX = cameraX;
  lastCameraDragX = screenX;
}

function stopDraggingCamera(e) {
  cameraDragging = false;
  cameraDragPointerId = null;

  releasePointer(e);
}

/* =========================================================
   INPUT: SAVE SELECT
========================================================= */

function handleSaveSelectClick(x, y) {
  for (const slot of saveSlots) {
    if (!inside(x, y, slot)) continue;

    const hasSave = !!getSaveData(slot.slot);

    const deleteBox = box(slot.x + 35, slot.y + 180, 130, 25);

    if (hasSave && inside(x, y, deleteBox)) {
      deleteSaveFile(slot.slot);
      return;
    }

    if (hasSave) {
      loadSaveFile(slot.slot);
    } else {
      createNewSave(slot.slot);
    }

    return;
  }
}

/* =========================================================
   INPUT: CHARACTER SELECT
========================================================= */

function handleCharacterSelectClick(x, y) {
  if (inside(x, y, backToLevelsButton)) {
    gameState = "levelSelect";
    return;
  }

  const characters = getCharacterList();

  for (let i = 0; i < characters.length; i++) {
    const cardBox = getCharacterCardBox(i);

    if (inside(x, y, cardBox)) {
      chooseCharacter(characters[i].id);
      return;
    }
  }
}

function handleCharacterSelectPointerDown(e, x, y) {
  if (inside(x, y, backToLevelsButton)) {
    gameState = "levelSelect";
    return;
  }

  if (!inside(x, y, characterViewport)) {
    handleCharacterSelectClick(x, y);
    return;
  }

  characterScrollDragging = true;
  characterScrollPointerId = e.pointerId;
  characterScrollLastX = x;
  characterScrollMoved = false;

  capturePointer(e);
}

function handleCharacterSelectPointerMove(e) {
  if (!characterScrollDragging || e.pointerId !== characterScrollPointerId) return;

  const p = pointerScreen(e);
  const dx = p.x - characterScrollLastX;

  if (Math.abs(dx) > 2) {
    characterScrollMoved = true;
  }

  characterScrollX = clamp(
    characterScrollX - dx,
    0,
    maxCharacterScroll()
  );

  characterScrollLastX = p.x;
}

function handleCharacterSelectPointerUp(e) {
  if (!characterScrollDragging || e.pointerId !== characterScrollPointerId) return;

  characterScrollDragging = false;
  characterScrollPointerId = null;

  releasePointer(e);

  const p = pointerScreen(e);

  if (!characterScrollMoved) {
    handleCharacterSelectClick(p.x, p.y);
  }
}

function handleCharacterSelectPointerCancel(e) {
  if (characterScrollDragging && e.pointerId === characterScrollPointerId) {
    characterScrollDragging = false;
    characterScrollPointerId = null;
  }
}

/* =========================================================
   BIRD CONTROL
========================================================= */

function launchBird() {
  if (!bird.dragging) return;

  bird.dragging = false;
  bird.launched = true;

  canReloadBird = false;
  myMelodySplitUsed = false;

  clearMyMelodyCopies();
  resetBadtzExplosion();

  bird.vx = (SLING.x - bird.x) * LAUNCH_POWER;
  bird.vy = (SLING.y - bird.y) * LAUNCH_POWER;

  ensureBirdBody();
  applyMainBirdCharacterPhysics();

  Body.setStatic(bird.body, false);
  Body.setPosition(bird.body, { x: bird.x, y: bird.y });
  Body.setVelocity(bird.body, { x: bird.vx, y: bird.vy });
  Body.setAngularVelocity(bird.body, bird.vx * 0.01);

  if (selectedCharacter === "badtzmaru") {
    armBadtzExplosion(bird.body);
  }

  spoonTargetBend = 0.25;

  setTimeout(() => {
    spoonTargetBend = 0;
  }, 120);
}

function resetBirdBase(resetCamera = false) {
  ensureBirdBody();
  applyMainBirdCharacterPhysics();

  Object.assign(bird, {
    x: SLING.x + KITTY_OFFSET.x,
    y: SLING.y + KITTY_OFFSET.y,
    vx: 0,
    vy: 0,
    launched: false,
    dragging: false
  });

  myMelodySplitUsed = false;

  clearMyMelodyCopies();
  resetBadtzExplosion();

  Body.setStatic(bird.body, true);
  Body.setPosition(bird.body, { x: bird.x, y: bird.y });
  Body.setVelocity(bird.body, { x: 0, y: 0 });
  Body.setAngularVelocity(bird.body, 0);
  Body.setAngle(bird.body, 0);

  spoonBend = 0;
  spoonTargetBend = 0;

  canReloadBird = false;
  activePointerId = null;

  cameraDragging = false;
  cameraDragPointerId = null;

  if (resetCamera) {
    cameraX = 0;
    targetCameraX = 0;
  }
}

function resetBirdOnly() {
  resetBirdBase(false);
}

/* =========================================================
   GAME ACTIONS
========================================================= */

function resetGame() {
  settingsMenuOpen = false;

  loadLevel(currentLevel || 1);
  setupLevelCharacterQueue();
  resetBirdOnly();

  cameraX = 0;
  targetCameraX = 0;

  startLevelPreviewCamera();
}

function leaveToLevelSelect() {
  settingsMenuOpen = false;
  gameState = "levelSelect";
  currentLevel = null;

  levelPreviewActive = false;
  levelPreviewStep = "none";

  bird.dragging = false;
  cameraDragging = false;

  activePointerId = null;
  cameraDragPointerId = null;

  resetBirdOnly();

  cameraX = 0;
  targetCameraX = 0;
}

/* =========================================================
   START GAME
========================================================= */

resetPhysicsWorld();
gameLoop();