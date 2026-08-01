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
    mouths: 1,
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
    mouths: 1,
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
    mouths: 1,
    spikes: 14,
    organelles: 6,
    membraneLayers: 3,
    vacuoles: 2,
    capsidFacets: 8,
  },
];

/**
 * 稀有生物能力（参照真实微生物结构/功能）
 * dropRate 为单次击杀掉落基础概率，达 maxStacks 后不再掉落
 */
export const ABILITIES = {
  flagella: {
    id: "flagella",
    name: "鞭毛",
    maxStacks: 5,
    dropRate: 0.045,
    color: "#7dffd0",
    layers: [0, 1],
    /** 每层：移动速度 +6% */
  },
  cilia: {
    id: "cilia",
    name: "纤毛",
    maxStacks: 4,
    dropRate: 0.04,
    color: "#b8f0ef",
    layers: [1, 2],
  },
  cellWall: {
    id: "cellWall",
    name: "细胞壁",
    maxStacks: 3,
    dropRate: 0.035,
    color: "#c9e8a0",
    layers: [0, 1, 2],
  },
  buccal: {
    id: "buccal",
    name: "胞口",
    maxStacks: 4,
    dropRate: 0.035,
    color: "#e8c27a",
    layers: [1, 2, 3],
  },
  capsule: {
    id: "capsule",
    name: "荚膜",
    maxStacks: 3,
    dropRate: 0.03,
    color: "#a8d4ff",
    layers: [0, 1, 2],
  },
  gasVacuole: {
    id: "gasVacuole",
    name: "气泡",
    maxStacks: 3,
    dropRate: 0.028,
    color: "#d4f0ff",
    layers: [0, 1],
  },
  chromatophore: {
    id: "chromatophore",
    name: "载色体",
    maxStacks: 2,
    dropRate: 0.022,
    color: "#9be87a",
    layers: [1, 2],
  },
  spikeProtein: {
    id: "spikeProtein",
    name: "刺突",
    maxStacks: 3,
    dropRate: 0.032,
    color: "#e07a6a",
    layers: [3],
  },
  plasmid: {
    id: "plasmid",
    name: "质粒",
    maxStacks: 2,
    dropRate: 0.018,
    color: "#f0d7a0",
    layers: [0, 1, 2, 3],
  },
  endospore: {
    id: "endospore",
    name: "芽孢",
    maxStacks: 2,
    dropRate: 0.015,
    color: "#e8e0c8",
    layers: [0, 1],
  },
};

/** 真实微生物参考种：各层外观差异 */
export const SPECIES = {
  ecoli: {
    id: "ecoli",
    morph: MORPH.BACILLUS,
    flagella: 2,
    curve: 0,
    aspect: 2.35,
  },
  vibrio: {
    id: "vibrio",
    morph: MORPH.BACILLUS,
    flagella: 1,
    curve: 0.55,
    aspect: 2.1,
  },
  spirillum: {
    id: "spirillum",
    morph: MORPH.SPIRILLUM,
    flagella: 2,
    curve: 0,
    aspect: 2.8,
  },
  cyanobacteria: {
    id: "cyanobacteria",
    morph: MORPH.BACILLUS,
    flagella: 0,
    curve: 0,
    aspect: 2.6,
    chain: true,
    tint: "#4ecf9a",
  },
  amoeba: {
    id: "amoeba",
    morph: MORPH.COCCUS,
    cilia: false,
    lobed: true,
    aspect: 1.15,
  },
  paramecium: {
    id: "paramecium",
    morph: MORPH.COCCUS,
    cilia: true,
    elongate: true,
    aspect: 1.55,
  },
  euglena: {
    id: "euglena",
    morph: MORPH.SPIRILLUM,
    flagella: 1,
    chromatophore: true,
    aspect: 2.2,
  },
  diatom: {
    id: "diatom",
    morph: MORPH.COCCUS,
    facets: 6,
    aspect: 1.05,
    tint: "#8fd0c8",
  },
  volvox: {
    id: "volvox",
    morph: MORPH.COLONY,
    colonyCells: 9,
    cellBridges: true,
    hollow: true,
  },
  choano: {
    id: "choano",
    morph: MORPH.COLONY,
    colonyCells: 5,
    collar: true,
  },
  budding: {
    id: "budding",
    morph: MORPH.COLONY,
    colonyCells: 7,
    budding: true,
  },
  adenovirus: {
    id: "adenovirus",
    morph: MORPH.VIRUS,
    spikes: 12,
    capsidFacets: 8,
  },
  influenza: {
    id: "influenza",
    morph: MORPH.VIRUS,
    spikes: 16,
    envelope: true,
  },
  t4phage: {
    id: "t4phage",
    morph: MORPH.PHAGE,
    legs: 3,
  },
  filamentPhage: {
    id: "filamentPhage",
    morph: MORPH.SPIRILLUM,
    flagella: 0,
    thin: true,
    aspect: 3.2,
    tint: "#c4a0ff",
  },
};

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
    speciesPool: ["ecoli", "vibrio", "spirillum", "cyanobacteria", "ecoli"],
    boss: {
      name: "裂殖霸主",
      morph: MORPH.BACILLUS,
      species: "ecoli",
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
    speciesPool: ["amoeba", "paramecium", "euglena", "diatom", "paramecium"],
    boss: {
      name: "纤毛暴君",
      morph: MORPH.COCCUS,
      species: "paramecium",
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
    speciesPool: ["volvox", "choano", "budding", "volvox", "amoeba"],
    boss: {
      name: "群核巨兽",
      morph: MORPH.COLONY,
      species: "volvox",
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
    speciesPool: ["adenovirus", "influenza", "t4phage", "filamentPhage", "adenovirus"],
    boss: {
      name: "噬界母体",
      morph: MORPH.PHAGE,
      species: "t4phage",
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

/** 玩家品牌色：升级只变形态/体型，颜色始终一致 */
export const PLAYER_LOOK = {
  color: "#3ecfb0",
  coreColor: "#9be8d6",
  membrane: "#1a6b62",
};

export const PLAYER = {
  baseSpeed: 120,
  boostSpeed: 210,
  /** 相对玩家常速，其他生物速度上限（略慢以便追逐/逃脱） */
  npcSpeedFactor: 0.86,
  bossSpeedFactor: 0.9,
  /** 满能量可按住加速的时长；随进化提升 */
  boostDuration: 0.85,
  boostDurationPerEvo: 0.28,
  /** 加速能量从空回复满所需秒数 */
  boostRegenTime: 1.85,
  turnRate: 9,
  segmentSpacing: 11,
  /** 体型越大移动越慢：相对此参考半径缩放速度 */
  speedRefRadius: 18,
  minSpeedScale: 0.55,
  maxSpeedScale: 1.12,
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
