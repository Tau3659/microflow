import { BOSS_AI, EVOLUTIONS, MORPH, PLAYER, TEMPER, WARNING } from "./config.js";

let nextId = 1;

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function length(x, y) {
  return Math.hypot(x, y);
}

export function normalize(x, y) {
  const len = length(x, y) || 1;
  return { x: x / len, y: y / len };
}

/** 环面地图：穿越边界无墙感 */
export function wrapEntity(entity, world) {
  let wx = 0;
  let wy = 0;
  if (!world) return { wx, wy };
  while (entity.x < 0) {
    entity.x += world.width;
    wx += world.width;
  }
  while (entity.x >= world.width) {
    entity.x -= world.width;
    wx -= world.width;
  }
  while (entity.y < 0) {
    entity.y += world.height;
    wy += world.height;
  }
  while (entity.y >= world.height) {
    entity.y -= world.height;
    wy -= world.height;
  }
  return { wx, wy };
}

/** 最短环面向量 */
export function wrappedOffset(fromX, fromY, toX, toY, world) {
  let dx = toX - fromX;
  let dy = toY - fromY;
  if (world) {
    if (dx > world.width / 2) dx -= world.width;
    if (dx < -world.width / 2) dx += world.width;
    if (dy > world.height / 2) dy -= world.height;
    if (dy < -world.height / 2) dy += world.height;
  }
  return { dx, dy, dist: Math.hypot(dx, dy) };
}

function pushApart(points, minDist, iterations = 8) {
  for (let n = 0; n < iterations; n += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const dx = points[j].ox - points[i].ox;
        const dy = points[j].oy - points[i].oy;
        const d = Math.hypot(dx, dy) || 0.0001;
        if (d >= minDist) continue;
        const push = ((minDist - d) / d) * 0.55;
        const px = dx * push * 0.5;
        const py = dy * push * 0.5;
        points[i].ox -= px;
        points[i].oy -= py;
        points[j].ox += px;
        points[j].oy += py;
      }
    }
  }
  return points;
}

function clampInBody(ox, oy, maxR) {
  const d = Math.hypot(ox, oy);
  if (d <= maxR || d < 0.0001) return { ox, oy };
  const s = maxR / d;
  return { ox: ox * s, oy: oy * s };
}

/** 细胞核分散在体内不同位置，避免挤在一起被一次吞光 */
function makeNuclei(count, radius, morph = MORPH.COCCUS) {
  const baseR = radius * PLAYER.nucleusRadiusFactor * (count > 2 ? 0.58 : 0.68);
  // 核间距尽量大，避免一张嘴扫到多个
  const minSep = radius * (count <= 2 ? 0.78 : count <= 3 ? 0.64 : count <= 4 ? 0.52 : 0.46);
  const maxR = radius * 0.9;
  const points = [];

  if (count <= 1) {
    const a = Math.random() * Math.PI * 2;
    const dist = radius * (0.48 + Math.random() * 0.32);
    return [
      {
        ox: Math.cos(a) * dist,
        oy: Math.sin(a) * dist,
        alive: true,
        r: baseR,
      },
    ];
  }

  if (morph === MORPH.BACILLUS || morph === MORPH.SPIRILLUM) {
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      // 沿长轴两端拉开，并上下交错
      points.push({
        ox: (t - 0.5) * radius * 2.2,
        oy: (i % 2 === 0 ? 1 : -1) * radius * (0.34 + (i % 3) * 0.1),
      });
    }
  } else if (morph === MORPH.COLONY) {
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + 0.2;
      const dist = radius * (0.62 + (i % 2) * 0.2);
      points.push({ ox: Math.cos(a) * dist, oy: Math.sin(a) * dist });
    }
  } else if (morph === MORPH.PHAGE) {
    for (let i = 0; i < count; i += 1) {
      const a = -Math.PI / 2 + ((i + 0.5) / count) * Math.PI * 1.7 - Math.PI * 0.85;
      const dist = radius * (0.52 + (i % 2) * 0.24);
      points.push({
        ox: Math.cos(a) * dist,
        oy: Math.sin(a) * dist * 0.85 - radius * 0.1,
      });
    }
  } else {
    // 球菌 / 病毒等：尽量贴外圈均匀分布
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + Math.PI / count;
      const ring = count >= 4 ? (i % 2 === 0 ? 0.82 : 0.55) : 0.74;
      const dist = radius * (ring + Math.random() * 0.06);
      points.push({ ox: Math.cos(a) * dist, oy: Math.sin(a) * dist });
    }
  }

  pushApart(points, minSep, 14);
  for (const p of points) {
    const c = clampInBody(p.ox, p.oy, maxR);
    p.ox = c.ox;
    p.oy = c.oy;
    const d = Math.hypot(p.ox, p.oy);
    if (d < radius * 0.36) {
      const a = Math.atan2(p.oy, p.ox) || Math.random() * Math.PI * 2;
      p.ox = Math.cos(a) * radius * 0.5;
      p.oy = Math.sin(a) * radius * 0.5;
    }
  }
  // 钳入体缘后再推一次，避免挤回一团
  pushApart(points, minSep * 0.92, 8);
  for (const p of points) {
    const c = clampInBody(p.ox, p.oy, maxR);
    p.ox = c.ox;
    p.oy = c.oy;
  }

  return points.map((p) => ({ ox: p.ox, oy: p.oy, alive: true, r: baseR }));
}

