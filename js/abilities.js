import { ABILITIES } from "./config.js";

export function emptyAbilityCounts() {
  const counts = {};
  for (const id of Object.keys(ABILITIES)) counts[id] = 0;
  return counts;
}

export function abilityCount(player, id) {
  return player?.abilities?.[id] || 0;
}

export function isAbilityMaxed(player, id) {
  const def = ABILITIES[id];
  if (!def) return true;
  return abilityCount(player, id) >= def.maxStacks;
}

/** 根据层与玩家已拥有数量，决定是否掉落及掉落哪种能力 */
export function rollAbilityDrop(layerIndex, player, isBoss = false) {
  const owned = player?.abilities || {};
  const candidates = Object.values(ABILITIES).filter((a) => {
    if ((owned[a.id] || 0) >= a.maxStacks) return false;
    if (a.layers && !a.layers.includes(layerIndex)) return false;
    return true;
  });
  if (!candidates.length) return null;

  const boost = isBoss ? 2.2 : 1;
  // 先掷一次“是否掉落稀有能力”
  const anyRate = 0.055 * boost;
  if (Math.random() > anyRate) return null;

  // 加权挑选
  let total = 0;
  const weights = candidates.map((a) => {
    const w = a.dropRate * boost;
    total += w;
    return w;
  });
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export function createAbilityPickup(def, x, y) {
  return {
    type: "ability",
    abilityId: def.id,
    x,
    y,
    r: 9,
    phase: Math.random() * Math.PI * 2,
    color: def.color,
    life: 28,
  };
}

/** 把能力堆叠效果写回玩家（速度/转向/嘴/加速等） */
export function recomputeAbilityMods(player) {
  const a = player.abilities || emptyAbilityCounts();
  const flagella = a.flagella || 0;
  const cilia = a.cilia || 0;
  const cellWall = a.cellWall || 0;
  const buccal = a.buccal || 0;
  const capsule = a.capsule || 0;
  const gas = a.gasVacuole || 0;
  const chroma = a.chromatophore || 0;
  const spike = a.spikeProtein || 0;
  const plasmid = a.plasmid || 0;
  const spore = a.endospore || 0;

  player.mods = {
    speed: 1 + flagella * 0.06,
    turn: 1 + cilia * 0.08,
    boostDrain: 1 / (1 + gas * 0.12),
    mouthScale: 1 + buccal * 0.08,
    eatBonus: spike * 1.1,
    hurtCooldown: 1 + cellWall * 0.18 + capsule * 0.1,
    proteinValue: 1 + plasmid * 0.15,
    recoverNeed: Math.max(4, 7 - spore),
    proteinMagnet: chroma * 6,
  };

  // 视觉：鞭毛/纤毛/膜层随能力增长
  player.flagella = Math.min(5, Math.max(player.flagella || 0, flagella > 0 ? 1 + Math.floor(flagella / 2) : player.flagella || 0));
  if (cilia > 0) player.cilia = true;
  player.membraneLayers = Math.min(3, Math.max(player.membraneLayers || 1, 1 + Math.floor(cellWall / 2)));
  player.vacuoles = Math.max(player.vacuoles || 0, gas);
  if (capsule > 0) player.capsule = capsule;

  // 刷新唯一嘴的尺寸
  syncPlayerMouth(player);
  return player.mods;
}

export function grantAbility(player, abilityId) {
  const def = ABILITIES[abilityId];
  if (!def) return false;
  if (!player.abilities) player.abilities = emptyAbilityCounts();
  if ((player.abilities[abilityId] || 0) >= def.maxStacks) return false;
  player.abilities[abilityId] = (player.abilities[abilityId] || 0) + 1;
  recomputeAbilityMods(player);
  return true;
}

export function syncPlayerMouth(player) {
  const scale = player.mods?.mouthScale || 1;
  const base = Math.max(4, player.radius * 0.32 * scale);
  const morph = player.morph;
  let angle = 0;
  let dist = 0.02;
  if (morph === "bacillus") {
    angle = 0;
    dist = 1.12; // 条形：一端
  } else if (morph === "spirillum") {
    angle = 0;
    dist = 1.08;
  } else if (morph === "coccus" || morph === "colony" || morph === "virus") {
    angle = 0;
    dist = 0.02; // 圆形：中心
  } else if (morph === "phage") {
    angle = Math.PI / 2;
    dist = 1.05; // 注射端
  }
  const mouth = { mouthAngle: angle, mouthDist: dist, mouthRadius: base };
  player.mouths = [mouth];
  player.mouthAngle = angle;
  player.mouthDist = dist;
  player.mouthRadius = base;
}

export function applyAbilitiesToNewPlayer(player, savedCounts) {
  player.abilities = { ...emptyAbilityCounts(), ...(savedCounts || {}) };
  recomputeAbilityMods(player);
}
