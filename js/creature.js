import { BOSS_AI, EVOLUTIONS, MORPH, PLAYER, TEMPER, WARNING, WORLD } from "./config.js";

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
 * 按外形布置嘴位：线形在顶端、圆形靠近中心、集群在外周细胞、噬菌体在头部下方等。
 * 嘴数量随等级适度增加。
 */
function makeMouths(morph, radius, count = 1) {
  const n = Math.max(1, count | 0);
  const baseR = Math.max(3.5, radius * PLAYER.mouthRadiusFactor * (n > 1 ? 0.82 : 1));
  const mouths = [];

  if (morph === MORPH.BACILLUS || morph === MORPH.SPIRILLUM) {
    // 线形：嘴在前进顶端，多嘴时略偏左右
    for (let i = 0; i < n; i += 1) {
      const spread = n === 1 ? 0 : (i - (n - 1) / 2) * 0.32;
      mouths.push({
        mouthAngle: spread,
        mouthDist: morph === MORPH.SPIRILLUM ? 1.08 : 1.12,
        mouthRadius: baseR * (i === 0 ? 1 : 0.88),
      });
    }
  } else if (morph === MORPH.COCCUS) {
    // 圆形：嘴靠近体心（略偏前），多嘴环绕近心区
    for (let i = 0; i < n; i += 1) {
      const a = n === 1 ? 0 : (Math.PI * 2 * i) / n;
      mouths.push({
        mouthAngle: a,
        mouthDist: n === 1 ? 0.16 : 0.32,
        mouthRadius: baseR,
      });
    }
  } else if (morph === MORPH.COLONY) {
    // 集群：嘴分布在外周细胞上
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n + 0.35;
      mouths.push({
        mouthAngle: a,
        mouthDist: 0.88 + (i % 2) * 0.1,
        mouthRadius: baseR * 0.95,
      });
    }
  } else if (morph === MORPH.VIRUS) {
    // 囊膜病毒：嘴在外壳边缘朝外
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n;
      mouths.push({
        mouthAngle: a,
        mouthDist: 0.92,
        mouthRadius: baseR * 0.9,
      });
    }
  } else if (morph === MORPH.PHAGE) {
    // 噬菌体：主嘴在尾刺/注射端（局部下方），额外嘴在头侧
    mouths.push({ mouthAngle: Math.PI / 2, mouthDist: 1.05, mouthRadius: baseR });
    for (let i = 1; i < n; i += 1) {
      mouths.push({
        mouthAngle: Math.PI / 2 + (i % 2 ? 0.5 : -0.5),
        mouthDist: 0.85,
        mouthRadius: baseR * 0.78,
      });
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      mouths.push({
        mouthAngle: (Math.PI * 2 * i) / n,
        mouthDist: 0.9,
        mouthRadius: baseR,
      });
    }
  }

  return {
    mouths,
    mouthAngle: mouths[0].mouthAngle,
    mouthDist: mouths[0].mouthDist,
    mouthRadius: mouths[0].mouthRadius,
  };
}

function mouthBundle(morph, radius, count = 1) {
  return makeMouths(morph, radius, count);
}

/** 体型越大速度越慢 */
export function speedScaleForRadius(radius) {
  const ref = PLAYER.speedRefRadius || 18;
  return clamp(ref / Math.max(8, radius), PLAYER.minSpeedScale || 0.48, PLAYER.maxSpeedScale || 1.15);
}

function bodyProteinFor(radius, kind = "normal") {
  if (kind === "boss") return Math.max(8, Math.round(radius / 9));
  return Math.max(1, Math.round(radius / 13));
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

function visualFromEvo(evo) {
  return {
    morph: evo.morph,
    color: evo.color,
    coreColor: evo.coreColor,
    membrane: evo.membrane,
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
  };
}

export function createPlayer(x, y, evolutionId = 0) {
  const evo = EVOLUTIONS[evolutionId];
  const spacing = Math.max(PLAYER.segmentSpacing * 0.5, evo.radius * 0.32);
  const segments = [];
  for (let i = 0; i < evo.segmentCount; i += 1) {
    segments.push({ x: x - i * spacing, y });
  }
  const mouth = mouthBundle(evo.morph, evo.radius, evo.mouths || 1);
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
    boostDurationActive: 0,
    /** 0..1 加速能量，按下扣除，随后自动回复 */
    boostCharge: 1,
    boostLatch: false,
    invuln: 0,
    recoverProgress: 0,
    storedProtein: 0,
    bodyProtein: bodyProteinFor(evo.radius, "player"),
    evolutionTween: null,
    morphMix: 0,
    alive: true,
  };
}

