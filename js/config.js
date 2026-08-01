/** 外形：杆菌 / 球菌 / 螺旋菌 / 多细胞集群 / 囊膜病毒 / 噬菌体 */
export const MORPH = {
  BACILLUS: "bacillus",
  COCCUS: "coccus",
  SPIRILLUM: "spirillum",
  COLONY: "colony",
  VIRUS: "virus",
  PHAGE: "phage",
};

/** 进化形态：原核 → 真核单细胞 → 多细胞 → 复杂多细胞 → 病毒聚合体
 *  volume 随等级增大；细胞核半径 = radius * nucleusRadiusFactor（同级相对比例不变）
 *  complexity 升高时外形结构更丰富
 */
export const EVOLUTIONS = [
  {
    id: 0,
    name: "原核细胞",
    morph: MORPH.BACILLUS,
    radius: 18,
    segmentCount: 3,
    nuclei: 1,
    color: "#3ecfb0",
    coreColor: "#9be8d6",
    membrane: "#1a6b62",
    pointsToEvolve: 12,
    complexity: 1,
    mouths: 1,
    flagella: 1,
    organelles: 0,
    membraneLayers: 1,
  },
  {
    id: 1,
    name: "真核单细胞",
    morph: MORPH.COCCUS,
    radius: 28,
    segmentCount: 5,
    nuclei: 2,
    color: "#5ec4c8",
    coreColor: "#b8f0ef",
    membrane: "#2a6f78",
    pointsToEvolve: 28,
    complexity: 2,
    mouths: 1,
    flagella: 0,
    cilia: true,
    organelles: 2,
    membraneLayers: 1,
    vacuoles: 1,
  },
  {
    id: 2,
    name: "原始多细胞",
    morph: MORPH.COLONY,
    radius: 40,
    segmentCount: 8,
    nuclei: 3,
    color: "#e8c27a",
    coreColor: "#ffe6a8",
    membrane: "#8a6a3a",
    pointsToEvolve: 48,
    complexity: 3,
    mouths: 2,
    flagella: 0,
    colonyCells: 6,
    organelles: 3,
    membraneLayers: 2,
    vacuoles: 2,
    cellBridges: true,
  },
  {
    id: 3,
    name: "复杂多细胞",
    morph: MORPH.COLONY,
    radius: 54,
    segmentCount: 12,
    nuclei: 4,
    color: "#7eb6ff",
    coreColor: "#d4e7ff",
    membrane: "#3a5a8a",
    pointsToEvolve: 72,
    complexity: 4,
    mouths: 2,
    flagella: 0,
    colonyCells: 10,
    organelles: 5,
    membraneLayers: 2,
    vacuoles: 3,
    cellBridges: true,
    cilia: true,
  },
  {
    id: 4,
    name: "病毒聚合体",
    morph: MORPH.VIRUS,
    radius: 70,
    segmentCount: 16,
    nuclei: 5,
    color: "#e07a6a",
    coreColor: "#ffc4bc",
    membrane: "#8a3a3a",
    pointsToEvolve: Infinity,
    complexity: 5,
    mouths: 3,
    spikes: 14,
    organelles: 6,
    membraneLayers: 3,
    vacuoles: 2,
    capsidFacets: 8,
  },
];

