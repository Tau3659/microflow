import { DEPTHS, PLAYER, WORLD } from "./config.js";
import {
  updatePlayer,
  updateNpc,
  grow,
  shrink,
} from "./creature.js";
import {
  createLevel,
  spawnBurst,
  spawnFoodNear,
  maintainPopulation,
  canDescend,
} from "./world.js";
import { Renderer } from "./renderer.js";
import { Input } from "./input.js";

export class Game {
  constructor({ canvas, hud, overlay }) {
    this.canvas = canvas;
    this.hud = hud;
    this.overlay = overlay;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.level = null;
    this.camera = { x: 0, y: 0 };
    this.running = false;
    this.ended = false;
    this.raf = 0;
    this.last = 0;
    this.idleHintTimer = 0;
    this.onStateChange = null;
  }

  init() {
    this.renderer.resize();
    this.input.bind();
    window.addEventListener("resize", () => this.renderer.resize());
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.renderer.resize(), 120);
    });
  }

  start(depthIndex = 0, carryMass = PLAYER.startMass) {
    this.level = createLevel(depthIndex, carryMass);
    this.ended = false;
    this.running = true;
    this.idleHintTimer = 0;
    this._centerCamera(true);
    this._updateHud();
    this.overlay.hide();
    this.hud.show();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this._loop(t));
    this.onStateChange?.("playing");
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  goHome() {
    this.stop();
    this.hud.hide();
    this.overlay.hide();
    this.onStateChange?.("title");
  }

  _centerCamera(hard = false) {
    const targetX = this.level.player.x - this.renderer.w * 0.5;
    const targetY = this.level.player.y - this.renderer.h * 0.45;
    if (hard) {
      this.camera.x = targetX;
      this.camera.y = targetY;
      return;
    }
    this.camera.x += (targetX - this.camera.x) * 0.12;
    this.camera.y += (targetY - this.camera.y) * 0.12;
  }

  _clampPlayer() {
    const p = this.level.player;
    p.x = Math.max(30, Math.min(WORLD.width - 30, p.x));
    p.y = Math.max(30, Math.min(WORLD.height - 30, p.y));
  }

  _updateHud() {
    const depth = this.level.depth;
    this.hud.setDepth(depth.name);
    this.hud.setMass(this.level.player.mass);
  }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.033, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this._update(dt);
    const open = canDescend(this.level);
    if (this.level.portal) this.level.portal.open = open;
    this.renderer.render(this.level, this.camera, this.input, open);
    this.raf = requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    if (this.ended) return;
    const level = this.level;
    const player = level.player;

    if (!this.input.active) {
      this.idleHintTimer += dt;
      this.hud.setIdleHint(this.idleHintTimer > 1.2);
    } else {
      this.idleHintTimer = 0;
      this.hud.setIdleHint(false);
    }

    updatePlayer(player, this.input, this.camera, dt);
    this._clampPlayer();

    for (const c of level.creatures) {
      updateNpc(c, player, level.foods, dt, level.world);
    }

    // foods
    for (let i = level.foods.length - 1; i >= 0; i -= 1) {
      const f = level.foods[i];
      f.phase += dt;
      if (Math.hypot(f.x - player.x, f.y - player.y) < player.radius + f.r) {
        grow(player, 0.08);
        spawnBurst(level, f.x, f.y, f.color, 5);
        level.foods.splice(i, 1);
        continue;
      }
      for (const c of level.creatures) {
        if (Math.hypot(f.x - c.x, f.y - c.y) < c.radius + f.r) {
          grow(c, 0.05);
          level.foods.splice(i, 1);
          break;
        }
      }
    }

    // creature interactions with player
    for (let i = level.creatures.length - 1; i >= 0; i -= 1) {
      const c = level.creatures[i];
      const dist = Math.hypot(c.x - player.x, c.y - player.y);
      const touch = dist < player.radius * 0.85 + c.radius * 0.85;
      if (!touch) continue;

      if (player.mass > c.mass * (1 / PLAYER.eatRatio)) {
        grow(player, c.mass * 0.45);
        spawnBurst(level, c.x, c.y, c.hue, 14);
        spawnFoodNear(level, c.x, c.y, 2);
        level.creatures.splice(i, 1);
      } else if (c.mass > player.mass * (1 / PLAYER.eatRatio) && player.hurtTimer <= 0) {
        if (c.mass > player.mass * 1.8) {
          this._gameOver("被吞噬了", "更大的生命吞没了你。从表层再次启程？");
          spawnBurst(level, player.x, player.y, player.hue, 20);
          return;
        }
        shrink(player, Math.min(player.mass * 0.28, c.mass * 0.2));
        spawnBurst(level, player.x, player.y, "#e07a6a", 10);
        // knockback
        const nx = (player.x - c.x) / (dist || 1);
        const ny = (player.y - c.y) / (dist || 1);
        player.x += nx * 28;
        player.y += ny * 28;
      }
    }

    // npc eat each other lightly
    for (let i = 0; i < level.creatures.length; i += 1) {
      for (let j = i + 1; j < level.creatures.length; j += 1) {
        const a = level.creatures[i];
        const b = level.creatures[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d >= a.radius * 0.8 + b.radius * 0.8) continue;
        if (a.mass > b.mass * 1.25) {
          grow(a, b.mass * 0.3);
          level.creatures.splice(j, 1);
          j -= 1;
        } else if (b.mass > a.mass * 1.25) {
          grow(b, a.mass * 0.3);
          level.creatures.splice(i, 1);
          i -= 1;
          break;
        }
      }
    }

    // particles
    for (let i = level.particles.length - 1; i >= 0; i -= 1) {
      const p = level.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.life <= 0) level.particles.splice(i, 1);
    }

    if (level.portal) {
      level.portal.pulse += dt;
      if (canDescend(level)) {
        const d = Math.hypot(player.x - level.portal.x, player.y - level.portal.y);
        if (d < level.portal.r * 0.85) {
          this._descend();
          return;
        }
      }
    }

    maintainPopulation(level);
    this._centerCamera(false);
    this._updateHud();

    // win at abyss bottom with huge mass
    if (
      level.depthIndex === DEPTHS.length - 1 &&
      player.mass >= 48
    ) {
      this._gameOver(
        "成为主宰",
        `你在渊底成长到质量 ${player.mass.toFixed(0)}，微观之海因你而颤动。`
      );
    }
  }

  _descend() {
    const next = this.level.depthIndex + 1;
    if (next >= DEPTHS.length) return;
    const carry = this.level.player.mass * 0.72;
    spawnBurst(this.level, this.level.player.x, this.level.player.y, "#3ecfb0", 24);
    this.start(next, Math.max(2, carry));
  }

  _gameOver(title, text) {
    this.ended = true;
    this.hud.setIdleHint(false);
    this.overlay.show(title, text);
    this.onStateChange?.("overlay");
  }
}
