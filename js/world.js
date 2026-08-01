import { LAYERS, WORLD } from "./config.js";
import { createPlayer, createNormal, createBoss, createGhost } from "./creature.js";

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function awayFrom(cx, cy, minDist) {
  for (let i = 0; i < 24; i += 1) {
    const x = rand(80, WORLD.width - 80);
    const y = rand(80, WORLD.height - 80);
    if (Math.hypot(x - cx, y - cy) >= minDist) return { x, y };
  }
  return { x: rand(80, WORLD.width - 80), y: rand(80, WORLD.height - 80) };
}

export function createProtein(layer, x, y) {
  return {
    type: "protein",
    x: x ?? rand(40, WORLD.width - 40),
    y: y ?? rand(40, WORLD.height - 40),
    r: rand(4, 7),
    value: 1,
    phase: rand(0, Math.PI * 2),
    color: layer.protein,
  };
}

export function createDna(layer, x, y) {
  return {
    type: "dna",
    x: x ?? rand(40, WORLD.width - 40),
    y: y ?? rand(40, WORLD.height - 40),
    r: rand(8, 11),
    phase: rand(0, Math.PI * 2),
    color: layer.dna,
  };
}

export function createPortal() {
  return {
    x: WORLD.width * 0.5,
    y: WORLD.height * 0.18,
    r: 42,
    open: false,
    pulse: 0,
  };
}

function createDeepField(layer, nextLayer) {
  const motes = [];
  for (let i = 0; i < 70; i += 1) {
    motes.push({
      x: rand(0, WORLD.width),
      y: rand(0, WORLD.height),
      r: rand(1, 3.5),
      phase: rand(0, Math.PI * 2),
      color: nextLayer?.protein || layer.protein,
    });
  }
  const blobs = [];
  for (let i = 0; i < 18; i += 1) {
    blobs.push({
      x: rand(0, WORLD.width),
      y: rand(0, WORLD.height),
      r: rand(40, 120),
      phase: rand(0, Math.PI * 2),
      color: nextLayer?.bgTop || layer.bgTop,
    });
  }
  return { motes, blobs };
}

function createGhostLayer(layerIndex) {
  const next = LAYERS[layerIndex + 1];
  if (!next) return { ghosts: [], nextLayer: null };
  const ghosts = [];
  for (let i = 0; i < 14; i += 1) {
    ghosts.push(
      createGhost(rand(80, WORLD.width - 80), rand(80, WORLD.height - 80), next)
    );
  }
  ghosts.push({
    ...createGhost(WORLD.width * 0.72, WORLD.height * 0.3, next),
    radius: next.boss.radius * 0.85,
    morph: next.boss.morph,
    color: next.boss.color,
    isBossSilhouette: true,
  });
  return { ghosts, nextLayer: next };
}

export function createLevel(layerIndex, playerState) {
  const layer = LAYERS[layerIndex];
  const spawn = { x: WORLD.width * 0.5, y: WORLD.height * 0.55 };
  const player = createPlayer(spawn.x, spawn.y, playerState.evolutionId);
  player.x = spawn.x;
  player.y = spawn.y;

  // 本层蛋白质总量有限，不会无限刷新
  const proteinBudget = layer.proteinCount;
  const proteins = Array.from({ length: proteinBudget }, () => createProtein(layer));
  const dnas = Array.from({ length: layer.dnaCount }, () => createDna(layer));

  const creatures = [];
  for (let i = 0; i < layer.normalCount; i += 1) {
    const p = awayFrom(spawn.x, spawn.y, 220);
    creatures.push(createNormal(p.x, p.y, layer, layer.requiredEvolution));
  }

  const bossPos = awayFrom(spawn.x, spawn.y, 480);
  const boss = createBoss(bossPos.x, bossPos.y, layer);
  creatures.push(boss);

  const { ghosts, nextLayer } = createGhostLayer(layerIndex);
  const deepField = createDeepField(layer, nextLayer);

  return {
    layerIndex,
    layer,
    nextLayer,
    player,
    proteins,
    dnas,
    creatures,
    ghosts,
    deepField,
    particles: [],
    floats: [],
    portal: createPortal(),
    world: { ...WORLD },
    points: playerState.points,
    evolvedThisLayer: playerState.evolvedThisLayer ?? false,
    bossDefeated: false,
    proteinBudget,
    proteinConsumed: 0,
    proteinsExhausted: false,
  };
}

export function spawnBurst(level, x, y, color, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, Math.PI * 2);
    const s = rand(40, 160);
    level.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.3, 0.75),
      maxLife: 0.75,
      r: rand(1.5, 3.8),
      color,
    });
  }
}

export function spawnFloatText(level, x, y, text, color) {
  level.floats.push({
    x,
    y,
    text,
    color,
    life: 1.1,
    maxLife: 1.1,
  });
}

/** 被吃掉时分解：一次性释放体内储存的蛋白质 + 少量 DNA */
export function decomposeCreature(level, creature) {
  const layer = level.layer;
  const release = Math.max(0, creature.storedProtein || 0);
  for (let i = 0; i < release; i += 1) {
    level.proteins.push(
      createProtein(layer, creature.x + rand(-48, 48), creature.y + rand(-48, 48))
    );
  }
  creature.storedProtein = 0;

  for (let i = 0; i < (creature.dropDna || 0); i += 1) {
    level.dnas.push(
      createDna(layer, creature.x + rand(-30, 30), creature.y + rand(-30, 30))
    );
  }
  spawnBurst(level, creature.x, creature.y, creature.color, 18);
  if (release > 0) {
    spawnFloatText(level, creature.x, creature.y - 20, `释放 ${release}`, layer.protein);
  } else {
    spawnFloatText(level, creature.x, creature.y - 20, "分解", creature.color);
  }
}

/** 场上仍流通的蛋白质：漂浮 + 生物体内储存 */
export function ecosystemProtein(level) {
  let stored = 0;
  for (const c of level.creatures) stored += c.storedProtein || 0;
  return level.proteins.length + stored;
}

export function maintainPickups(level) {
  // 蛋白质总量有限，不自动补充；仅维持少量 DNA 线索
  const { layer, dnas } = level;
  const minDna = Math.max(2, Math.floor(layer.dnaCount * 0.35));
  while (dnas.length < minDna) {
    dnas.push(createDna(layer));
  }
}
