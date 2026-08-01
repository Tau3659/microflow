import { PLAYER } from "./config.js";

let nextId = 1;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function length(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const len = length(x, y) || 1;
  return { x: x / len, y: y / len };
}

export function massToRadius(mass) {
  return 7 + Math.sqrt(mass) * 6.2;
}

export function createCreature({
  x,
  y,
  mass,
  hue,
  isPlayer = false,
  isPredator = false,
  depthAccent = "#3ecfb0",
}) {
  const radius = massToRadius(mass);
  const segments = [];
  const segmentCount = Math.max(4, Math.floor(3 + mass * 1.6));
  for (let i = 0; i < segmentCount; i += 1) {
    segments.push({ x: x - i * PLAYER.segmentSpacing * 0.4, y });
  }

  return {
    id: nextId++,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    mass,
    radius,
    hue,
    isPlayer,
    isPredator,
    depthAccent,
    segments,
    pulse: Math.random() * Math.PI * 2,
    hurtTimer: 0,
    alive: true,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0,
  };
}

export function syncSegments(creature) {
  const targetCount = Math.max(4, Math.floor(3 + creature.mass * 1.6));
  while (creature.segments.length < targetCount) {
    const last = creature.segments[creature.segments.length - 1] || {
      x: creature.x,
      y: creature.y,
    };
    creature.segments.push({ x: last.x, y: last.y });
  }
  while (creature.segments.length > targetCount) {
    creature.segments.pop();
  }

  creature.segments[0].x = creature.x;
  creature.segments[0].y = creature.y;

  const spacing = PLAYER.segmentSpacing * (0.85 + Math.min(creature.mass, 20) * 0.015);
  for (let i = 1; i < creature.segments.length; i += 1) {
    const prev = creature.segments[i - 1];
    const curr = creature.segments[i];
    const dx = prev.x - curr.x;
    const dy = prev.y - curr.y;
    const dist = length(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    curr.x = prev.x - nx * spacing;
    curr.y = prev.y - ny * spacing;
  }
}

export function grow(creature, amount) {
  creature.mass += amount;
  creature.radius = massToRadius(creature.mass);
  syncSegments(creature);
}

export function shrink(creature, amount) {
  creature.mass = Math.max(0.8, creature.mass - amount);
  creature.radius = massToRadius(creature.mass);
  syncSegments(creature);
  creature.hurtTimer = PLAYER.damageCooldown;
}

export function updatePlayer(creature, input, camera, dt) {
  if (!input.active) {
    creature.vx *= Math.pow(0.08, dt);
    creature.vy *= Math.pow(0.08, dt);
    creature.x += creature.vx * dt;
    creature.y += creature.vy * dt;
    creature.pulse += dt * 2.2;
    syncSegments(creature);
    return;
  }

  const worldX = camera.x + input.x;
  const worldY = camera.y + input.y;
  const dx = worldX - creature.x;
  const dy = worldY - creature.y;
  const dist = length(dx, dy);
  const dir = normalize(dx, dy);
  const targetAngle = Math.atan2(dir.y, dir.x);

  let delta = targetAngle - creature.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  creature.angle += delta * clamp(PLAYER.turnRate * dt, 0, 1);

  const speedFactor = clamp(dist / 140, 0.25, 1);
  const speed =
    (dist > 60 ? PLAYER.boostSpeed : PLAYER.baseSpeed) *
    speedFactor *
    (1 / (1 + creature.mass * 0.03));

  creature.vx = Math.cos(creature.angle) * speed;
  creature.vy = Math.sin(creature.angle) * speed;
  creature.x += creature.vx * dt;
  creature.y += creature.vy * dt;
  creature.pulse += dt * (2.6 + speedFactor);
  if (creature.hurtTimer > 0) creature.hurtTimer -= dt;
  syncSegments(creature);
}

export function updateNpc(creature, player, foods, dt, world) {
  creature.wanderTimer -= dt;
  if (creature.wanderTimer <= 0) {
    creature.wanderTimer = 0.6 + Math.random() * 1.4;
    creature.wanderAngle += (Math.random() - 0.5) * 1.8;
  }

  let tx = Math.cos(creature.wanderAngle);
  let ty = Math.sin(creature.wanderAngle);

  const toPlayerX = player.x - creature.x;
  const toPlayerY = player.y - creature.y;
  const distPlayer = length(toPlayerX, toPlayerY);

  if (creature.isPredator || creature.mass > player.mass * 1.15) {
    if (distPlayer < 420) {
      const n = normalize(toPlayerX, toPlayerY);
      tx = n.x * 1.4 + tx * 0.2;
      ty = n.y * 1.4 + ty * 0.2;
    }
  } else if (distPlayer < 220 && player.mass > creature.mass * 1.1) {
    const n = normalize(toPlayerX, toPlayerY);
    tx = -n.x * 1.5 + tx * 0.2;
    ty = -n.y * 1.5 + ty * 0.2;
  } else {
    let nearest = null;
    let nearestDist = 220;
    for (const food of foods) {
      const d = length(food.x - creature.x, food.y - creature.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = food;
      }
    }
    if (nearest) {
      const n = normalize(nearest.x - creature.x, nearest.y - creature.y);
      tx = n.x + tx * 0.35;
      ty = n.y + ty * 0.35;
    }
  }

  const dir = normalize(tx, ty);
  const targetAngle = Math.atan2(dir.y, dir.x);
  let delta = targetAngle - creature.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  creature.angle += delta * clamp(3.8 * dt, 0, 1);

  const speed = (70 + Math.min(creature.mass, 16) * 4) * (creature.isPredator ? 1.15 : 1);
  creature.vx = Math.cos(creature.angle) * speed;
  creature.vy = Math.sin(creature.angle) * speed;
  creature.x += creature.vx * dt;
  creature.y += creature.vy * dt;

  creature.x = clamp(creature.x, 40, world.width - 40);
  creature.y = clamp(creature.y, 40, world.height - 40);

  creature.pulse += dt * 2.1;
  if (creature.hurtTimer > 0) creature.hurtTimer -= dt;
  syncSegments(creature);
}
