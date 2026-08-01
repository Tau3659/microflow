import { LAYERS, WORLD } from "./config.js";
import { createPlayer, createNormal, createBoss } from "./creature.js";

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

export function createLevel(layerIndex, playerState) {
  const layer = LAYERS[layerIndex];
  const spawn = { x: WORLD.width * 0.5, y: WORLD.height * 0.55 };
  const player = createPlayer(spawn.x, spawn.y, playerState.evolutionId);
  // 保留进化体型，但重置位置相关
  player.x = spawn.x;
  player.y = spawn.y;

  const proteins = Array.from({ length: layer.proteinCount }, () => createProtein(layer));
  const dnas = Array.from({ length: layer.dnaCount }, () => createDna(layer));

  const creatures = [];
  for (let i = 0; i < layer.normalCount; i += 1) {
    const p = awayFrom(spawn.x, spawn.y, 220);
    creatures.push(createNormal(p.x, p.y, layer, layer.requiredEvolution));
  }

  const bossPos = awayFrom(spawn.x, spawn.y, 480);
  const boss = createBoss(bossPos.x, bossPos.y, layer);
  creatures.push(boss);

  return {
    layerIndex,
    layer,
    player,
    proteins,
    dnas,
    creatures,
    particles: [],
    floats: [],
    portal: createPortal(),
    world: { ...WORLD },
    points: playerState.points,
    evolvedThisLayer: playerState.evolvedThisLayer ?? false,
    bossDefeated: false,
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

/** 被吃掉时分解：释放蛋白质与 DNA */
export function decomposeCreature(level, creature) {
  const layer = level.layer;
  for (let i = 0; i < creature.dropProtein; i += 1) {
    level.proteins.push(
      createProtein(layer, creature.x + rand(-40, 40), creature.y + rand(-40, 40))
    );
  }
  for (let i = 0; i < creature.dropDna; i += 1) {
    level.dnas.push(
      createDna(layer, creature.x + rand(-30, 30), creature.y + rand(-30, 30))
    );
  }
  spawnBurst(level, creature.x, creature.y, creature.color, 18);
  spawnFloatText(level, creature.x, creature.y - 20, "分解", creature.color);
}

export function maintainPickups(level) {
  const { layer, proteins, dnas } = level;
  while (proteins.length < Math.floor(layer.proteinCount * 0.55)) {
    proteins.push(createProtein(layer));
  }
  while (dnas.length < Math.floor(layer.dnaCount * 0.45)) {
    dnas.push(createDna(layer));
  }
}
