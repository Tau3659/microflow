import {
  BOSS_AI,
  getEvolution,
  MORPH,
  PLAYER,
  PLAYER_LOOK,
  PROVOKE,
  SCALE,
  SPECIES,
  TEMPER,
  WARNING,
  WORLD,
} from "./config.js";
import {
  applyAbilitiesToNewPlayer,
  applySkillLevel,
  bindMouthSync,
  recomputeAbilityMods,
} from "./abilities.js";

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

/** 细胞核分散在体内不同位置；核半径随体半径等比放大，同级相对比例不变 */
function makeNuclei(count, radius, morph = MORPH.COCCUS) {
  // 多核时略缩小，但仍保持清晰可见
  const baseR = radius * PLAYER.nucleusRadiusFactor * (count <= 1 ? 1 : count <= 2 ? 0.92 : count <= 4 ? 0.82 : 0.74);
  // 核间距拉开，避免一张嘴扫到多个
  const minSep = Math.max(baseR * 2.35, radius * (count <= 2 ? 0.7 : count <= 3 ? 0.58 : 0.48));
  const maxR = radius * 0.86;
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

/**
 * 嘴位规则：
 * - 圆形（球菌/病毒/团簇感）：单嘴居中，多嘴均匀散布
 * - 条形（杆菌/螺旋菌）：单嘴在一端，双嘴在两端
 * - 噬菌体：注射端（条形一端）
 */
function makeMouths(morph, radius, count = 1) {
  const n = Math.max(1, count | 0);
  const baseR = Math.max(3.5, radius * PLAYER.mouthRadiusFactor * (n > 1 ? 0.82 : 1));
  const mouths = [];

  if (morph === MORPH.BACILLUS || morph === MORPH.SPIRILLUM) {
    const tip = morph === MORPH.SPIRILLUM ? 1.08 : 1.12;
    if (n === 1) {
      mouths.push({ mouthAngle: 0, mouthDist: tip, mouthRadius: baseR });
    } else {
      // 两端
      mouths.push({ mouthAngle: 0, mouthDist: tip, mouthRadius: baseR });
      mouths.push({ mouthAngle: Math.PI, mouthDist: tip, mouthRadius: baseR * 0.92 });
      for (let i = 2; i < n; i += 1) {
        const a = (Math.PI * 2 * (i - 2)) / Math.max(1, n - 2);
        mouths.push({ mouthAngle: a, mouthDist: tip * 0.7, mouthRadius: baseR * 0.8 });
      }
    }
  } else if (morph === MORPH.PHAGE) {
    // 条形结构：注射端为一端；多嘴时两端 + 侧口
    mouths.push({ mouthAngle: Math.PI / 2, mouthDist: 1.05, mouthRadius: baseR });
    if (n >= 2) {
      mouths.push({ mouthAngle: -Math.PI / 2, mouthDist: 0.85, mouthRadius: baseR * 0.85 });
    }
    for (let i = 2; i < n; i += 1) {
      const a = (Math.PI * 2 * (i - 2)) / Math.max(1, n - 1) + Math.PI / 4;
      mouths.push({ mouthAngle: a, mouthDist: 0.78, mouthRadius: baseR * 0.75 });
    }
  } else if (morph === MORPH.COCCUS || morph === MORPH.VIRUS || morph === MORPH.COLONY) {
    if (n === 1) {
      // 圆形：嘴在体心
      mouths.push({ mouthAngle: 0, mouthDist: 0.02, mouthRadius: baseR });
    } else {
      // 均匀散布
      const ring = morph === MORPH.COLONY ? 0.78 : morph === MORPH.VIRUS ? 0.72 : 0.55;
      for (let i = 0; i < n; i += 1) {
        const a = (Math.PI * 2 * i) / n;
        mouths.push({ mouthAngle: a, mouthDist: ring, mouthRadius: baseR * 0.92 });
      }
    }
  } else {
    if (n === 1) {
      mouths.push({ mouthAngle: 0, mouthDist: 0.02, mouthRadius: baseR });
    } else {
      for (let i = 0; i < n; i += 1) {
        mouths.push({
          mouthAngle: (Math.PI * 2 * i) / n,
          mouthDist: 0.6,
          mouthRadius: baseR,
        });
      }
    }
  }

  return {
    mouths,
    mouthAngle: mouths[0].mouthAngle,
    mouthDist: mouths[0].mouthDist,
    mouthRadius: mouths[0].mouthRadius,
  };
}

export function mouthBundle(morph, radius, count = 1) {
  return makeMouths(morph, radius, count);
}

/** 按形态 + 裂口技能刷新玩家嘴数量与位置 */
export function syncPlayerMouth(player) {
  const scale = player.mods?.mouthScale || 1;
  const extra = player.mods?.extraMouths ?? player.abilities?.polyMouth ?? 0;
  const count = Math.max(1, 1 + (extra | 0));
  const bundle = mouthBundle(player.morph, player.radius, count);
  player.mouths = bundle.mouths.map((m) => ({
    ...m,
    mouthRadius: Math.max(3.5, m.mouthRadius * scale),
  }));
  player.mouthAngle = player.mouths[0].mouthAngle;
  player.mouthDist = player.mouths[0].mouthDist;
  player.mouthRadius = player.mouths[0].mouthRadius;
}

bindMouthSync(syncPlayerMouth);

/** 体型越大速度越慢 */
export function speedScaleForRadius(radius) {
  const ref = PLAYER.speedRefRadius || 18;
  return clamp(ref / Math.max(8, radius), PLAYER.minSpeedScale || 0.48, PLAYER.maxSpeedScale || 1.15);
}

function bodyProteinFor(radius, kind = "normal", complexity = 1) {
  if (kind === "boss") return Math.max(8, 5 + Math.round(complexity * 0.9));
  if (kind === "player") return Math.max(2, Math.round(complexity + 1));
  return Math.max(1, Math.round(1.5 + complexity * 0.7 + radius / 40));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpHex(a, b, t) {
  const pa = parseInt(String(a).replace("#", ""), 16);
  const pb = parseInt(String(b).replace("#", ""), 16);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return t < 0.5 ? a : b;
  const ar = (pa >> 16) & 255;
  const ag = (pa >> 8) & 255;
  const ab = pa & 255;
  const br = (pb >> 16) & 255;
  const bg = (pb >> 8) & 255;
  const bb = pb & 255;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function snapshotVisual(creature) {
  return {
    morph: creature.morph,
    color: creature.color,
    coreColor: creature.coreColor,
    membrane: creature.membrane,
    complexity: creature.complexity || 1,
    flagella: creature.flagella || 0,
    spikes: creature.spikes || 0,
    colonyCells: creature.colonyCells || 0,
    cilia: !!creature.cilia,
    organelles: creature.organelles || 0,
    membraneLayers: creature.membraneLayers || 1,
    vacuoles: creature.vacuoles || 0,
    cellBridges: !!creature.cellBridges,
    capsidFacets: creature.capsidFacets || 0,
  };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function visualFromEvo(evo, { playerColors = false } = {}) {
  const look = playerColors ? PLAYER_LOOK : evo;
  return {
    morph: evo.morph,
    color: look.color,
    coreColor: look.coreColor,
    membrane: look.membrane,
    complexity: evo.complexity || 1,
    flagella: evo.flagella || 0,
    spikes: evo.spikes || 0,
    colonyCells: evo.colonyCells || 0,
    cilia: !!evo.cilia,
    organelles: evo.organelles || 0,
    membraneLayers: evo.membraneLayers || 1,
    vacuoles: evo.vacuoles || 0,
    cellBridges: !!evo.cellBridges,
    capsidFacets: evo.capsidFacets || 0,
    legs: evo.legs || 0,
  };
}

function applyPlayerPalette(target) {
  target.color = PLAYER_LOOK.color;
  target.coreColor = PLAYER_LOOK.coreColor;
  target.membrane = PLAYER_LOOK.membrane;
  return target;
}

export function createPlayer(x, y, evolutionId = 0, savedAbilities = null) {
  const evo = getEvolution(evolutionId);
  const spacing = Math.max(PLAYER.segmentSpacing * 0.5, evo.radius * 0.32);
  const segments = [];
  for (let i = 0; i < evo.segmentCount; i += 1) {
    segments.push({ x: x - i * spacing, y });
  }
  const mouth = mouthBundle(evo.morph, evo.radius, evo.mouths || 1);
  const player = {
    id: nextId++,
    kind: "player",
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    evolutionId,
    radius: evo.radius,
    ...visualFromEvo(evo, { playerColors: true }),
    legs: evo.legs || 0,
    ...mouth,
    segments,
    nuclei: makeNuclei(evo.nuclei, evo.radius, evo.morph),
    pulse: 0,
    /** 0..1 加速能量：按住消耗，松手或耗尽后回复 */
    boostCharge: 1,
    boostLocked: false,
    boosting: false,
    invuln: 0,
    recoverProgress: 0,
    storedProtein: 0,
    bodyProtein: bodyProteinFor(evo.radius, "player", evo.complexity || 1),
    evolutionTween: null,
    morphMix: 0,
    abilities: null,
    mods: null,
    capsule: 0,
    alive: true,
  };
  applyAbilitiesToNewPlayer(player, savedAbilities);
  syncPlayerMouth(player);
  return player;
}

/** 立即定格到目标进化（过渡结束时调用） */
export function applyEvolution(player, evolutionId) {
  const evo = getEvolution(evolutionId);
  player.evolutionId = evolutionId;
  player.radius = evo.radius;
  Object.assign(player, visualFromEvo(evo, { playerColors: true }));
  player.legs = evo.legs || 0;
  applyPlayerPalette(player);
  player.nuclei = makeNuclei(evo.nuclei, evo.radius, evo.morph);
  recomputeAbilityMods(player);
  syncPlayerMouth(player);
  player.bodyProtein = bodyProteinFor(evo.radius, "player", evo.complexity || 1);
  player.recoverProgress = 0;
  player.evolutionTween = null;
  player.morphMix = 1;
  player.renderFrom = null;
  player.renderTo = null;
  while (player.segments.length < evo.segmentCount) {
    const last = player.segments[player.segments.length - 1];
    player.segments.push({ x: last.x, y: last.y });
  }
  while (player.segments.length > evo.segmentCount) player.segments.pop();
  player.invuln = Math.max(player.invuln, 0.8);
}

/** 开始渐进进化：先长大，再逐渐变成新结构 */
export function beginEvolution(player, evolutionId) {
  const to = getEvolution(evolutionId);
  if (!to) return;
  applyPlayerPalette(player);
  const fromVisual = applyPlayerPalette(snapshotVisual(player));
  const toVisual = applyPlayerPalette(visualFromEvo(to, { playerColors: true }));
  const mouthCount = Math.max(
    1,
    (to.mouths || 1) + (player.abilities?.polyMouth || 0)
  );
  player.evolutionTween = {
    fromId: player.evolutionId,
    toId: evolutionId,
    t: 0,
    duration: PLAYER.evolveDuration || 2.35,
    fromRadius: player.radius,
    toRadius: to.radius,
    fromVisual,
    toVisual,
    fromMouths: (player.mouths || []).map((m) => ({ ...m })),
    toMouths: mouthBundle(to.morph, to.radius, mouthCount).mouths,
    targetNuclei: to.nuclei,
    targetSegments: to.segmentCount,
  };
  player.evolutionId = evolutionId;
  player.invuln = Math.max(player.invuln, PLAYER.evolveDuration || 2.35);
  player.renderFrom = fromVisual;
  player.renderTo = toVisual;
  player.morphMix = 0;
}

export function updateEvolution(player, dt) {
  const tw = player.evolutionTween;
  if (!tw) return false;
  tw.t += dt / tw.duration;
  const u = clamp(tw.t, 0, 1);
  const grow = clamp(u / 0.55, 0, 1);
  const morph = clamp((u - 0.28) / 0.55, 0, 1);
  const sGrow = grow * grow * (3 - 2 * grow);
  const sMorph = morph * morph * (3 - 2 * morph);

  player.radius = lerp(tw.fromRadius, tw.toRadius, sGrow);
  player.morphMix = sMorph;

  // 玩家颜色始终不变；仅结构参数渐变
  applyPlayerPalette(player);
  player.complexity = Math.round(lerp(tw.fromVisual.complexity, tw.toVisual.complexity, sMorph));
  player.flagella = Math.round(lerp(tw.fromVisual.flagella, tw.toVisual.flagella, sMorph));
  player.spikes = Math.round(lerp(tw.fromVisual.spikes, tw.toVisual.spikes, sMorph));
  player.colonyCells = Math.round(lerp(tw.fromVisual.colonyCells, tw.toVisual.colonyCells, sMorph));
  player.organelles = Math.round(lerp(tw.fromVisual.organelles, tw.toVisual.organelles, sMorph));
  player.vacuoles = Math.round(lerp(tw.fromVisual.vacuoles, tw.toVisual.vacuoles, sMorph));
  player.membraneLayers = Math.round(
    lerp(tw.fromVisual.membraneLayers, tw.toVisual.membraneLayers, sMorph)
  );
  player.cilia = sMorph < 0.5 ? tw.fromVisual.cilia : tw.toVisual.cilia;
  player.cellBridges = sMorph < 0.5 ? tw.fromVisual.cellBridges : tw.toVisual.cellBridges;
  player.capsidFacets = Math.round(
    lerp(tw.fromVisual.capsidFacets || 0, tw.toVisual.capsidFacets || 0, sMorph)
  );
  player.legs = Math.round(lerp(tw.fromVisual.legs || 0, tw.toVisual.legs || 0, sMorph));
  player.morph = sMorph < 0.42 ? tw.fromVisual.morph : tw.toVisual.morph;

  // 多嘴过渡：数量向目标靠拢并插值
  const mouthScale = player.mods?.mouthScale || 1;
  const mouthCount = Math.max(tw.fromMouths.length, tw.toMouths.length, 1);
  player.mouths = [];
  for (let i = 0; i < mouthCount; i += 1) {
    const a =
      tw.fromMouths[i] ||
      tw.fromMouths[0] || { mouthAngle: 0, mouthDist: 1, mouthRadius: 6 };
    const b = tw.toMouths[i] || tw.toMouths[tw.toMouths.length - 1] || a;
    player.mouths.push({
      mouthAngle: lerp(a.mouthAngle, b.mouthAngle, sMorph),
      mouthDist: lerp(a.mouthDist, b.mouthDist, sMorph),
      mouthRadius: lerp(a.mouthRadius, b.mouthRadius, sGrow) * mouthScale,
    });
  }
  player.mouthAngle = player.mouths[0].mouthAngle;
  player.mouthDist = player.mouths[0].mouthDist;
  player.mouthRadius = player.mouths[0].mouthRadius;

  // 细胞核随体型等比放大（相对过渡起点），后半段补齐数量
  if (!tw.baseNuclei) {
    tw.baseNuclei = player.nuclei.map((n) => ({
      ox: n.ox,
      oy: n.oy,
      alive: n.alive,
    }));
  }
  const scale = player.radius / Math.max(1, tw.fromRadius);
  for (let i = 0; i < player.nuclei.length; i += 1) {
    const base = tw.baseNuclei[i];
    if (!base) continue;
    player.nuclei[i].ox = base.ox * scale;
    player.nuclei[i].oy = base.oy * scale;
    player.nuclei[i].r =
      player.radius * PLAYER.nucleusRadiusFactor * (player.nuclei.length <= 2 ? 0.92 : 0.82);
  }
  if (sMorph > 0.55 && player.nuclei.length < tw.targetNuclei) {
    const fresh = makeNuclei(tw.targetNuclei, tw.toRadius, tw.toVisual.morph);
    while (player.nuclei.length < tw.targetNuclei) {
      const idx = player.nuclei.length;
      const next = fresh[idx];
      player.nuclei.push({
        ox: next.ox * scale,
        oy: next.oy * scale,
        alive: true,
        r: player.radius * PLAYER.nucleusRadiusFactor * 0.82,
      });
      tw.baseNuclei.push({ ox: next.ox, oy: next.oy, alive: true });
    }
  }

  while (player.segments.length < tw.targetSegments) {
    const last = player.segments[player.segments.length - 1];
    player.segments.push({ x: last.x, y: last.y });
  }

  if (u >= 1) {
    applyEvolution(player, tw.toId);
    return true;
  }
  return false;
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
  // 逃跑/恐慌期间不再视为可攻击
  if ((creature.panicTimer || 0) > 0) return false;
  if (creature.kind === "boss") return true;
  return !!creature.aggressive;
}

/** 等级低于玩家的普通 NPC 不会主动进攻（Boss 不受限） */
export function willAggressPlayer(creature, player) {
  if (!isAggressive(creature)) return false;
  if (creature.kind === "boss") return true;
  const npcLvl = creature.evolutionId ?? 0;
  const playerLvl = player?.evolutionId ?? 0;
  if (npcLvl < playerLvl) return false;
  return true;
}

/** 消退被激怒后的临时攻击性，恢复冷静配色 */
export function calmProvokedCreature(creature) {
  if (!creature || creature.kind === "boss") return;
  if (!creature.provoked) return;
  creature.aggressive = false;
  creature.warning = false;
  creature.provoked = false;
  creature.aggressionTimer = 0;
  if (creature.calmColor) {
    creature.color = creature.calmColor;
    creature.membrane = creature.calmMembrane;
    creature.coreColor = creature.calmCore;
  }
}

/** 被玩家攻击后，可激怒型转为攻击性并切换警告色（一段时间后消退） */
export function provokeCreature(creature) {
  if (!creature || creature.kind === "boss") return false;
  if (creature.temper === TEMPER.PASSIVE) return false;
  if (creature.temper !== TEMPER.SKITTISH && creature.temper !== TEMPER.HOSTILE) {
    return false;
  }
  // 已在攻击中：刷新计时
  if (creature.aggressive && creature.provoked) {
    creature.aggressionTimer =
      PROVOKE.durationMin +
      Math.random() * (PROVOKE.durationMax - PROVOKE.durationMin);
    creature.provokeFlash = 0.55;
    return true;
  }
  if (creature.aggressive && !creature.provoked) {
    // 固有敌对：被打后也进入有时限的激怒强化，超时回固有敌对色但保持攻击
    // 仅「被攻击后变得有攻击性」需要消退；固有 HOSTILE 保持攻击
    return false;
  }
  creature.aggressive = true;
  creature.warning = true;
  creature.provoked = true;
  creature.aggressionTimer =
    PROVOKE.durationMin +
    Math.random() * (PROVOKE.durationMax - PROVOKE.durationMin);
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
  const tier = Math.max(0, evolutionFloor + Math.floor(Math.random() * 2));
  const evo = getEvolution(tier);
  const speciesId = pick(layer.speciesPool || ["ecoli"]);
  const species = SPECIES[speciesId] || SPECIES.ecoli;
  const morph = species.morph || pick(layer.morphPool || [evo.morph]);
  // 屏幕比例固定：体半径几乎恒定，复杂度走结构
  const layerCx = layer.complexity || 1;
  const complexity = Math.min(14, (evo.complexity || 1) + Math.floor(layerCx / 2));
  const radius = SCALE.npc * (0.94 + Math.random() * 0.1);
  const temper = rollTemper(layer.temperWeights);
  const look = paletteForTemper(temper, layer);
  if (species.tint && temper !== TEMPER.HOSTILE) {
    look.color = species.tint;
  }
  const segments = [];
  const count = Math.min(14, Math.max(3, evo.segmentCount - 1 + Math.floor(layerCx / 3)));
  const spacing = Math.max(6, radius * 0.3);
  for (let i = 0; i < count; i += 1) {
    segments.push({ x: x - i * spacing, y });
  }
  const nucleusCount = Math.min(5, 1 + Math.floor(complexity / 3));
  const mouthCount = Math.min(3, 1 + Math.floor((complexity - 1) / 4));
  const baseFlagella =
    species.flagella ?? (morph === MORPH.BACILLUS || morph === MORPH.SPIRILLUM ? 1 : 0);
  const baseSpikes = species.spikes ?? (morph === MORPH.VIRUS ? 8 : 0);
  const baseColony = species.colonyCells ?? (morph === MORPH.COLONY ? 5 : 0);
  const layerId = layer.id || 0;
  // 深层攻击性 NPC 追击更紧
  const depthAggro =
    temper === TEMPER.HOSTILE
      ? Math.min(1.35, 0.85 + Math.random() * 0.2 + layerId * 0.03)
      : 0.4 + Math.random() * 0.3;
  return {
    id: nextId++,
    kind: "normal",
    temper,
    evolutionId: tier,
    species: speciesId,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: Math.random() * Math.PI * 2,
    radius,
    morph,
    complexity,
    color: look.color,
    coreColor: look.coreColor,
    membrane: look.membrane,
    aggressive: look.aggressive,
    warning: look.warning,
    flagella: Math.min(7, baseFlagella + Math.floor(layerCx / 4)),
    spikes: Math.min(22, baseSpikes + Math.floor(layerCx / 2)),
    colonyCells: Math.min(14, baseColony + Math.floor(layerCx / 3)),
    cilia: !!(species.cilia ?? (morph === MORPH.COCCUS && complexity >= 2)),
    organelles: Math.min(8, (evo.organelles || 0) + Math.floor(layerCx / 3)),
    membraneLayers: Math.min(3, (evo.membraneLayers || 1) + Math.floor(layerCx / 5)),
    vacuoles: Math.min(5, (evo.vacuoles || 0) + Math.floor(layerCx / 4)),
    cellBridges: !!(species.cellBridges ?? (morph === MORPH.COLONY && complexity >= 3)),
    capsidFacets: species.capsidFacets || evo.capsidFacets || 0,
    curve: species.curve || 0,
    aspect: species.aspect || 1,
    lobed: !!species.lobed,
    elongate: !!species.elongate,
    hollow: !!species.hollow,
    collar: !!species.collar,
    budding: !!species.budding,
    envelope: !!species.envelope,
    thin: !!species.thin,
    chain: !!species.chain,
    facets: species.facets || 0,
    legs: species.legs || 2,
    segments,
    nuclei: makeNuclei(nucleusCount, radius, morph),
    ...mouthBundle(morph, radius, mouthCount),
    pulse: Math.random() * 10,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    aggro: depthAggro,
    chaseRange: Math.min(480, 300 + layerId * 12),
    provokeFlash: 0,
    provoked: false,
    aggressionTimer: 0,
    curiousRate: temper === TEMPER.PASSIVE ? 0.34 : 0.22,
    mood: "idle",
    moodTimer: 0,
    panicTimer: 0,
    nucleusIframes: 0,
    fleeAngle: 0,
    alive: true,
    storedProtein: 0,
    bodyProtein: bodyProteinFor(radius, "normal", complexity),
    dropDna: Math.random() < 0.45 ? 1 : 0,
  };
}

export function createBoss(x, y, layer) {
  const b = layer.boss;
  const speciesId = b.species || "ecoli";
  const species = SPECIES[speciesId] || {};
  const morph = b.morph || species.morph || MORPH.BACILLUS;
  const elite = !!b.elite || (layer.id || 0) >= 5;
  const eliteTier = b.eliteTier || Math.max(0, (layer.id || 0) - 4);
  const skillLevel =
    b.skillLevel ?? ((layer.id || 0) === 0 ? 0 : (layer.id || 0) + (elite ? eliteTier : 0));
  const complexity = Math.min(
    28,
    (layer.complexity || layer.id || 0) + 3 + (elite ? eliteTier * 2 : 0)
  );
  const radius = b.radius || SCALE.boss;
  const segCount = Math.min(
    24,
    8 + Math.floor(complexity / 2) + (elite ? eliteTier : 0)
  );
  const segments = [];
  for (let i = 0; i < segCount; i += 1) {
    segments.push({ x: x - i * Math.max(6, radius * 0.22), y });
  }
  const nuclei = Math.min(14, b.nuclei || 3);
  const mouthCount = Math.min(5, 1 + Math.floor(nuclei / 2) + (elite ? 1 : 0));
  const skillScale = 1 + skillLevel * 0.035;
  const boss = {
    id: nextId++,
    kind: "boss",
    name: b.name,
    species: speciesId,
    elite,
    eliteTier,
    skillLevel,
    x,
    y,
    homeX: x,
    homeY: y,
    territoryRadius: BOSS_AI.territoryRadius * (elite ? 1 + eliteTier * 0.04 : 1) * skillScale,
    aggroRadius: BOSS_AI.aggroRadius * (1 + skillLevel * 0.045),
    leashRadius: BOSS_AI.leashRadius * (1 + skillLevel * 0.03),
    chaseSpeedMul: 1.05 + skillLevel * 0.025 + (elite ? eliteTier * 0.01 : 0),
    aiState: "patrol",
    vx: 0,
    vy: 0,
    angle: 0,
    radius,
    morph,
    complexity,
    curve: species.curve || (elite ? 0.2 + (eliteTier % 3) * 0.12 : 0),
    aspect: species.aspect || (elite ? 1.15 + (eliteTier % 4) * 0.08 : 1.2),
    elongate: !!species.elongate || (elite && morph === MORPH.SPIRILLUM),
    hollow: !!species.hollow || (elite && morph === MORPH.COLONY && eliteTier % 2 === 0),
    envelope: !!species.envelope || (elite && morph === MORPH.VIRUS),
    legs: Math.min(
      8,
      (species.legs || (morph === MORPH.PHAGE ? 3 : 2)) +
        Math.floor(complexity / 5) +
        (elite ? Math.floor(eliteTier / 2) : 0)
    ),
    color: elite && eliteTier >= 3 ? "#ff4a3a" : b.color,
    coreColor: elite ? "#ffe8a0" : "#ffe0dc",
    membrane: b.membrane || "#4a2020",
    flagella: b.flagella || 0,
    spikes: b.spikes || 0,
    colonyCells: b.colonyCells || 0,
    cilia: !!b.cilia,
    organelles: Math.min(16, 2 + complexity),
    membraneLayers: Math.min(3, 1 + Math.floor(complexity / 3)),
    vacuoles: Math.min(8, Math.max(1, Math.floor(complexity / 2))),
    cellBridges: morph === MORPH.COLONY,
    capsidFacets:
      morph === MORPH.VIRUS || morph === MORPH.PHAGE
        ? Math.min(14, 8 + (elite ? eliteTier : 0))
        : 0,
    segments,
    nuclei: makeNuclei(nuclei, radius, morph),
    ...mouthBundle(morph, radius, mouthCount),
    pulse: 0,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    temper: TEMPER.HOSTILE,
    aggressive: true,
    warning: true,
    aggro: (b.aggroBoost || 1) * (elite ? 1.05 + eliteTier * 0.03 : 1) * (1 + skillLevel * 0.02),
    provokeFlash: 0,
    panicTimer: 0,
    nucleusIframes: 0,
    fleeAngle: 0,
    alive: true,
    storedProtein: 0,
    bodyProtein: bodyProteinFor(radius, "boss", complexity),
    dropDna: 2 + Math.floor(nuclei / 2),
  };
  // 按层数赋予相应技能等级（鞭毛/裂口/刺突等堆叠）
  applySkillLevel(boss, skillLevel, elite);
  return boss;
}

/** 下一层隐约可见的幽灵生物（不可交互） */
export function createGhost(x, y, nextLayer) {
  const morph = pick(nextLayer.morphPool || [MORPH.COCCUS]);
  const radius = SCALE.ghost * (0.85 + Math.random() * 0.25);
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
    complexity: 2 + Math.floor(Math.random() * 2),
    flagella: morph === MORPH.BACILLUS ? 2 : 0,
    spikes: morph === MORPH.VIRUS || morph === MORPH.PHAGE ? 10 : 0,
    colonyCells: morph === MORPH.COLONY ? 6 : 0,
    cilia: morph === MORPH.COCCUS,
    pulse: Math.random() * 10,
    drift: 12 + Math.random() * 22,
    driftAngle: Math.random() * Math.PI * 2,
    /** 0..1 可见度，配合淡入淡出避免突然出现/消失 */
    alpha: 0,
    fade: "wait",
    fadeT: Math.random() * 4,
    holdDuration: 2.8 + Math.random() * 4.5,
    fadeSpeed: 0.28 + Math.random() * 0.22,
    blur: 2.2 + Math.random() * 2.8,
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

/** 单嘴世界坐标（兼容旧调用，取第一张嘴） */
export function mouthWorldPos(creature) {
  return allMouthsWorldPos(creature)[0];
}

/** 全部嘴的世界坐标 */
export function allMouthsWorldPos(creature) {
  const list =
    creature.mouths?.length > 0
      ? creature.mouths
      : [
          {
            mouthAngle: creature.mouthAngle || 0,
            mouthDist: creature.mouthDist || PLAYER.mouthDistFactor,
            mouthRadius: creature.mouthRadius,
          },
        ];
  return list.map((m) => {
    const facing = creature.angle + (m.mouthAngle || 0);
    const dist = creature.radius * (m.mouthDist ?? PLAYER.mouthDistFactor);
    const r =
      m.mouthRadius ||
      creature.mouthRadius ||
      Math.max(4, creature.radius * PLAYER.mouthRadiusFactor);
    return {
      x: creature.x + Math.cos(facing) * dist,
      y: creature.y + Math.sin(facing) * dist,
      r,
      facing,
    };
  });
}

export function anyMouthTouchesPoint(creature, x, y, radius, world, bonus = 0) {
  return allMouthsWorldPos(creature).some((m) => mouthTouchesPoint(m, x, y, radius, world, bonus));
}

export function anyMouthTouchesNucleus(creature, nucleusPos, world, bonus = 0) {
  return allMouthsWorldPos(creature).some((m) => mouthTouchesNucleus(m, nucleusPos, world, bonus));
}

export function mouthTouchesNucleus(mouth, nucleusPos, world, bonus = 0) {
  const off = wrappedOffset(mouth.x, mouth.y, nucleusPos.x, nucleusPos.y, world);
  return off.dist < mouth.r + nucleusPos.r + bonus;
}

export function mouthTouchesPoint(mouth, x, y, radius, world, bonus = 0) {
  const off = wrappedOffset(mouth.x, mouth.y, x, y, world);
  return off.dist < mouth.r + radius + bonus;
}

/** 圆形形态：球菌 / 集群 / 病毒 */
export function isCircularMorph(morph) {
  return morph === MORPH.COCCUS || morph === MORPH.COLONY || morph === MORPH.VIRUS;
}

/**
 * 圆形玩家：进入体表圆形范围的蛋白/DNA 旋转着扫向嘴部
 * @returns {number} 本帧仍在扫入中的数量
 */
export function sweepCircularIntake(player, items, world, dt) {
  if (!player || !isCircularMorph(player.morph) || !items?.length) return 0;
  const mouths = allMouthsWorldPos(player);
  if (!mouths.length) return 0;
  const catchR = player.radius * 1.1;
  const spin = 4.2; // rad/s
  let active = 0;

  for (const item of items) {
    const toItem = wrappedOffset(player.x, player.y, item.x, item.y, world);
    const reach = catchR + (item.r || 0);
    if (toItem.dist > reach) {
      item._sweeping = false;
      item._sweepAng = undefined;
      continue;
    }

    // 最近嘴作为汇聚目标
    let mouth = mouths[0];
    let best = Infinity;
    for (const m of mouths) {
      const d = wrappedOffset(item.x, item.y, m.x, m.y, world).dist;
      if (d < best) {
        best = d;
        mouth = m;
      }
    }
    const mouthRel = wrappedOffset(player.x, player.y, mouth.x, mouth.y, world);

    active += 1;
    item._sweeping = true;
    let ang = item._sweepAng != null ? item._sweepAng : Math.atan2(toItem.dy, toItem.dx);
    ang += spin * dt;
    item._sweepAng = ang;

    // 半径逐渐收束，同时角向旋转
    const shrink = 48 + (1 - toItem.dist / Math.max(1, catchR)) * 70;
    let radial = Math.max(2.5, toItem.dist - shrink * dt);
    // 越靠近中心，越贴向嘴的相对位置
    const blend = clamp(1 - radial / Math.max(1, catchR), 0, 1);
    const blendEase = blend * blend * (3 - 2 * blend);
    const orbitX = Math.cos(ang) * radial;
    const orbitY = Math.sin(ang) * radial;
    const targetX = orbitX * (1 - blendEase) + mouthRel.dx * blendEase;
    const targetY = orbitY * (1 - blendEase) + mouthRel.dy * blendEase;

    item.x = player.x + targetX;
    item.y = player.y + targetY;
    if (world) {
      if (item.x < 0) item.x += world.width;
      else if (item.x >= world.width) item.x -= world.width;
      if (item.y < 0) item.y += world.height;
      else if (item.y >= world.height) item.y -= world.height;
    }
    item.phase = (item.phase || 0) + dt * 12;
  }
  return active;
}

/** 满条可按住加速的时长（随进化与气泡能力提升） */
export function boostDurationFor(playerOrEvoId) {
  const evoId =
    typeof playerOrEvoId === "object" ? playerOrEvoId?.evolutionId || 0 : playerOrEvoId || 0;
  const base = PLAYER.boostDuration + evoId * (PLAYER.boostDurationPerEvo || 0.28);
  const drainMul =
    typeof playerOrEvoId === "object" ? playerOrEvoId?.mods?.boostDrain || 1 : 1;
  // boostDrain < 1 表示更耐用 → 等效时长更长
  return base / Math.max(0.4, drainMul);
}

export function boostRingRatio(player) {
  return clamp(player.boostCharge ?? 1, 0, 1);
}

export function updatePlayer(player, input, dt) {
  if (player.invuln > 0) player.invuln -= dt;

  const pressed = !!input.boostPressed;
  const regen = 1 / Math.max(0.25, PLAYER.boostRegenTime || 1.85);
  const maxHold = Math.max(0.35, boostDurationFor(player));
  const drain = 1 / maxHold;

  if (player.boostLocked) {
    // 完全耗尽后的回复不可打断
    player.boosting = false;
    player.boostCharge = clamp((player.boostCharge || 0) + regen * dt, 0, 1);
    if (player.boostCharge >= 1) player.boostLocked = false;
  } else if (pressed && (player.boostCharge || 0) > 0) {
    // 按住：立即停止回复并消耗；按时长扣进度
    player.boosting = true;
    player.boostCharge -= drain * dt;
    if (player.boostCharge <= 0) {
      player.boostCharge = 0;
      player.boosting = false;
      player.boostLocked = true;
    }
  } else {
    // 松手后自动回复（可被再次按下打断）
    player.boosting = false;
    if ((player.boostCharge || 0) < 1) {
      player.boostCharge = clamp((player.boostCharge || 0) + regen * dt, 0, 1);
    }
  }

  const boosting = !!player.boosting;
  const sizeScale = speedScaleForRadius(player.radius);
  const speedMul = player.mods?.speed || 1;
  const speed = (boosting ? PLAYER.boostSpeed : PLAYER.baseSpeed) * sizeScale * speedMul;
  const turnMul = player.mods?.turn || 1;

  if (input.moving) {
    const targetAngle = Math.atan2(input.dirY, input.dirX);
    let delta = targetAngle - player.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    player.angle += delta * clamp(PLAYER.turnRate * turnMul * dt, 0, 1);

    const mag = clamp(Math.hypot(input.dirX, input.dirY), 0, 1);
    const evolveSlow = player.evolutionTween ? 0.42 : 1;
    player.vx = Math.cos(player.angle) * speed * mag * evolveSlow;
    player.vy = Math.sin(player.angle) * speed * mag * evolveSlow;
  } else {
    player.vx *= Math.pow(0.04, dt);
    player.vy *= Math.pow(0.04, dt);
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.pulse += dt * (boosting ? 4.2 : player.evolutionTween ? 3.4 : 2.2);
  syncSegments(player);
}

function playerCruiseSpeed(player) {
  const mul = player?.mods?.speed || 1;
  return PLAYER.baseSpeed * speedScaleForRadius(player?.radius || PLAYER.speedRefRadius) * mul;
}

function steerCreature(creature, tx, ty, dt, speedMul = 1, player = null, opts = {}) {
  const dir = normalize(tx, ty);
  const targetAngle = Math.atan2(dir.y, dir.x);
  let delta = targetAngle - creature.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  // 转身偏慢，避免瞬转贴脸纠缠；Boss 技能等级提升转向
  const skillTurn = creature.mods?.turn || 1;
  const turn =
    opts.turnRate ??
    (creature.panicTimer > 0
      ? 1.7
      : creature.kind === "boss"
        ? 1.25 * skillTurn
        : 0.95);
  creature.angle += delta * clamp(turn * dt, 0, 1);

  // 大体型更慢，且整体略低于玩家常速，保证可追可逃
  const base = creature.kind === "boss" ? 86 : 98;
  let speed = base * speedScaleForRadius(creature.radius) * speedMul;
  if (player && !opts.breakCap) {
    // 技能等级略抬升 Boss 速度上限，仍略低于玩家满配
    const skillCap =
      creature.kind === "boss"
        ? Math.min(0.98, (PLAYER.bossSpeedFactor || 0.9) + (creature.skillLevel || 0) * 0.008)
        : PLAYER.npcSpeedFactor || 0.86;
    const cap = playerCruiseSpeed(player) * skillCap;
    speed = Math.min(speed, cap);
  } else if (player && opts.breakCap) {
    // 受击逃跑时可短暂略快于玩家，拉开距离
    speed = Math.min(speed, playerCruiseSpeed(player) * 1.18);
  }
  creature.vx = Math.cos(creature.angle) * speed;
  creature.vy = Math.sin(creature.angle) * speed;
  creature.x += creature.vx * dt;
  creature.y += creature.vy * dt;
  creature.pulse += dt * 2;
  syncSegments(creature);
}

/** 细胞核被咬后：短时加速逃离，避免与玩家持续纠缠 */
export function panicFlee(creature, player, world) {
  if (!creature || creature.kind === "boss") {
    // Boss 也短暂后撤，但不进入长时间恐慌
    creature.panicTimer = Math.max(creature.panicTimer || 0, 0.65);
  } else {
    creature.panicTimer = 1.15 + Math.random() * 0.45;
  }
  creature.nucleusIframes = Math.max(creature.nucleusIframes || 0, 0.75);
  creature.mood = "panic";
  const off = wrappedOffset(creature.x, creature.y, player.x, player.y, world);
  if (off.dist > 0.001) {
    creature.fleeAngle = Math.atan2(-off.dy, -off.dx);
    creature.wanderAngle = creature.fleeAngle;
  }
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

  const aggroRadius = creature.aggroRadius || BOSS_AI.aggroRadius;
  const leashRadius = creature.leashRadius || BOSS_AI.leashRadius;
  const inTerritory = playerToHome.dist <= creature.territoryRadius;
  const beyondLeash = toHome.dist > leashRadius;

  if (creature.aiState === "chase") {
    if (!inTerritory || beyondLeash) {
      creature.aiState = "return";
    }
  } else if (creature.aiState === "return") {
    if (toHome.dist < creature.territoryRadius * 0.35) {
      creature.aiState = "patrol";
    }
  } else if (inTerritory && toPlayer.dist < aggroRadius) {
    creature.aiState = "chase";
  }

  let tx;
  let ty;
  let speedMul = 1;
  const skillSpeed = creature.mods?.speed || 1;

  if (creature.aiState === "chase") {
    tx = toPlayer.dx;
    ty = toPlayer.dy;
    speedMul = (creature.chaseSpeedMul || 1.05) * skillSpeed;
  } else if (creature.aiState === "return") {
    tx = toHome.dx;
    ty = toHome.dy;
    speedMul = BOSS_AI.returnSpeed * skillSpeed;
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

  steerCreature(creature, tx, ty, dt, speedMul, player);
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
  if (creature.nucleusIframes > 0) creature.nucleusIframes -= dt;
  if (creature.panicTimer > 0) creature.panicTimer -= dt;

  if (creature.kind === "boss") {
    // Boss 受击恐慌时优先拉开，再回到领地 AI
    if ((creature.panicTimer || 0) > 0) {
      const toPlayer = wrappedOffset(creature.x, creature.y, player.x, player.y, world);
      const ang = creature.fleeAngle ?? Math.atan2(-toPlayer.dy, -toPlayer.dx);
      steerCreature(
        creature,
        Math.cos(ang),
        Math.sin(ang),
        dt,
        1.45,
        player,
        { breakCap: true, turnRate: 1.6 }
      );
      wrapEntity(creature, world);
      return;
    }
    updateBoss(creature, player, dt, world, proteins);
    return;
  }

  if (creature.provokeFlash > 0) creature.provokeFlash -= dt;
  if (creature.moodTimer > 0) creature.moodTimer -= dt;
  if (creature.provoked && (creature.aggressionTimer || 0) > 0) {
    creature.aggressionTimer -= dt;
    if (creature.aggressionTimer <= 0) calmProvokedCreature(creature);
  }

  const toPlayer = wrappedOffset(creature.x, creature.y, player.x, player.y, world);

  // 细胞核被吃后的短时加速逃跑
  if ((creature.panicTimer || 0) > 0) {
    const ang = creature.fleeAngle ?? Math.atan2(-toPlayer.dy, -toPlayer.dx);
    steerCreature(
      creature,
      Math.cos(ang),
      Math.sin(ang),
      dt,
      1.7,
      player,
      { breakCap: true, turnRate: 1.55 }
    );
    wrapEntity(creature, world);
    if (creature.panicTimer <= 0) creature.mood = "idle";
    return;
  }

  creature.wanderTimer -= dt;
  if (creature.wanderTimer <= 0) {
    creature.wanderTimer = 0.5 + Math.random() * 1.2;
    creature.wanderAngle += (Math.random() - 0.5) * 2;
    // 非攻击性生物有一定几率转为好奇靠近
    if (!isAggressive(creature) && Math.random() < (creature.curiousRate ?? 0.3)) {
      creature.mood = "curious";
      creature.moodTimer = 1.6 + Math.random() * 2.4;
    } else if (creature.mood === "curious" && (creature.moodTimer || 0) <= 0) {
      creature.mood = "idle";
    }
  }

  let tx = Math.cos(creature.wanderAngle);
  let ty = Math.sin(creature.wanderAngle);
  let speedMul = 1;

  // 低等级不主动进攻：改为觅食/游荡
  const aggressive = willAggressPlayer(creature, player);

  if (aggressive) {
    const chaseRange = creature.chaseRange || 320;
    if (toPlayer.dist < chaseRange) {
      const n = normalize(toPlayer.dx, toPlayer.dy);
      tx = n.x * creature.aggro + tx * 0.2;
      ty = n.y * creature.aggro + ty * 0.2;
      speedMul = 1.02;
    } else {
      const food = seekProtein(creature, proteins, world);
      if (food) {
        tx = food.dx * 1.1 + tx * 0.25;
        ty = food.dy * 1.1 + ty * 0.25;
      }
    }
  } else if (isAggressive(creature) && !willAggressPlayer(creature, player)) {
    // 有攻击性但等级更低：不追人，只觅食
    const food = seekProtein(creature, proteins, world);
    if (food) {
      tx = food.dx * 1.1 + tx * 0.25;
      ty = food.dy * 1.1 + ty * 0.25;
      speedMul = 0.9;
    }
  } else if (creature.mood === "curious" && (creature.moodTimer || 0) > 0 && toPlayer.dist < 420) {
    // 好奇靠近玩家（仍非攻击）
    const n = normalize(toPlayer.dx, toPlayer.dy);
    tx = n.x * 1.1 + tx * 0.25;
    ty = n.y * 1.1 + ty * 0.25;
    speedMul = 0.78;
    if (toPlayer.dist < Math.max(36, player.radius + creature.radius)) {
      // 靠太近则轻轻绕开，避免贴脸
      tx = -n.y * 0.8 + tx * 0.4;
      ty = n.x * 0.8 + ty * 0.4;
      speedMul = 0.7;
    }
  } else {
    // 被动 / 未激怒：近距离躲避，远处觅食
    const fleeRange = creature.temper === TEMPER.PASSIVE ? 160 : 200;
    if (toPlayer.dist < fleeRange) {
      const n = normalize(toPlayer.dx, toPlayer.dy);
      tx = -n.x * 1.2 + tx * 0.2;
      ty = -n.y * 1.2 + ty * 0.2;
      speedMul = 0.96;
    } else {
      const food = seekProtein(creature, proteins, world, 300);
      if (food) {
        tx = food.dx * 1.15 + tx * 0.2;
        ty = food.dy * 1.15 + ty * 0.2;
      }
    }
  }

  steerCreature(creature, tx, ty, dt, speedMul, player);
  wrapEntity(creature, world);
}

export function updateGhost(ghost, dt, world) {
  ghost.driftAngle += dt * 0.35;
  ghost.x += Math.cos(ghost.driftAngle) * ghost.drift * dt;
  ghost.y += Math.sin(ghost.driftAngle * 0.8) * ghost.drift * 0.7 * dt;
  wrapEntity(ghost, world);
  ghost.angle += dt * 0.4;
  ghost.pulse += dt * 1.4;

  const speed = ghost.fadeSpeed || 0.35;
  if (ghost.fade === "wait") {
    ghost.alpha = 0;
    ghost.fadeT = (ghost.fadeT ?? 1) - dt;
    if (ghost.fadeT <= 0) ghost.fade = "in";
  } else if (ghost.fade === "in") {
    ghost.alpha = Math.min(1, (ghost.alpha || 0) + dt * speed);
    if (ghost.alpha >= 1) {
      ghost.fade = "hold";
      ghost.fadeT = ghost.holdDuration || 3.5;
    }
  } else if (ghost.fade === "hold") {
    ghost.alpha = 1;
    ghost.fadeT = (ghost.fadeT ?? 3) - dt;
    if (ghost.fadeT <= 0) ghost.fade = "out";
  } else {
    ghost.alpha = Math.max(0, (ghost.alpha || 0) - dt * speed);
    if (ghost.alpha <= 0) {
      // 淡出后再换位，避免突然出现/消失
      ghost.x = 80 + Math.random() * (WORLD.width - 160);
      ghost.y = 80 + Math.random() * (WORLD.height - 160);
      ghost.driftAngle = Math.random() * Math.PI * 2;
      ghost.angle = Math.random() * Math.PI * 2;
      ghost.holdDuration = 2.8 + Math.random() * 4.5;
      ghost.blur = 2.2 + Math.random() * 2.8;
      ghost.fadeT = 0.4 + Math.random() * 1.8;
      ghost.fade = "wait";
    }
  }
}
