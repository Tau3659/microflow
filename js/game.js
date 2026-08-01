import { EVOLUTIONS, PLAYER } from "./config.js";
import {
  updatePlayer,
  updateEnemy,
  updateGhost,
  beginEvolution,
  updateEvolution,
  restoreOneNucleus,
  provokeCreature,
  panicFlee,
  isAggressive,
  aliveNuclei,
  nucleusWorldPos,
  anyMouthTouchesNucleus,
  anyMouthTouchesPoint,
  boostRingRatio,
  wrapEntity,
  wrappedOffset,
} from "./creature.js";
import {
  createLevel,
  spawnBurst,
  decomposeCreature,
  maintainPickups,
  ecosystemProtein,
} from "./world.js";
import { grantAbility } from "./abilities.js";
import { Renderer } from "./renderer.js";
import { Input } from "./input.js";
import { audio } from "./audio.js";

export class Game {
  constructor({ canvas, controlsRoot, hud, overlay }) {
    this.canvas = canvas;
    this.hud = hud;
    this.overlay = overlay;
    this.renderer = new Renderer(canvas);
    this.input = new Input(controlsRoot);
    this.level = null;
    this.camera = { x: 0, y: 0 };
    this.running = false;
    this.ended = false;
    this.raf = 0;
    this.last = 0;
    this.playerState = {
      evolutionId: 0,
      points: 0,
      evolvedThisLayer: false,
      abilities: null,
    };
    this.runStats = {
      maxLayer: 0,
      creaturesEaten: 0,
      proteinsEaten: 0,
    };
    this.onStateChange = null;
    this.transition = null;
  }

  _resetRunStats(layerIndex = 0) {
    this.runStats = {
      maxLayer: Math.max(0, layerIndex | 0),
      creaturesEaten: 0,
      proteinsEaten: 0,
    };
  }

  getRunStats() {
    const layer = this.level?.layerIndex ?? this.runStats.maxLayer;
    return {
      layer: Math.max(this.runStats.maxLayer, layer),
      /** 展示用：从 1 起算 */
      layerDisplay: Math.max(this.runStats.maxLayer, layer) + 1,
      creaturesEaten: this.runStats.creaturesEaten,
      proteinsEaten: Math.round(this.runStats.proteinsEaten),
    };
  }

