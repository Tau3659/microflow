import { EVOLUTIONS, MORPH, PLAYER } from "./config.js";

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

function makeNuclei(count, radius) {
  if (count <= 1) {
    return [{ ox: 0, oy: 0, alive: true, r: radius * PLAYER.nucleusRadiusFactor }];
  }
  const nuclei = [];
  for (let i = 0; i < count; i += 1) {
    const a = (Math.PI * 2 * i) / count - Math.PI / 2;
    const dist = radius * (0.38 + (i % 2) * 0.08);
    nuclei.push({
      ox: Math.cos(a) * dist,
      oy: Math.sin(a) * dist,
      alive: true,
      r: radius * PLAYER.nucleusRadiusFactor * 0.85,
    });
  }
  return nuclei;
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
    segments,
    nuclei: makeNuclei(evo.nuclei, evo.radius),
    pulse: 0,
    boostTimer: 0,
    boostCooldown: 0,
    invuln: 0,
    alive: true,
  };
}

export function applyEvolution(player, evolutionId) {
  const evo = EVOLUTIONS[evolutionId];
  player.evolutionId = evolutionId;
  player.radius = evo.radius;
  Object.assign(player, visualFromEvo(evo));
  player.nuclei = makeNuclei(evo.nuclei, evo.radius);
  while (player.segments.length < evo.segmentCount) {
    const last = player.segments[player.segments.length - 1];
    player.segments.push({ x: last.x, y: last.y });
  }
  while (player.segments.length > evo.segmentCount) player.segments.pop();
  player.invuln = 1.2;
}

export function createNormal(x, y, layer, evolutionFloor = 0) {
  const tier = clamp(evolutionFloor + Math.floor(Math.random() * 2), 0, EVOLUTIONS.length - 1);
  const evo = EVOLUTIONS[tier];
  const morph = pick(layer.morphPool || [evo.morph]);
  const radius = evo.radius * (0.75 + Math.random() * 0.45);
  const segments = [];
  const count = Math.max(3, evo.segmentCount - 1);
  for (let i = 0; i < count; i += 1) {
    segments.push({ x: x - i * 8, y });
  }
  return {
    id: nextId++,
    kind: "normal",
    x,
    y,
    vx: 0,
    vy: 0,
    angle: Math.random() * Math.PI * 2,
    radius,
    morph,
    color: layer.accent,
    coreColor: "#e8f4f2",
    membrane: layer.bgTop,
    flagella: morph === MORPH.BACILLUS || morph === MORPH.SPIRILLUM ? 1 + Math.floor(Math.random() * 2) : 0,
    spikes: morph === MORPH.VIRUS ? 8 + Math.floor(Math.random() * 4) : 0,
    colonyCells: morph === MORPH.COLONY ? 4 + Math.floor(Math.random() * 4) : 0,
    cilia: morph === MORPH.COCCUS && Math.random() < 0.35,
    segments,
    nuclei: makeNuclei(1, radius),
    pulse: Math.random() * 10,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    aggro: 0.35 + Math.random() * 0.35,
    alive: true,
    dropProtein: 2 + Math.floor(Math.random() * 3),
    dropDna: Math.random() < 0.45 ? 1 : 0,
  };
}

export function createBoss(x, y, layer) {
  const b = layer.boss;
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
    vx: 0,
    vy: 0,
    angle: 0,
    radius: b.radius,
    morph: b.morph || MORPH.BACILLUS,
    color: b.color,
    coreColor: "#ffe0dc",
    membrane: b.membrane || "#4a2020",
    flagella: b.flagella || 0,
    spikes: b.spikes || 0,
    colonyCells: b.colonyCells || 0,
    cilia: !!b.cilia,
    segments,
    nuclei: makeNuclei(b.nuclei, b.radius),
    pulse: 0,
    wanderAngle: 0,
    wanderTimer: 0,
    aggro: 1,
    alive: true,
    dropProtein: 10 + b.nuclei * 2,
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

export function updateEnemy(creature, player, dt, world) {
  creature.wanderTimer -= dt;
  if (creature.wanderTimer <= 0) {
    creature.wanderTimer = 0.5 + Math.random() * 1.2;
    creature.wanderAngle += (Math.random() - 0.5) * 2;
  }

  let tx = Math.cos(creature.wanderAngle);
  let ty = Math.sin(creature.wanderAngle);

  const toPlayerX = player.x - creature.x;
  const toPlayerY = player.y - creature.y;
  const dist = length(toPlayerX, toPlayerY);
  const chaseRange = creature.kind === "boss" ? 620 : 280;

  if (dist < chaseRange) {
    const n = normalize(toPlayerX, toPlayerY);
    const weight = creature.kind === "boss" ? 1.8 : creature.aggro;
    if (creature.kind === "normal" && player.radius > creature.radius * 1.25) {
      tx = -n.x * 1.2 + tx * 0.3;
      ty = -n.y * 1.2 + ty * 0.3;
    } else {
      tx = n.x * weight + tx * 0.25;
      ty = n.y * weight + ty * 0.25;
    }
  }

  const dir = normalize(tx, ty);
  const targetAngle = Math.atan2(dir.y, dir.x);
  let delta = targetAngle - creature.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  creature.angle += delta * clamp((creature.kind === "boss" ? 3.2 : 2.6) * dt, 0, 1);

  const base = creature.kind === "boss" ? 78 : 62;
  const speed = base + Math.min(40, creature.radius * 0.25);
  creature.vx = Math.cos(creature.angle) * speed;
  creature.vy = Math.sin(creature.angle) * speed;
  creature.x = clamp(creature.x + creature.vx * dt, 50, world.width - 50);
  creature.y = clamp(creature.y + creature.vy * dt, 50, world.height - 50);
  creature.pulse += dt * 2;
  syncSegments(creature);
}

export function updateGhost(ghost, dt, world) {
  ghost.driftAngle += dt * 0.35;
  ghost.x += Math.cos(ghost.driftAngle) * ghost.drift * dt;
  ghost.y += Math.sin(ghost.driftAngle * 0.8) * ghost.drift * 0.7 * dt;
  if (world) {
    if (ghost.x < -40) ghost.x = world.width + 40;
    if (ghost.x > world.width + 40) ghost.x = -40;
    if (ghost.y < -40) ghost.y = world.height + 40;
    if (ghost.y > world.height + 40) ghost.y = -40;
  }
  ghost.angle += dt * 0.4;
  ghost.pulse += dt * 1.4;
}
