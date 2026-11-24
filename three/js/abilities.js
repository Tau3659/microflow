import { ABILITIES } from "./config.js";

/** 由 creature.js 注入，避免循环依赖 */
let _syncPlayerMouth = null;
export function bindMouthSync(fn) {
  _syncPlayerMouth = fn;
}

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

/** 根据层与玩家已拥有数量，决定是否掉落及掉落哪种能力；Boss 必掉 */
export function rollAbilityDrop(layerIndex, player, isBoss = false) {
  const owned = player?.abilities || {};
  const candidates = Object.values(ABILITIES).filter((a) => {
    if ((owned[a.id] || 0) >= a.maxStacks) return false;
    if (a.minLayer != null && layerIndex < a.minLayer) return false;
    return true;
  });
  if (!candidates.length) return null;

  // 普通怪：提高掉落率；Boss：跳过掷骰，必掉一件
  if (!isBoss) {
    const anyRate = 0.16;
    if (Math.random() > anyRate) return null;
  }

  let total = 0;
  const weights = candidates.map((a) => {
    // 胞口加权，提高抽中概率
    const buccalBoost = a.id === "buccal" ? 2.2 : 1;
    const w = a.dropRate * (isBoss ? 1.4 : 1) * buccalBoost;
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
    name: def.name,
    x,
    y,
    r: 16,
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
  const polyMouth = a.polyMouth || 0;
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
    extraMouths: polyMouth,
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

  _syncPlayerMouth?.(player);
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

export function applyAbilitiesToNewPlayer(player, savedCounts) {
  player.abilities = { ...emptyAbilityCounts(), ...(savedCounts || {}) };
  recomputeAbilityMods(player);
}

/**
 * 按技能等级为 Boss / 精英分配能力堆叠。
 * skillLevel 越高，速度/转向/嘴数/防御等加成越多。
 */
export function skillAbilityCounts(skillLevel = 0, elite = false) {
  const s = Math.max(0, skillLevel | 0);
  const eliteBonus = elite ? 1 : 0;
  const counts = emptyAbilityCounts();
  counts.flagella = Math.min(5, Math.floor(s / 2) + eliteBonus);
  counts.cilia = Math.min(4, Math.floor(s / 3) + eliteBonus);
  counts.cellWall = Math.min(3, Math.floor(s / 3));
  counts.buccal = Math.min(4, Math.floor((s + 1) / 2));
  counts.polyMouth = Math.min(3, Math.floor(s / (elite ? 3 : 4)) + (elite && s >= 3 ? 1 : 0));
  counts.capsule = Math.min(3, Math.floor(s / 4) + eliteBonus);
  counts.gasVacuole = Math.min(3, Math.floor(s / 4));
  counts.chromatophore = Math.min(2, Math.floor(s / 5));
  counts.spikeProtein = Math.min(3, Math.max(0, Math.floor((s - 2) / 3) + eliteBonus));
  counts.plasmid = Math.min(2, Math.floor(s / 5));
  counts.endospore = Math.min(2, Math.floor(s / 6));
  return counts;
}

/** 将技能等级对应的能力写到生物上（Boss / 精英） */
export function applySkillLevel(creature, skillLevel = 0, elite = false) {
  if (!creature) return creature;
  creature.skillLevel = Math.max(0, skillLevel | 0);
  creature.abilities = skillAbilityCounts(creature.skillLevel, elite);
  recomputeAbilityMods(creature);
  return creature;
}