/** 嘴可在侧面/斜前方，不一定正前方 */
function makeMouthConfig(morph, radius) {
  let angle = 0;
  let dist = PLAYER.mouthDistFactor;
  if (morph === MORPH.BACILLUS) {
    angle = (Math.random() < 0.55 ? 0 : (Math.random() < 0.5 ? 0.55 : -0.55));
    dist = 1.02 + Math.random() * 0.12;
  } else if (morph === MORPH.SPIRILLUM) {
    angle = (Math.random() - 0.5) * 1.2;
    dist = 0.95 + Math.random() * 0.2;
  } else if (morph === MORPH.COCCUS) {
    angle = (Math.random() - 0.5) * Math.PI * 0.9;
    dist = 0.88 + Math.random() * 0.2;
  } else if (morph === MORPH.COLONY) {
    angle = (Math.random() - 0.5) * Math.PI;
    dist = 0.9 + Math.random() * 0.25;
  } else if (morph === MORPH.VIRUS) {
    angle = (Math.random() - 0.5) * 1.4;
    dist = 1.05 + Math.random() * 0.15;
  } else if (morph === MORPH.PHAGE) {
    angle = 0;
    dist = 0.55;
  } else {
    angle = (Math.random() - 0.5) * 1.2;
    dist = 0.9 + Math.random() * 0.2;
  }
  return {
    mouthAngle: angle,
    mouthDist: dist,
    mouthRadius: Math.max(4, radius * PLAYER.mouthRadiusFactor),
  };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function visualFromEvo(evo) {
  return {
    morph: evo.morph,
    color: evo.color,
    coreColor: evo.coreColor,
    membrane: evo.membrane,
    flagella: evo.flagella || 0,
    spikes: evo.spikes || 0,
    colonyCells: evo.colonyCells || 0,
    cilia: !!evo.cilia,
  };
}

export function createPlayer(x, y, evolutionId = 0) {
  const evo = EVOLUTIONS[evolutionId];
  const segments = [];
  for (let i = 0; i < evo.segmentCount; i += 1) {
    segments.push({ x: x - i * PLAYER.segmentSpacing * 0.5, y });
  }
  const mouth = makeMouthConfig(evo.morph, evo.radius);
  return {
    id: nextId++,
    kind: "player",
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    evolutionId,
    radius: evo.radius,
    ...visualFromEvo(evo),
    ...mouth,
    segments,
    nuclei: makeNuclei(evo.nuclei, evo.radius, evo.morph),
    pulse: 0,
    boostTimer: 0,
    boostCooldown: 0,
    invuln: 0,
    recoverProgress: 0,
    storedProtein: 0,
    alive: true,
  };
}

export function applyEvolution(player, evolutionId) {
  const evo = EVOLUTIONS[evolutionId];
  player.evolutionId = evolutionId;
  player.radius = evo.radius;
  Object.assign(player, visualFromEvo(evo));
  Object.assign(player, makeMouthConfig(evo.morph, evo.radius));
  player.nuclei = makeNuclei(evo.nuclei, evo.radius, evo.morph);
  player.recoverProgress = 0;
  while (player.segments.length < evo.segmentCount) {
    const last = player.segments[player.segments.length - 1];
    player.segments.push({ x: last.x, y: last.y });
  }
  while (player.segments.length > evo.segmentCount) player.segments.pop();
  player.invuln = 1.2;
}

export function restoreOneNucleus(player) {
  const dead = player.nuclei.find((n) => !n.alive);
  if (!dead) return false;
  dead.alive = true;
  player.invuln = Math.max(player.invuln, 0.45);
  return true;
}

function rollTemper(weights = {}) {
  const passive = weights.passive ?? 0.4;
  const hostile = weights.hostile ?? 0.25;
  const r = Math.random();
  if (r < passive) return TEMPER.PASSIVE;
  if (r < passive + hostile) return TEMPER.HOSTILE;
  return TEMPER.SKITTISH;
}

function paletteForTemper(temper, layer) {
  if (temper === TEMPER.HOSTILE) {
    return {
      color: WARNING.color,
      membrane: WARNING.membrane,
      coreColor: WARNING.core,
      aggressive: true,
      warning: true,
    };
  }
  if (temper === TEMPER.PASSIVE) {
    return {
      color: WARNING.calmPassive,
      membrane: layer.bgTop,
      coreColor: "#d8fff2",
      aggressive: false,
      warning: false,
    };
  }
  return {
    color: WARNING.calmSkittish,
    membrane: layer.bgMid || layer.bgTop,
    coreColor: "#fff3c8",
    aggressive: false,
    warning: false,
  };
}

export function isAggressive(creature) {
  if (!creature || !creature.alive) return false;
  if (creature.kind === "boss") return true;
  return !!creature.aggressive;
}

/** 被玩家攻击后，可激怒型转为攻击性并切换警告色 */
export function provokeCreature(creature) {
  if (!creature || creature.kind === "boss") return false;
  if (creature.temper === TEMPER.PASSIVE) return false;
  if (creature.aggressive) return false;
  if (creature.temper !== TEMPER.SKITTISH && creature.temper !== TEMPER.HOSTILE) {
    return false;
  }
  creature.aggressive = true;
  creature.warning = true;
  creature.calmColor = creature.color;
  creature.calmMembrane = creature.membrane;
  creature.calmCore = creature.coreColor;
  creature.color = WARNING.color;
  creature.membrane = WARNING.membrane;
  creature.coreColor = WARNING.core;
  creature.provokeFlash = 0.8;
  return true;
}

export function createNormal(x, y, layer, evolutionFloor = 0) {
  const tier = clamp(evolutionFloor + Math.floor(Math.random() * 2), 0, EVOLUTIONS.length - 1);
  const evo = EVOLUTIONS[tier];
  const morph = pick(layer.morphPool || [evo.morph]);
  const radius = evo.radius * (0.75 + Math.random() * 0.45);
  const temper = rollTemper(layer.temperWeights);
  const look = paletteForTemper(temper, layer);
  const segments = [];
  const count = Math.max(3, evo.segmentCount - 1);
  for (let i = 0; i < count; i += 1) {
    segments.push({ x: x - i * 8, y });
  }
  return {
    id: nextId++,
    kind: "normal",
    temper,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: Math.random() * Math.PI * 2,
    radius,
    morph,
    color: look.color,
    coreColor: look.coreColor,
    membrane: look.membrane,
    aggressive: look.aggressive,
    warning: look.warning,
    flagella: morph === MORPH.BACILLUS || morph === MORPH.SPIRILLUM ? 1 + Math.floor(Math.random() * 2) : 0,
    spikes: morph === MORPH.VIRUS ? 8 + Math.floor(Math.random() * 4) : 0,
    colonyCells: morph === MORPH.COLONY ? 4 + Math.floor(Math.random() * 4) : 0,
    cilia: morph === MORPH.COCCUS && Math.random() < 0.35,
    segments,
    nuclei: makeNuclei(1, radius, morph),
    ...makeMouthConfig(morph, radius),
    pulse: Math.random() * 10,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    aggro: temper === TEMPER.HOSTILE ? 0.85 + Math.random() * 0.25 : 0.4 + Math.random() * 0.3,
    provokeFlash: 0,
    alive: true,
    storedProtein: 0,
    dropDna: Math.random() < 0.45 ? 1 : 0,
  };
}

export function createBoss(x, y, layer) {
  const b = layer.boss;
  const morph = b.morph || MORPH.BACILLUS;
  const segments = [];
  for (let i = 0; i < 14; i += 1) {
    segments.push({ x: x - i * 12, y });
  }
  return {
    id: nextId++,
    kind: "boss",
    name: b.name,
    x,
    y,
    homeX: x,
    homeY: y,
    territoryRadius: BOSS_AI.territoryRadius,
    aiState: "patrol",
    vx: 0,
    vy: 0,
    angle: 0,
    radius: b.radius,
    morph,
    color: b.color,
    coreColor: "#ffe0dc",
    membrane: b.membrane || "#4a2020",
    flagella: b.flagella || 0,
    spikes: b.spikes || 0,
    colonyCells: b.colonyCells || 0,
    cilia: !!b.cilia,
    segments,
    nuclei: makeNuclei(b.nuclei, b.radius, morph),
    ...makeMouthConfig(morph, b.radius),
    pulse: 0,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    temper: TEMPER.HOSTILE,
    aggressive: true,
    warning: true,
    aggro: 1,
    provokeFlash: 0,
    alive: true,
    storedProtein: 0,
    dropDna: 2 + Math.floor(b.nuclei / 2),
  };
}

/** 下一层隐约可见的幽灵生物（不可交互） */
export function createGhost(x, y, nextLayer) {
  const morph = pick(nextLayer.morphPool || [MORPH.COCCUS]);
  const radius = 18 + Math.random() * 36;
  return {
    kind: "ghost",
    x,
    y,
    angle: Math.random() * Math.PI * 2,
    radius,
    morph,
    color: nextLayer.accent,
    membrane: nextLayer.bgTop,
    coreColor: nextLayer.protein,
    flagella: morph === MORPH.BACILLUS ? 2 : 0,
    spikes: morph === MORPH.VIRUS || morph === MORPH.PHAGE ? 10 : 0,
    colonyCells: morph === MORPH.COLONY ? 6 : 0,
    cilia: morph === MORPH.COCCUS,
    pulse: Math.random() * 10,
    drift: 12 + Math.random() * 22,
    driftAngle: Math.random() * Math.PI * 2,
  };
}

export function syncSegments(creature) {
  const segs = creature.segments;
  if (!segs?.length) return;
  segs[0].x = creature.x;
  segs[0].y = creature.y;
  const spacing = PLAYER.segmentSpacing * (0.85 + creature.radius * 0.008);
  for (let i = 1; i < segs.length; i += 1) {
    const prev = segs[i - 1];
    const curr = segs[i];
    const dx = prev.x - curr.x;
    const dy = prev.y - curr.y;
    const dist = length(dx, dy) || 1;
    curr.x = prev.x - (dx / dist) * spacing;
    curr.y = prev.y - (dy / dist) * spacing;
  }
}

export function aliveNuclei(creature) {
  return creature.nuclei.filter((n) => n.alive);
}

export function nucleusWorldPos(creature, nucleus) {
  const c = Math.cos(creature.angle);
  const s = Math.sin(creature.angle);
  return {
    x: creature.x + nucleus.ox * c - nucleus.oy * s,
    y: creature.y + nucleus.ox * s + nucleus.oy * c,
    r: nucleus.r,
  };
}

/** 嘴：相对朝向可偏转，只有嘴碰到细胞核才能吞噬 */
export function mouthWorldPos(creature) {
  const facing = creature.angle + (creature.mouthAngle || 0);
  const dist = creature.radius * (creature.mouthDist || PLAYER.mouthDistFactor);
  const r = creature.mouthRadius || Math.max(4, creature.radius * PLAYER.mouthRadiusFactor);
  return {
    x: creature.x + Math.cos(facing) * dist,
    y: creature.y + Math.sin(facing) * dist,
    r,
    facing,
  };
}

export function mouthTouchesNucleus(mouth, nucleusPos, world, bonus = 0) {
  const off = wrappedOffset(mouth.x, mouth.y, nucleusPos.x, nucleusPos.y, world);
  return off.dist < mouth.r + nucleusPos.r + bonus;
}

export function mouthTouchesPoint(mouth, x, y, radius, world, bonus = 0) {
  const off = wrappedOffset(mouth.x, mouth.y, x, y, world);
  return off.dist < mouth.r + radius + bonus;
}

export function updatePlayer(player, input, dt) {
  if (player.boostCooldown > 0) player.boostCooldown -= dt;
  if (player.boostTimer > 0) player.boostTimer -= dt;
  if (player.invuln > 0) player.invuln -= dt;

  if (input.boostPressed && player.boostTimer <= 0 && player.boostCooldown <= 0) {
    player.boostTimer = PLAYER.boostDuration;
    player.boostCooldown = PLAYER.boostCooldown;
  }

  const boosting = player.boostTimer > 0;
  const speed = boosting ? PLAYER.boostSpeed : PLAYER.baseSpeed;

  if (input.moving) {
    const targetAngle = Math.atan2(input.dirY, input.dirX);
    let delta = targetAngle - player.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    player.angle += delta * clamp(PLAYER.turnRate * dt, 0, 1);

    const mag = clamp(Math.hypot(input.dirX, input.dirY), 0, 1);
    player.vx = Math.cos(player.angle) * speed * mag;
    player.vy = Math.sin(player.angle) * speed * mag;
  } else {
    player.vx *= Math.pow(0.04, dt);
    player.vy *= Math.pow(0.04, dt);
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.pulse += dt * (boosting ? 4.2 : 2.2);
  syncSegments(player);
}

function steerCreature(creature, tx, ty, dt, speedMul = 1) {
  const dir = normalize(tx, ty);
  const targetAngle = Math.atan2(dir.y, dir.x);
  let delta = targetAngle - creature.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  creature.angle += delta * clamp((creature.kind === "boss" ? 3.2 : 2.6) * dt, 0, 1);

  const base = creature.kind === "boss" ? 78 : 62;
  const speed = (base + Math.min(40, creature.radius * 0.25)) * speedMul;
  creature.vx = Math.cos(creature.angle) * speed;
  creature.vy = Math.sin(creature.angle) * speed;
  creature.x += creature.vx * dt;
  creature.y += creature.vy * dt;
  creature.pulse += dt * 2;
  syncSegments(creature);
}

function updateBoss(creature, player, dt, world, proteins = []) {
  const toPlayer = wrappedOffset(creature.x, creature.y, player.x, player.y, world);
  const toHome = wrappedOffset(creature.x, creature.y, creature.homeX, creature.homeY, world);
  const playerToHome = wrappedOffset(
    creature.homeX,
    creature.homeY,
    player.x,
    player.y,
    world
  );

  const inTerritory = playerToHome.dist <= creature.territoryRadius;
  const beyondLeash = toHome.dist > BOSS_AI.leashRadius;

  if (creature.aiState === "chase") {
    if (!inTerritory || beyondLeash) {
      creature.aiState = "return";
    }
  } else if (creature.aiState === "return") {
    if (toHome.dist < creature.territoryRadius * 0.35) {
      creature.aiState = "patrol";
    }
  } else if (inTerritory && toPlayer.dist < BOSS_AI.aggroRadius) {
    creature.aiState = "chase";
  }

  let tx;
  let ty;
  let speedMul = 1;

  if (creature.aiState === "chase") {
    tx = toPlayer.dx;
    ty = toPlayer.dy;
    speedMul = 1.05;
  } else if (creature.aiState === "return") {
    tx = toHome.dx;
    ty = toHome.dy;
    speedMul = BOSS_AI.returnSpeed;
  } else {
    // 领地内巡逻 / 觅食
    let nearest = null;
    let nearestDist = 220;
    for (const p of proteins) {
      const off = wrappedOffset(creature.x, creature.y, p.x, p.y, world);
      const fromHome = wrappedOffset(creature.homeX, creature.homeY, p.x, p.y, world);
      if (fromHome.dist > creature.territoryRadius) continue;
      if (off.dist < nearestDist) {
        nearestDist = off.dist;
        nearest = off;
      }
    }
    if (nearest) {
      tx = nearest.dx;
      ty = nearest.dy;
      speedMul = 0.85;
    } else {
      creature.wanderTimer -= dt;
      if (creature.wanderTimer <= 0) {
        creature.wanderTimer = 0.8 + Math.random() * 1.4;
        const a = Math.random() * Math.PI * 2;
        const dist = creature.territoryRadius * (0.25 + Math.random() * 0.45);
        creature.patrolTargetX = creature.homeX + Math.cos(a) * dist;
        creature.patrolTargetY = creature.homeY + Math.sin(a) * dist;
      }
      const toPatrol = wrappedOffset(
        creature.x,
        creature.y,
        creature.patrolTargetX ?? creature.homeX,
        creature.patrolTargetY ?? creature.homeY,
        world
      );
      tx = toPatrol.dx;
      ty = toPatrol.dy;
      speedMul = 0.72;
    }
  }

  steerCreature(creature, tx, ty, dt, speedMul);
  wrapEntity(creature, world);
}

function seekProtein(creature, proteins, world, maxDist = 260) {
  let nearest = null;
  let nearestDist = maxDist;
  for (const p of proteins) {
    const off = wrappedOffset(creature.x, creature.y, p.x, p.y, world);
    if (off.dist < nearestDist) {
      nearestDist = off.dist;
      nearest = off;
    }
  }
  return nearest;
}

export function updateEnemy(creature, player, dt, world, proteins = []) {
  if (creature.kind === "boss") {
    updateBoss(creature, player, dt, world, proteins);
    return;
  }

  if (creature.provokeFlash > 0) creature.provokeFlash -= dt;

  creature.wanderTimer -= dt;
  if (creature.wanderTimer <= 0) {
    creature.wanderTimer = 0.5 + Math.random() * 1.2;
    creature.wanderAngle += (Math.random() - 0.5) * 2;
  }

  let tx = Math.cos(creature.wanderAngle);
  let ty = Math.sin(creature.wanderAngle);
  let speedMul = 1;

  const toPlayer = wrappedOffset(creature.x, creature.y, player.x, player.y, world);
  const aggressive = isAggressive(creature);

  if (aggressive) {
    const chaseRange = 320;
    if (toPlayer.dist < chaseRange) {
      const n = normalize(toPlayer.dx, toPlayer.dy);
      tx = n.x * creature.aggro + tx * 0.2;
      ty = n.y * creature.aggro + ty * 0.2;
      speedMul = 1.08;
    } else {
      const food = seekProtein(creature, proteins, world);
      if (food) {
        tx = food.dx * 1.1 + tx * 0.25;
        ty = food.dy * 1.1 + ty * 0.25;
      }
    }
  } else {
    // 被动 / 未激怒：躲避玩家，专心觅食
    const fleeRange = creature.temper === TEMPER.PASSIVE ? 240 : 200;
    if (toPlayer.dist < fleeRange) {
      const n = normalize(toPlayer.dx, toPlayer.dy);
      tx = -n.x * 1.35 + tx * 0.15;
      ty = -n.y * 1.35 + ty * 0.15;
      speedMul = 1.05;
    } else {
      const food = seekProtein(creature, proteins, world, 300);
      if (food) {
        tx = food.dx * 1.15 + tx * 0.2;
        ty = food.dy * 1.15 + ty * 0.2;
      }
    }
  }

  steerCreature(creature, tx, ty, dt, speedMul);
  wrapEntity(creature, world);
}

export function updateGhost(ghost, dt, world) {
  ghost.driftAngle += dt * 0.35;
  ghost.x += Math.cos(ghost.driftAngle) * ghost.drift * dt;
  ghost.y += Math.sin(ghost.driftAngle * 0.8) * ghost.drift * 0.7 * dt;
  wrapEntity(ghost, world);
  ghost.angle += dt * 0.4;
  ghost.pulse += dt * 1.4;
}