  init() {
    this.renderer.resize();
    this.input.bind();
    window.addEventListener("resize", () => this.renderer.resize());
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.renderer.resize(), 120);
    });
  }

  start(layerIndex = 0, resetProgress = true) {
    if (resetProgress) {
      this.playerState = {
        evolutionId: 0,
        points: 0,
        evolvedThisLayer: false,
        abilities: null,
      };
      this._resetRunStats(layerIndex);
    }
    this.transition = null;
    audio.setThreatLevel(0, 0);
    this.level = createLevel(layerIndex, this.playerState);
    this.runStats.maxLayer = Math.max(this.runStats.maxLayer, layerIndex);
    this.ended = false;
    this.running = true;
    this._centerCamera(true);
    this._updateHud();
    this.overlay.hide();
    this.hud.show();
    this.input.show();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this._loop(t));
    this.onStateChange?.("playing");
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.hide();
  }

  goHome() {
    this.stop();
    this.transition = null;
    audio.setThreatLevel(0, 0);
    this.hud.hide();
    this.overlay.hide();
    this.onStateChange?.("title");
  }

  _centerCamera(hard = false) {
    const targetX = this.level.player.x - this.renderer.w * 0.5;
    const targetY = this.level.player.y - this.renderer.h * 0.48;
    if (hard) {
      this.camera.x = targetX;
      this.camera.y = targetY;
      return;
    }
    this.camera.x += (targetX - this.camera.x) * 0.14;
    this.camera.y += (targetY - this.camera.y) * 0.14;
  }

  _canEvolve() {
    const evo = EVOLUTIONS[this.level.player.evolutionId];
    return this.level.points >= evo.pointsToEvolve && evo.pointsToEvolve !== Infinity;
  }

  _portalOpen() {
    // 无限流：进化后或本层蛋白质吃光即可进入下一层
    return this.level.evolvedThisLayer || this.level.proteinsExhausted;
  }

  _updateHud() {
    const player = this.level.player;
    this.hud.setInfo({
      boostReady: !player.boostLocked && (player.boostCharge ?? 0) > 0.02,
      boosting: !!player.boosting,
      boostLocked: !!player.boostLocked,
      boostRatio: boostRingRatio(player),
    });
  }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.033, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this._update(dt);
    const tr = this.transition;
    const trAlpha = tr ? (tr.phase === "out" ? tr.t : 1 - tr.t) : 0;
    this.renderer.render(
      this.level,
      this.camera,
      this._canEvolve(),
      this._portalOpen(),
      trAlpha,
      tr?.accent || null
    );
    this.raf = requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    if (this.ended) return;
    if (this._updateTransition(dt)) return;

    const level = this.level;
    const player = level.player;

    updatePlayer(player, this.input, dt);
    if (player.evolutionTween) updateEvolution(player, dt);
    const wrap = wrapEntity(player, level.world);
    // 环面穿越时同步相机，避免“撞墙感”
    this.camera.x += wrap.wx;
    this.camera.y += wrap.wy;

    for (const c of level.creatures) {
      updateEnemy(c, player, dt, level.world, level.proteins);
    }
    for (const g of level.ghosts || []) {
      updateGhost(g, dt, level.world);
    }

    this._collectPickups(dt);
    this._npcEatProteins();
    this._checkProteinExhausted();
    this._resolveNucleusCombat();
    this._updateVfx(dt);
    this._updatePortal(dt);
    this._updateThreatAudio();

    maintainPickups(level);
    this.playerState.points = level.points;
    this.playerState.evolutionId = player.evolutionId;
    this.playerState.evolvedThisLayer = level.evolvedThisLayer;
    this.playerState.abilities = { ...(player.abilities || {}) };
    this._centerCamera(false);
    this._updateHud();
  }

  /** 蛋白质增益：修核优先，否则计入进化点数 */
  _applyProteinGain(rawValue, burstX, burstY, burstColor) {
    const level = this.level;
    const player = level.player;
    const proteinValue = player.mods?.proteinValue || 1;
    const recoverNeed = player.mods?.recoverNeed || PLAYER.proteinPerNucleus;
    const missing = player.nuclei.length - aliveNuclei(player).length;
    const gained = rawValue * proteinValue;
    level.proteinConsumed += rawValue;
    this.runStats.proteinsEaten += rawValue;
    spawnBurst(level, burstX, burstY, burstColor, 4);
    if (missing > 0) {
      player.recoverProgress = (player.recoverProgress || 0) + gained;
      if (player.recoverProgress >= recoverNeed) {
        player.recoverProgress -= recoverNeed;
        if (restoreOneNucleus(player)) {
          spawnBurst(level, player.x, player.y, player.coreColor, 14);
        }
      }
    } else {
      level.points += gained;
    }
  }

  _collectPickups(dt = 0.016) {
    const level = this.level;
    const player = level.player;
    const world = level.world;
    const magnet = player.mods?.proteinMagnet || 0;

    for (let i = level.proteins.length - 1; i >= 0; i -= 1) {
      const p = level.proteins[i];
      p.phase += 0.05;
      if (magnet > 0) {
        const off = wrappedOffset(player.x, player.y, p.x, p.y, world);
        if (off.dist < 40 + magnet && off.dist > 1) {
          p.x -= (off.dx / off.dist) * magnet * 0.35;
          p.y -= (off.dy / off.dist) * magnet * 0.35;
        }
      }
      if (!anyMouthTouchesPoint(player, p.x, p.y, p.r, world, 1)) continue;
      level.proteins.splice(i, 1);
      this._applyProteinGain(p.value, p.x, p.y, p.color);
    }

    // 稀有能力拾取
    if (level.abilities?.length) {
      for (let i = level.abilities.length - 1; i >= 0; i -= 1) {
        const a = level.abilities[i];
        a.phase += 0.06;
        a.life -= dt;
        if (a.life <= 0) {
          level.abilities.splice(i, 1);
          continue;
        }
        if (!anyMouthTouchesPoint(player, a.x, a.y, a.r, world, 3)) continue;
        if (grantAbility(player, a.abilityId)) {
          spawnBurst(level, a.x, a.y, a.color, 16);
          spawnBurst(level, player.x, player.y, player.coreColor, 10);
        }
        level.abilities.splice(i, 1);
      }
    }

    for (let i = level.dnas.length - 1; i >= 0; i -= 1) {
      const d = level.dnas[i];
      d.phase += 0.04;
      if (!anyMouthTouchesPoint(player, d.x, d.y, d.r, world, 2)) continue;
      level.dnas.splice(i, 1);
      // DNA 也算蛋白质；可进化时额外触发进化
      this._applyProteinGain(d.value || 2, d.x, d.y, d.color);
      if (this._canEvolve() && !player.evolutionTween) {
        this._evolve();
        break;
      }
    }
  }

  _npcEatProteins() {
    const level = this.level;
    const world = level.world;
    for (const c of level.creatures) {
      if (!c.alive) continue;
      for (let i = level.proteins.length - 1; i >= 0; i -= 1) {
        const p = level.proteins[i];
        if (!anyMouthTouchesPoint(c, p.x, p.y, p.r, world, 1)) continue;
        c.storedProtein = (c.storedProtein || 0) + p.value;
        spawnBurst(level, p.x, p.y, p.color, 3);
        level.proteins.splice(i, 1);
      }
    }
  }

  _checkProteinExhausted() {
    const level = this.level;
    if (level.proteinsExhausted) return;
    if (ecosystemProtein(level) > 0) return;
    level.proteinsExhausted = true;
    spawnBurst(level, level.player.x, level.player.y, level.layer.accent, 20);
    if (level.portal) level.portal.open = true;
  }

  _evolve() {
    const level = this.level;
    const player = level.player;
    if (player.evolutionTween) return;
    const next = player.evolutionId + 1;
    if (next >= EVOLUTIONS.length) return;

    const evo = EVOLUTIONS[next];
    beginEvolution(player, next);
    level.points = 0;
    level.evolvedThisLayer = true;
    spawnBurst(level, player.x, player.y, evo.color, 22);
    spawnBurst(level, player.x, player.y, player.coreColor || evo.coreColor, 16);
    audio.playEvolve();

    if (level.portal) level.portal.open = true;
  }

  _updateThreatAudio() {
    const level = this.level;
    const player = level.player;
    let nearestHostile = Infinity;
    let nearestBoss = Infinity;
    for (const c of level.creatures) {
      if (!c.alive) continue;
      const d = wrappedOffset(player.x, player.y, c.x, c.y, level.world).dist;
      if (c.kind === "boss") {
        if (d < nearestBoss) nearestBoss = d;
        continue;
      }
      if (!isAggressive(c)) continue;
      if (d < nearestHostile) nearestHostile = d;
    }
    const hostileRange = 380;
    const bossRange = 520;
    const hostileThreat =
      nearestHostile < hostileRange
        ? Math.pow(1 - nearestHostile / hostileRange, 1.35)
        : 0;
    // Boss 领地更大、曲线更陡，近身时明显压迫
    let bossThreat = 0;
    if (nearestBoss < bossRange) {
      const t = 1 - nearestBoss / bossRange;
      bossThreat = Math.pow(t, 1.1);
      if (nearestBoss < 220) bossThreat = Math.min(1, bossThreat + 0.2);
    }
    audio.setThreatLevel(hostileThreat, bossThreat);
  }

  /** @returns {boolean} true 表示本帧跳过常规更新 */
  _updateTransition(dt) {
    const tr = this.transition;
    if (!tr) return false;
    audio.setThreatLevel(0, 0);
    tr.t += dt / tr.duration;
    if (tr.phase === "out") {
      if (tr.t >= 1) {
        tr.t = 0;
        tr.phase = "in";
        this.playerState.evolvedThisLayer = false;
        this.level = createLevel(tr.nextLayer, this.playerState);
        this.runStats.maxLayer = Math.max(this.runStats.maxLayer, tr.nextLayer);
        this._centerCamera(true);
        audio.playPortalCue();
      }
      return true;
    }
    // fade in
    if (tr.t >= 1) {
      this.transition = null;
      return false;
    }
    // 淡入期间仍可轻微更新视觉，但冻结玩法
    return true;
  }

  _beginLayerTransition(nextLayer, accent) {
    if (this.transition) return;
    this.transition = {
      phase: "out",
      t: 0,
      duration: 0.7,
      nextLayer,
      accent: accent || null,
    };
    // 返回上一层时清空本层进度标记；createLevel 会重刷 NPC / 蛋白
    this.playerState.evolvedThisLayer = false;
    this.playerState.points = this.level?.points ?? this.playerState.points;
    audio.playPortalCue();
  }

  _resolveNucleusCombat() {
    const level = this.level;
    const player = level.player;
    const world = level.world;
    if (!player.alive) return;

    if (aliveNuclei(player).length === 0) {
      player.alive = false;
      this._end("end");
      return;
    }

    for (let i = level.creatures.length - 1; i >= 0; i -= 1) {
      const enemy = level.creatures[i];
      if (!enemy.alive) continue;

      // 只有玩家的嘴碰到敌方细胞核，才算吃掉
      if ((enemy.nucleusIframes || 0) <= 0) {
        for (const n of enemy.nuclei) {
          if (!n.alive) continue;
          const eN = nucleusWorldPos(enemy, n);
          if (
          anyMouthTouchesNucleus(
            player,
            eN,
            world,
            PLAYER.eatRangeBonus + (player.mods?.eatBonus || 0)
          )
        ) {
            n.alive = false;
            spawnBurst(level, eN.x, eN.y, enemy.coreColor, 8);
            panicFlee(enemy, player, world);
            if (provokeCreature(enemy)) {
              spawnBurst(level, enemy.x, enemy.y, "#ff5a3c", 12);
            }
            break;
          }
        }
      }

      if (aliveNuclei(enemy).length === 0) {
        enemy.alive = false;
        decomposeCreature(level, enemy);
        this.runStats.creaturesEaten += 1;
        if (enemy.kind === "boss") {
          level.bossDefeated = true;
          level.points += 8;
        } else {
          level.points += 3;
        }
        level.creatures.splice(i, 1);
        continue;
      }

      // 仅攻击性生物会用嘴吞噬玩家细胞核
      if (player.invuln > 0 || !isAggressive(enemy)) continue;
      let hit = false;
      for (const pn of aliveNuclei(player)) {
        if (hit) break;
        const pN = nucleusWorldPos(player, pn);
        if (anyMouthTouchesNucleus(enemy, pN, world, PLAYER.eatRangeBonus)) {
          pn.alive = false;
          player.invuln =
            PLAYER.nucleusHurtCooldown * (player.mods?.hurtCooldown || 1);
          spawnBurst(level, pN.x, pN.y, "#e07a6a", 14);
          hit = true;
        }
      }

      if (aliveNuclei(player).length === 0) {
        player.alive = false;
        this._end("end");
        return;
      }
    }
  }

  _updateVfx(dt) {
    const level = this.level;
    for (let i = level.particles.length - 1; i >= 0; i -= 1) {
      const p = level.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      if (p.life <= 0) level.particles.splice(i, 1);
    }
  }

  _updatePortal(dt) {
    const level = this.level;
    const player = level.player;

    if (level.portal) {
      level.portal.pulse += dt;
      level.portal.open = this._portalOpen();
      if (level.portal.open) {
        const dist = wrappedOffset(
          player.x,
          player.y,
          level.portal.x,
          level.portal.y,
          level.world
        ).dist;
        if (dist < level.portal.r) {
          this._beginLayerTransition(level.layerIndex + 1, level.portal.color);
          return;
        }
      }
    }

    // 上一层出口：始终开启；进入后 createLevel 重置 NPC 与蛋白质
    if (level.exitPortal && level.layerIndex > 0) {
      level.exitPortal.pulse += dt;
      level.exitPortal.open = true;
      const distUp = wrappedOffset(
        player.x,
        player.y,
        level.exitPortal.x,
        level.exitPortal.y,
        level.world
      ).dist;
      if (distUp < level.exitPortal.r) {
        this._beginLayerTransition(level.layerIndex - 1, level.exitPortal.color);
      }
    }
  }

  _end(kind = "end") {
    this.ended = true;
    this.input.hide();
    if (this.level) {
      this.runStats.maxLayer = Math.max(
        this.runStats.maxLayer,
        this.level.layerIndex
      );
    }
    this.overlay.show(kind, this.getRunStats());
    this.onStateChange?.("overlay");
  }
}
