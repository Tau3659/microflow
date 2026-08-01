import { getLayer, SCALE, TEMPER, WORLD } from "./config.js";
import { createPlayer, createNormal, createBoss, createGhost } from "./creature.js";
import { createAbilityPickup, rollAbilityDrop } from "./abilities.js";

/** 将超额的固有攻击普通怪降为被动/警惕，保证 Boss 才是主要威胁 */
function enforceHostileCap(creatures, layer) {
  const maxH = layer.maxHostileNormals ?? 0;
  const hostiles = creatures.filter((c) => c.kind === "normal" && c.temper === TEMPER.HOSTILE);
  if (hostiles.length <= maxH) return;
  // 打乱后保留前 maxH 个
  for (let i = hostiles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = hostiles[i];
    hostiles[i] = hostiles[j];
    hostiles[j] = t;
  }
  for (let i = maxH; i < hostiles.length; i += 1) {
    const c = hostiles[i];
    c.temper = Math.random() < 0.55 ? TEMPER.PASSIVE : TEMPER.SKITTISH;
    c.aggressive = false;
    c.warning = false;
    if (c.calmColor) {
      c.color = c.calmColor;
      c.membrane = c.calmMembrane;
      c.coreColor = c.calmCore;
    } else {
      c.color = layer.accent;
      c.membrane = layer.bgTop;
      c.coreColor = layer.protein;
    }
  }
}

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
    /** 吃到也算蛋白质 */
    value: 2,
    phase: rand(0, Math.PI * 2),
    color: layer.dna,
  };
}

/** dir: "down" 下一层入口 / "up" 上一层出口 */
export function createPortal(dir = "down") {
  const down = dir === "down";
  return {
    x: WORLD.width * 0.5,
    y: down ? WORLD.height * 0.18 : WORLD.height * 0.82,
    r: 42,
    open: false,
    pulse: 0,
    dir: down ? "down" : "up",
    // 下一层青绿 / 上一层暖琥珀，颜色区分
    color: down ? "#3ecfb0" : "#e8a85c",
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
  const next = getLayer(layerIndex + 1);
  const ghosts = [];
  for (let i = 0; i < 14; i += 1) {
    ghosts.push(
      createGhost(rand(80, WORLD.width - 80), rand(80, WORLD.height - 80), next)
    );
  }
  ghosts.push({
    ...createGhost(WORLD.width * 0.72, WORLD.height * 0.3, next),
    radius: SCALE.boss * 0.9,
    morph: next.boss.morph,
    color: next.boss.color,
    isBossSilhouette: true,
    blur: 3.5,
    holdDuration: 5 + Math.random() * 3,
  });
  return { ghosts, nextLayer: next };
}

export function createLevel(layerIndex, playerState) {
  const layer = getLayer(layerIndex);
  const spawn = { x: WORLD.width * 0.5, y: WORLD.height * 0.55 };
  const player = createPlayer(
    spawn.x,
    spawn.y,
    playerState.evolutionId,
    playerState.abilities || null
  );
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
  // 限制普通攻击性生物数量，随层级缓增，突出 Boss
  enforceHostileCap(creatures, layer);

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
    abilities: [],
    // 第一层仅「下一层」；其后每层同时有「上一层」与「下一层」（无限流无最后一层）
    portal: createPortal("down"),
    exitPortal: layerIndex > 0 ? createPortal("up") : null,
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

/** 被吃掉时分解：体型越大释放蛋白质越多（体质量 + 体内储存）+ 少量 DNA；极低概率掉落能力 */
export function decomposeCreature(level, creature) {
  const layer = level.layer;
  const body = Math.max(0, creature.bodyProtein || Math.round((creature.radius || 16) / 13));
  const stored = Math.max(0, creature.storedProtein || 0);
  const release = body + stored;
  const spread = Math.min(90, 28 + (creature.radius || 16) * 0.7);
  for (let i = 0; i < release; i += 1) {
    level.proteins.push(
      createProtein(
        layer,
        creature.x + rand(-spread, spread),
        creature.y + rand(-spread, spread)
      )
    );
  }
  creature.storedProtein = 0;
  creature.bodyProtein = 0;

  for (let i = 0; i < (creature.dropDna || 0); i += 1) {
    level.dnas.push(
      createDna(layer, creature.x + rand(-30, 30), creature.y + rand(-30, 30))
    );
  }

  const abilityDef = rollAbilityDrop(
    level.layerIndex,
    level.player,
    creature.kind === "boss"
  );
  if (abilityDef) {
    if (!level.abilities) level.abilities = [];
    level.abilities.push(
      createAbilityPickup(
        abilityDef,
        creature.x + rand(-20, 20),
        creature.y + rand(-20, 20)
      )
    );
    spawnBurst(level, creature.x, creature.y, abilityDef.color, 10);
  }

  spawnBurst(level, creature.x, creature.y, creature.color, 14 + Math.min(20, body));
  if (release > 0) {
    spawnBurst(level, creature.x, creature.y, layer.protein, 8 + Math.min(16, release));
  }
}

/** 场上仍流通的蛋白质：漂浮 + 生物体内储存（体质量仅死亡时额外释放，不计入耗尽判定） */
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