/** 立即定格到目标进化（过渡结束时调用） */
export function applyEvolution(player, evolutionId) {
  const evo = EVOLUTIONS[evolutionId];
  player.evolutionId = evolutionId;
  player.radius = evo.radius;
  Object.assign(player, visualFromEvo(evo));
  Object.assign(player, mouthBundle(evo.morph, evo.radius, evo.mouths || 1));
  player.nuclei = makeNuclei(evo.nuclei, evo.radius, evo.morph);
  player.bodyProtein = bodyProteinFor(evo.radius, "player");
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
  const to = EVOLUTIONS[evolutionId];
  if (!to) return;
  const fromVisual = snapshotVisual(player);
  const toVisual = visualFromEvo(to);
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
    toMouths: mouthBundle(to.morph, to.radius, to.mouths || 1).mouths,
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

  // 颜色与结构参数渐变
  player.color = lerpHex(tw.fromVisual.color, tw.toVisual.color, sMorph);
  player.coreColor = lerpHex(tw.fromVisual.coreColor, tw.toVisual.coreColor, sMorph);
  player.membrane = lerpHex(tw.fromVisual.membrane, tw.toVisual.membrane, sMorph);
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
  player.morph = sMorph < 0.42 ? tw.fromVisual.morph : tw.toVisual.morph;

  // 嘴位插值 / 数量过渡
  const fromM = tw.fromMouths;
  const toM = tw.toMouths;
  const mouthCount = Math.max(fromM.length, Math.round(lerp(fromM.length, toM.length, sMorph)));
  const mouths = [];
  for (let i = 0; i < mouthCount; i += 1) {
    const a = fromM[Math.min(i, fromM.length - 1)];
    const b = toM[Math.min(i, toM.length - 1)];
    mouths.push({
      mouthAngle: lerp(a.mouthAngle, b.mouthAngle, sMorph),
      mouthDist: lerp(a.mouthDist, b.mouthDist, sMorph),
      mouthRadius: lerp(a.mouthRadius, b.mouthRadius, sGrow),
    });
  }
  player.mouths = mouths;
  player.mouthAngle = mouths[0].mouthAngle;
  player.mouthDist = mouths[0].mouthDist;
  player.mouthRadius = mouths[0].mouthRadius;

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
  // 同等级体型稳定：仅允许极小抖动，相对大小（含核）保持一致
  const radius = evo.radius * (0.96 + Math.random() * 0.08);
  const temper = rollTemper(layer.temperWeights);
  const look = paletteForTemper(temper, layer);
  const segments = [];
  const count = Math.max(3, evo.segmentCount - 1);
  const spacing = Math.max(7, evo.radius * 0.28);
  for (let i = 0; i < count; i += 1) {
    segments.push({ x: x - i * spacing, y });
  }
  const complexity = evo.complexity || 1;
  const mouthCount = Math.max(1, Math.min(evo.mouths || 1, complexity >= 4 ? 2 : 1));
  return {
    id: nextId++,
    kind: "normal",
    temper,
    evolutionId: tier,
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
    flagella:
      morph === MORPH.BACILLUS || morph === MORPH.SPIRILLUM
        ? Math.max(1, (evo.flagella || 1) + (complexity >= 3 ? 1 : 0))
        : evo.flagella || 0,
    spikes: morph === MORPH.VIRUS ? evo.spikes || 10 : evo.spikes || 0,
    colonyCells: morph === MORPH.COLONY ? evo.colonyCells || 5 : evo.colonyCells || 0,
    cilia: !!evo.cilia || (morph === MORPH.COCCUS && complexity >= 2),
    organelles: evo.organelles || 0,
    membraneLayers: evo.membraneLayers || 1,
    vacuoles: evo.vacuoles || 0,
    cellBridges: !!evo.cellBridges || (morph === MORPH.COLONY && complexity >= 3),
    capsidFacets: evo.capsidFacets || 0,
    segments,
    nuclei: makeNuclei(1, radius, morph),
    ...mouthBundle(morph, radius, mouthCount),
    pulse: Math.random() * 10,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    aggro: temper === TEMPER.HOSTILE ? 0.85 + Math.random() * 0.25 : 0.4 + Math.random() * 0.3,
    provokeFlash: 0,
    alive: true,
    storedProtein: 0,
    bodyProtein: bodyProteinFor(radius, "normal"),
    dropDna: Math.random() < 0.45 ? 1 : 0,
  };
}

