import { DEPTHS, WORLD, PLAYER } from "./config.js";
import { createCreature } from "./creature.js";

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pickAwayFrom(cx, cy, minDist) {
  for (let i = 0; i < 20; i += 1) {
    const x = rand(80, WORLD.width - 80);
    const y = rand(80, WORLD.height - 80);
    if (Math.hypot(x - cx, y - cy) >= minDist) return { x, y };
  }
  return { x: rand(80, WORLD.width - 80), y: rand(80, WORLD.height - 80) };
}

export function createFood(depth, x, y) {
  return {
    x: x ?? rand(40, WORLD.width - 40),
    y: y ?? rand(40, WORLD.height - 40),
    r: rand(2.2, 4.2),
    phase: rand(0, Math.PI * 2),
    color: depth.particle,
  };
}

export function createPortal(depthIndex) {
  if (depthIndex >= DEPTHS.length - 1) return null;
  return {
    x: WORLD.width * 0.5 + rand(-180, 180),
    y: WORLD.height * 0.78 + rand(-80, 80),
    r: 38,
    open: false,
    pulse: 0,
  };
}

export function createLevel(depthIndex, playerMass = PLAYER.startMass) {
  const depth = DEPTHS[depthIndex];
  const spawn = { x: WORLD.width * 0.5, y: WORLD.height * 0.35 };
  const player = createCreature({
    x: spawn.x,
    y: spawn.y,
    mass: playerMass,
    hue: depth.accent,
    isPlayer: true,
    depthAccent: depth.accent,
  });

  const foods = Array.from({ length: depth.foodCount }, () => createFood(depth));
  const creatures = [];

  for (let i = 0; i < depth.creatureCount; i += 1) {
    const pos = pickAwayFrom(player.x, player.y, 180);
    const isPredator = Math.random() < depth.predatorChance;
    const mass = isPredator
      ? rand(Math.max(playerMass * 1.2, 2.5), depth.maxCreatureMass)
      : rand(0.6, Math.min(depth.maxCreatureMass * 0.55, Math.max(1.2, playerMass * 0.95)));

    creatures.push(
      createCreature({
        x: pos.x,
        y: pos.y,
        mass,
        hue: isPredator ? "#e07a6a" : depth.accent,
        isPredator,
        depthAccent: depth.accent,
      })
    );
  }

  return {
    depthIndex,
    depth,
    player,
    foods,
    creatures,
    particles: [],
    portal: createPortal(depthIndex),
    world: { ...WORLD },
  };
}

export function spawnFoodNear(level, x, y, count = 3) {
  for (let i = 0; i < count; i += 1) {
    level.foods.push(
      createFood(level.depth, x + rand(-24, 24), y + rand(-24, 24))
    );
  }
}

export function spawnBurst(level, x, y, color, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, Math.PI * 2);
    const s = rand(30, 140);
    level.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.35, 0.8),
      maxLife: 0.8,
      r: rand(1.5, 3.5),
      color,
    });
  }
}

export function maintainPopulation(level) {
  const { depth, player, creatures, foods } = level;
  while (foods.length < depth.foodCount) {
    foods.push(createFood(depth));
  }

  while (creatures.length < depth.creatureCount) {
    const pos = pickAwayFrom(player.x, player.y, 260);
    const isPredator = Math.random() < depth.predatorChance * 0.7;
    const mass = isPredator
      ? rand(player.mass * 1.1, depth.maxCreatureMass)
      : rand(0.7, Math.max(1, player.mass * 0.85));
    creatures.push(
      createCreature({
        x: pos.x,
        y: pos.y,
        mass,
        hue: isPredator ? "#e07a6a" : depth.accent,
        isPredator,
        depthAccent: depth.accent,
      })
    );
  }
}

export function canDescend(level) {
  return level.player.mass >= level.depth.descendAt && level.portal;
}