/** 生物圈层级 */
export const LAYERS = [
  {
    id: 0,
    name: "原核海域",
    bgTop: "#12505c",
    bgBottom: "#041820",
    accent: "#3ecfb0",
    protein: "#9be8d6",
    dna: "#e8c27a",
    proteinCount: 42,
    dnaCount: 6,
    normalCount: 10,
    /** 被动 / 攻击 / 可激怒 权重 */
    /** 第一层普通生物全部被动，攻击性只留给 Boss */
    temperWeights: { passive: 1, hostile: 0, skittish: 0 },
    maxHostileNormals: 0,
    requiredEvolution: 0,
    morphPool: [MORPH.BACILLUS, MORPH.BACILLUS, MORPH.SPIRILLUM],
    boss: {
      name: "裂殖霸主",
      morph: MORPH.BACILLUS,
      radius: 56,
      nuclei: 3,
      color: "#c45c5c",
      membrane: "#6a2a2a",
      flagella: 4,
    },
  },
  {
    id: 1,
    name: "单细胞带",
    bgTop: "#0a3540",
    bgBottom: "#020f14",
    accent: "#5ec4c8",
    protein: "#7fd4d8",
    dna: "#f0d7a0",
    proteinCount: 38,
    dnaCount: 7,
    normalCount: 12,
    temperWeights: { passive: 0.55, hostile: 0.1, skittish: 0.35 },
    maxHostileNormals: 1,
    requiredEvolution: 1,
    morphPool: [MORPH.COCCUS, MORPH.SPIRILLUM, MORPH.COCCUS],
    boss: {
      name: "纤毛暴君",
      morph: MORPH.COCCUS,
      radius: 72,
      nuclei: 4,
      color: "#b85c7a",
      membrane: "#6a2a48",
      cilia: true,
    },
  },
  {
    id: 2,
    name: "多细胞礁",
    bgTop: "#061820",
    bgBottom: "#01070a",
    accent: "#e8c27a",
    protein: "#f0d7a0",
    dna: "#7eb6ff",
    proteinCount: 34,
    dnaCount: 8,
    normalCount: 14,
    temperWeights: { passive: 0.5, hostile: 0.14, skittish: 0.36 },
    maxHostileNormals: 2,
    requiredEvolution: 2,
    morphPool: [MORPH.COLONY, MORPH.COCCUS, MORPH.COLONY],
    boss: {
      name: "群核巨兽",
      morph: MORPH.COLONY,
      radius: 90,
      nuclei: 5,
      color: "#8a6ad1",
      membrane: "#3a2a6a",
      colonyCells: 11,
    },
  },
  {
    id: 3,
    name: "病毒风暴",
    bgTop: "#040c14",
    bgBottom: "#000408",
    accent: "#7eb6ff",
    protein: "#a8ceff",
    dna: "#e07a6a",
    proteinCount: 30,
    dnaCount: 8,
    normalCount: 16,
    temperWeights: { passive: 0.48, hostile: 0.18, skittish: 0.34 },
    maxHostileNormals: 3,
    requiredEvolution: 3,
    morphPool: [MORPH.VIRUS, MORPH.PHAGE, MORPH.VIRUS],
    boss: {
      name: "噬界母体",
      morph: MORPH.PHAGE,
      radius: 108,
      nuclei: 6,
      color: "#e07a6a",
      membrane: "#6a2020",
      spikes: 16,
    },
  },
];

export const WORLD = {
  width: 2600,
  height: 2600,
};

/** 性情：被动 / 固有攻击 / 被激怒后攻击 */
export const TEMPER = {
  PASSIVE: "passive",
  HOSTILE: "hostile",
  SKITTISH: "skittish",
};

/** 攻击性警告色（高对比警示） */
export const WARNING = {
  color: "#ff5a3c",
  membrane: "#8a2418",
  core: "#ffd2a8",
  stripe: "#ffc14a",
  calmPassive: "#7dceb8",
  calmSkittish: "#c9b86a",
};

/** 视差：下一层更慢，相对位移体现速度感 */
export const PARALLAX = {
  deep: 0.22,
  ghost: 0.42,
  mid: 0.68,
  current: 1,
};

export const PLAYER = {
  baseSpeed: 105,
  boostSpeed: 195,
  /** 基础加速时长；实际时长随进化等级提升 */
  boostDuration: 0.55,
  boostDurationPerEvo: 0.24,
  /** 加速能量回复满所需秒数（圆环自动回满） */
  boostRegenTime: 1.6,
  turnRate: 9,
  segmentSpacing: 11,
  /** 体型越大移动越慢：相对此参考半径缩放速度 */
  speedRefRadius: 18,
  minSpeedScale: 0.48,
  maxSpeedScale: 1.15,
  /** 核半径相对体半径比例；升级只改体半径，核随之等比放大 */
  nucleusRadiusFactor: 0.36,
  mouthDistFactor: 0.95,
  mouthRadiusFactor: 0.32,
  eatRangeBonus: 2,
  nucleusHurtCooldown: 0.9,
  /** 缺失细胞核时，吞噬这么多蛋白质可恢复 1 个核 */
  proteinPerNucleus: 7,
  /** 进化过渡时长（成长感） */
  evolveDuration: 2.35,
};

/** Boss 领地 */
export const BOSS_AI = {
  territoryRadius: 460,
  aggroRadius: 300,
  leashRadius: 520,
  returnSpeed: 1.15,
};