export function createBoss(x, y, layer) {
  const b = layer.boss;
  const morph = b.morph || MORPH.BACILLUS;
  const complexity = Math.min(5, (layer.id || 0) + 3);
  const segments = [];
  for (let i = 0; i < 14; i += 1) {
    segments.push({ x: x - i * Math.max(10, b.radius * 0.22), y });
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
    complexity,
    color: b.color,
    coreColor: "#ffe0dc",
    membrane: b.membrane || "#4a2020",
    flagella: b.flagella || 0,
    spikes: b.spikes || 0,
    colonyCells: b.colonyCells || 0,
    cilia: !!b.cilia,
    organelles: 2 + complexity,
    membraneLayers: Math.min(3, 1 + Math.floor(complexity / 2)),
    vacuoles: Math.max(1, complexity - 1),
    cellBridges: morph === MORPH.COLONY,
    capsidFacets: morph === MORPH.VIRUS || morph === MORPH.PHAGE ? 8 : 0,
    segments,
    nuclei: makeNuclei(b.nuclei, b.radius, morph),
    ...mouthBundle(morph, b.radius, Math.min(3, 1 + Math.floor(b.nuclei / 2))),
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
    bodyProtein: bodyProteinFor(b.radius, "boss"),
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

/** 当前进化等级可用的加速时长 */
export function boostDurationFor(evolutionId) {
  return PLAYER.boostDuration + (evolutionId || 0) * (PLAYER.boostDurationPerEvo || 0.24);
}

/** 圆环显示：加速中看剩余加速时间，否则看能量回复 */
export function boostRingRatio(player) {
  if (player.boostTimer > 0 && player.boostDurationActive > 0) {
    return clamp(player.boostTimer / player.boostDurationActive, 0, 1);
  }
  return clamp(player.boostCharge ?? 1, 0, 1);
}

export function updatePlayer(player, input, dt) {
  if (player.boostTimer > 0) player.boostTimer -= dt;
  if (player.invuln > 0) player.invuln -= dt;

  const pressed = !!input.boostPressed;
  if (!pressed) player.boostLatch = false;
  if (pressed && !player.boostLatch) {
    player.boostLatch = true;
    // 能量回满后才能再次加速；按下一次扣光能量并进入加速
    if (player.boostTimer <= 0 && (player.boostCharge ?? 0) >= 0.98) {
      const dur = boostDurationFor(player.evolutionId);
      player.boostDurationActive = dur;
      player.boostTimer = dur;
      player.boostCharge = 0;
    }
  }

  // 非加速时自动回复能量
  if (player.boostTimer <= 0) {
    const regen = 1 / Math.max(0.2, PLAYER.boostRegenTime || 1.6);
    player.boostCharge = clamp((player.boostCharge || 0) + regen * dt, 0, 1);
  }

  const boosting = player.boostTimer > 0;
  const sizeScale = speedScaleForRadius(player.radius);
  const speed = (boosting ? PLAYER.boostSpeed : PLAYER.baseSpeed) * sizeScale;

  if (input.moving) {
    const targetAngle = Math.atan2(input.dirY, input.dirX);
    let delta = targetAngle - player.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    player.angle += delta * clamp(PLAYER.turnRate * dt, 0, 1);

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

function steerCreature(creature, tx, ty, dt, speedMul = 1) {
  const dir = normalize(tx, ty);
  const targetAngle = Math.atan2(dir.y, dir.x);
  let delta = targetAngle - creature.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  creature.angle += delta * clamp((creature.kind === "boss" ? 3.2 : 2.6) * dt, 0, 1);

  // 大体型更慢
  const base = creature.kind === "boss" ? 72 : 80;
  const speed = base * speedScaleForRadius(creature.radius) * speedMul;
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
