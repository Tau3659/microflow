import { EVOLUTIONS, MORPH, PARALLAX } from "./config.js";
import { aliveNuclei, nucleusWorldPos } from "./creature.js";

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function camOf(camera, factor) {
  return { x: camera.x * factor, y: camera.y * factor };
}

/** 环面地图：在边界附近绘制镜像副本，消除接缝 */
function forEachWrapDraw(x, y, camera, world, viewW, viewH, margin, fn) {
  const offsetsX = [0];
  const offsetsY = [0];
  if (world) {
    offsetsX.push(-world.width, world.width);
    offsetsY.push(-world.height, world.height);
  }
  for (const ox of offsetsX) {
    for (const oy of offsetsY) {
      const sx = x + ox - camera.x;
      const sy = y + oy - camera.y;
      if (sx < -margin || sy < -margin || sx > viewW + margin || sy > viewH + margin) {
        continue;
      }
      fn(sx, sy, ox, oy);
    }
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.time = 0;
    /** 由速度累积的额外视差偏移，强化两层相对位移 */
    this.motion = { x: 0, y: 0 };
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** 双层背景：远处下一层 + 近处当前层 */
  drawLayeredBackground(level, camera) {
    const ctx = this.ctx;
    const layer = level.layer;
    const next = level.nextLayer;

    // 底层：下一层色调（更深）
    const deep = ctx.createLinearGradient(0, 0, 0, this.h);
    if (next) {
      deep.addColorStop(0, next.bgBottom);
      deep.addColorStop(0.55, next.bgTop);
      deep.addColorStop(1, layer.bgBottom);
    } else {
      deep.addColorStop(0, layer.bgTop);
      deep.addColorStop(1, layer.bgBottom);
    }
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, this.w, this.h);

    // 下一层雾团（慢视差）
    if (level.deepField && next) {
      const deepCam = camOf(camera, PARALLAX.deep);
      ctx.save();
      ctx.globalAlpha = 0.22;
      for (const b of level.deepField.blobs) {
        const x = b.x - deepCam.x;
        const y = b.y - deepCam.y;
        if (x < -150 || y < -150 || x > this.w + 150 || y > this.h + 150) continue;
        const pulse = 1 + Math.sin(this.time * 0.7 + b.phase) * 0.08;
        const g = ctx.createRadialGradient(x, y, 2, x, y, b.r * pulse);
        g.addColorStop(0, hexToRgba(next.accent, 0.35));
        g.addColorStop(1, hexToRgba(next.bgTop, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, b.r * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const moteCam = camOf(camera, PARALLAX.deep * 1.15);
      for (const m of level.deepField.motes) {
        const x = m.x - moteCam.x;
        const y = m.y - moteCam.y;
        if (x < -10 || y < -10 || x > this.w + 10 || y > this.h + 10) continue;
        ctx.fillStyle = hexToRgba(m.color, 0.18 + Math.sin(this.time + m.phase) * 0.06);
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 当前层渐变罩
    const near = ctx.createLinearGradient(0, 0, 0, this.h);
    near.addColorStop(0, hexToRgba(layer.bgTop, 0.42));
    near.addColorStop(0.45, hexToRgba(layer.bgTop, 0.12));
    near.addColorStop(1, hexToRgba(layer.bgBottom, 0.55));
    ctx.fillStyle = near;
    ctx.fillRect(0, 0, this.w, this.h);

    // 当前层微粒（中速视差）
    const midCam = camOf(camera, PARALLAX.mid);
    for (let i = 0; i < 36; i += 1) {
      const px = ((i * 211 + midCam.x * 0.35) % (this.w + 50)) - 25;
      const py = ((i * 127 + midCam.y * 0.35 + Math.sin(this.time * 0.4 + i) * 10) % (this.h + 50)) - 25;
      ctx.fillStyle = hexToRgba(layer.protein, 0.1 + (i % 4) * 0.02);
      ctx.beginPath();
      ctx.arc(px, py, 1 + (i % 3) * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // 景深暗角
    const vignette = ctx.createRadialGradient(
      this.w * 0.5,
      this.h * 0.48,
      this.h * 0.1,
      this.w * 0.5,
      this.h * 0.5,
      this.h * 0.92
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawFlagella(ctx, radius, count, pulse, alpha) {
    if (!count) return;
    ctx.strokeStyle = hexToRgba("#e8f4f2", alpha * 0.55);
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    for (let i = 0; i < count; i += 1) {
      const base = Math.PI + (i - (count - 1) / 2) * 0.35;
      ctx.beginPath();
      ctx.moveTo(Math.cos(base) * radius * 0.7, Math.sin(base) * radius * 0.35);
      for (let s = 1; s <= 8; s += 1) {
        const t = s / 8;
        const x = Math.cos(base) * radius * (0.7 + t * 1.4);
        const y =
          Math.sin(base) * radius * (0.35 + t * 0.2) +
          Math.sin(this.time * 6 + i + t * 8) * 3.5 * pulse;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  drawCilia(ctx, radius, alpha) {
    ctx.strokeStyle = hexToRgba("#e8f4f2", alpha * 0.4);
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i += 1) {
      const a = (Math.PI * 2 * i) / 16 + this.time * 1.5;
      const wobble = Math.sin(this.time * 8 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.92, Math.sin(a) * radius * 0.92);
      ctx.lineTo(
        Math.cos(a) * (radius * 1.28 + wobble),
        Math.sin(a) * (radius * 1.28 + wobble)
      );
      ctx.stroke();
    }
  }

  drawMorphBody(creature, alpha = 1, ghost = false) {
    const ctx = this.ctx;
    const r = creature.radius * (1 + Math.sin(creature.pulse) * 0.03);
    const morph = creature.morph || MORPH.COCCUS;
    const fill = hexToRgba(creature.color, alpha * (ghost ? 0.55 : 0.85));
    const membrane = hexToRgba(creature.membrane || creature.color, alpha * (ghost ? 0.4 : 0.9));
    const core = hexToRgba(creature.coreColor || "#e8f4f2", alpha * (ghost ? 0.35 : 0.9));

    ctx.save();
    ctx.rotate(creature.angle);

    if (morph === MORPH.BACILLUS) {
      // 杆菌：圆角长杆
      const w = r * 2.2;
      const h = r * 1.05;
      ctx.beginPath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = membrane;
      ctx.lineWidth = ghost ? 1 : 2;
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
      } else {
        this._roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      }
      ctx.fill();
      ctx.stroke();
      // 细胞质纹理
      if (!ghost) {
        ctx.fillStyle = hexToRgba(creature.coreColor, 0.25);
        ctx.beginPath();
        ctx.ellipse(-r * 0.25, 0, r * 0.35, r * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      this.drawFlagella(ctx, r, creature.flagella || 1, 1, alpha);
    } else if (morph === MORPH.SPIRILLUM) {
      // 螺旋菌
      ctx.strokeStyle = fill;
      ctx.lineWidth = r * 0.55;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i <= 24; i += 1) {
        const t = i / 24;
        const x = (t - 0.5) * r * 2.6;
        const y = Math.sin(t * Math.PI * 3 + creature.pulse) * r * 0.55;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = membrane;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      this.drawFlagella(ctx, r * 0.8, creature.flagella || 1, 1, alpha);
    } else if (morph === MORPH.COLONY) {
      // 多细胞集群
      const cells = creature.colonyCells || 5;
      for (let i = 0; i < cells; i += 1) {
        const a = (Math.PI * 2 * i) / cells + creature.pulse * 0.05;
        const dist = i === 0 ? 0 : r * (0.45 + (i % 3) * 0.08);
        const cx = Math.cos(a) * dist;
        const cy = Math.sin(a) * dist;
        const cr = r * (i === 0 ? 0.48 : 0.34);
        ctx.beginPath();
        ctx.fillStyle = fill;
        ctx.strokeStyle = membrane;
        ctx.lineWidth = ghost ? 1 : 1.6;
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (!ghost) {
          ctx.beginPath();
          ctx.fillStyle = core;
          ctx.arc(cx, cy, cr * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (morph === MORPH.VIRUS) {
      // 囊膜病毒 + 刺突蛋白
      ctx.beginPath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = membrane;
      ctx.lineWidth = ghost ? 1 : 2;
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const spikes = creature.spikes || 10;
      for (let i = 0; i < spikes; i += 1) {
        const a = (Math.PI * 2 * i) / spikes;
        const x0 = Math.cos(a) * r * 0.78;
        const y0 = Math.sin(a) * r * 0.78;
        const x1 = Math.cos(a) * r * 1.25;
        const y1 = Math.sin(a) * r * 1.25;
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(creature.color, alpha * 0.85);
        ctx.lineWidth = 2.2;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = core;
        ctx.arc(x1, y1, Math.max(2.2, r * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
      if (!ghost) {
        // 二十面体感的内壳
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(creature.coreColor, 0.35);
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i += 1) {
          const a = (Math.PI * 2 * i) / 6;
          const x = Math.cos(a) * r * 0.45;
          const y = Math.sin(a) * r * 0.45;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    } else if (morph === MORPH.PHAGE) {
      // 噬菌体：二十面体头 + 尾鞘 + 尾丝
      ctx.beginPath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = membrane;
      ctx.lineWidth = ghost ? 1 : 2;
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const x = Math.cos(a) * r * 0.7;
        const y = Math.sin(a) * r * 0.7 - r * 0.15;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 尾鞘
      ctx.fillStyle = membrane;
      ctx.fillRect(-r * 0.12, r * 0.35, r * 0.24, r * 0.85);
      // 尾丝
      ctx.strokeStyle = hexToRgba(creature.color, alpha * 0.75);
      ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(0, r * 1.15);
        ctx.quadraticCurveTo(
          i * r * 0.35,
          r * 1.45,
          i * r * 0.55,
          r * 1.75 + Math.sin(this.time * 4 + i) * 2
        );
        ctx.stroke();
      }
    } else {
      // 球菌 / 真核单细胞
      ctx.beginPath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = membrane;
      ctx.lineWidth = ghost ? 1 : 2.2;
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!ghost) {
        // 细胞膜双层感
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(creature.coreColor, 0.25);
        ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
        ctx.stroke();
        // 细胞器
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(creature.coreColor, 0.35);
        ctx.ellipse(r * 0.2, -r * 0.15, r * 0.22, r * 0.14, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (creature.cilia) this.drawCilia(ctx, r, alpha);
    }

    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, rad) {
    const r = Math.min(rad, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  drawGhosts(ghosts, camera, world) {
    if (!ghosts?.length) return;
    const ghostCam = camOf(camera, PARALLAX.ghost);
    const ctx = this.ctx;
    for (const g of ghosts) {
      forEachWrapDraw(g.x, g.y, ghostCam, world, this.w, this.h, 140, (x, y) => {
        const alpha = g.isBossSilhouette ? 0.16 : 0.12;
        ctx.save();
        ctx.translate(x, y);
        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, g.radius * 1.4);
        glow.addColorStop(0, hexToRgba(g.color, alpha * 1.4));
        glow.addColorStop(1, hexToRgba(g.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, g.radius * 1.4, 0, Math.PI * 2);
        ctx.fill();
        this.drawMorphBody(g, alpha + 0.08, true);
        ctx.restore();
      });
    }
  }

  drawProteins(proteins, camera, world) {
    const ctx = this.ctx;
    for (const p of proteins) {
      forEachWrapDraw(p.x, p.y, camera, world, this.w, this.h, 24, (x, y) => {
        const pulse = 0.85 + Math.sin(this.time * 3.2 + p.phase) * 0.15;
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(p.color, 0.9);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.arc(x, y, p.r * pulse, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.shadowBlur = 0;
  }

  drawDnas(dnas, camera, canEvolve, world) {
    const ctx = this.ctx;
    for (const d of dnas) {
      forEachWrapDraw(d.x, d.y, camera, world, this.w, this.h, 36, (x, y) => {
        const pulse = 1 + Math.sin(this.time * 4 + d.phase) * 0.08;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.time * 1.2 + d.phase);
        ctx.scale(pulse, pulse);
        ctx.shadowColor = d.color;
        ctx.shadowBlur = canEvolve ? 16 : 6;
        ctx.strokeStyle = hexToRgba(d.color, canEvolve ? 0.95 : 0.4);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = -8; i <= 8; i += 1) {
          const t = i / 8;
          const px = t * d.r;
          const py = Math.sin(t * Math.PI * 2) * d.r * 0.45;
          if (i === -8) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let i = -8; i <= 8; i += 1) {
          const t = i / 8;
          const px = t * d.r;
          const py = -Math.sin(t * Math.PI * 2) * d.r * 0.45;
          if (i === -8) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        if (canEvolve) {
          ctx.fillStyle = hexToRgba(d.color, 0.2);
          ctx.beginPath();
          ctx.arc(0, 0, d.r * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
    }
    ctx.shadowBlur = 0;
  }

  drawCreature(creature, camera, world) {
    const ctx = this.ctx;

    forEachWrapDraw(
      creature.x,
      creature.y,
      camera,
      world,
      this.w,
      this.h,
      200,
      (headX, headY, ox, oy) => {
        ctx.save();
        ctx.translate(headX, headY);
        if (creature.kind === "player" && creature.boostTimer > 0) {
          ctx.beginPath();
          ctx.strokeStyle = hexToRgba("#e8c27a", 0.45);
          ctx.lineWidth = 2;
          ctx.arc(0, 0, creature.radius * 1.4, 0, Math.PI * 2);
          ctx.stroke();
        }
        this.drawMorphBody(creature, creature.kind === "player" ? 1 : 0.92, false);
        ctx.restore();

        for (const n of creature.nuclei || []) {
          if (!n.alive) continue;
          const wp = nucleusWorldPos(creature, n);
          const nx = wp.x + ox - camera.x;
          const ny = wp.y + oy - camera.y;
          const pulse = 1 + Math.sin(creature.pulse) * 0.05;
          ctx.beginPath();
          ctx.fillStyle = hexToRgba(creature.coreColor, 0.95);
          ctx.shadowColor = creature.coreColor;
          ctx.shadowBlur = 12;
          ctx.arc(nx, ny, wp.r * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = hexToRgba("#031016", 0.55);
          ctx.shadowBlur = 0;
          ctx.arc(nx, ny, wp.r * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }

        if (creature.kind === "boss") {
          // 淡淡领地圈，提示不会无限追杀
          if (creature.homeX != null) {
            const hx = creature.homeX + ox - camera.x;
            const hy = creature.homeY + oy - camera.y;
            ctx.beginPath();
            ctx.strokeStyle = hexToRgba(creature.color, 0.12);
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 8]);
            ctx.arc(hx, hy, creature.territoryRadius || 460, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.beginPath();
          ctx.strokeStyle = hexToRgba(creature.color, 0.45);
          ctx.lineWidth = 1.5;
          ctx.arc(headX, headY, creature.radius * 1.35, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = hexToRgba("#e8f4f2", 0.7);
          ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(creature.name, headX, headY - creature.radius - 16);
          const state =
            creature.aiState === "chase"
              ? "警戒"
              : creature.aiState === "return"
                ? "归巢"
                : "巡逻";
          ctx.fillText(
            `核 ${aliveNuclei(creature).length} · ${state}`,
            headX,
            headY - creature.radius - 3
          );
        }

        if (creature.kind === "player") {
          const evo = EVOLUTIONS[creature.evolutionId];
          if (evo && evo.complexity >= 2) {
            ctx.beginPath();
            ctx.strokeStyle = hexToRgba(creature.membrane || creature.color, 0.25);
            ctx.lineWidth = 1;
            ctx.arc(headX, headY, creature.radius * 1.15, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        ctx.shadowBlur = 0;
      }
    );
  }

  drawPortal(portal, camera, open, world) {
    if (!portal) return;
    const ctx = this.ctx;
    forEachWrapDraw(portal.x, portal.y, camera, world, this.w, this.h, 120, (x, y) => {
      const pulse = 1 + Math.sin(portal.pulse * 2.8) * 0.08;
      const r = portal.r * pulse;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(portal.pulse * 0.5);
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.strokeStyle = open
          ? hexToRgba("#3ecfb0", 0.6 - i * 0.15)
          : "rgba(232,244,242,0.18)";
        ctx.lineWidth = 2;
        ctx.ellipse(0, 0, r * (1 + i * 0.2), r * (0.55 + i * 0.08), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (open) {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
        g.addColorStop(0, "rgba(62,207,176,0.35)");
        g.addColorStop(1, "rgba(62,207,176,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = open ? "rgba(232,244,242,0.8)" : "rgba(232,244,242,0.35)";
      ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(open ? "进入上一层生物圈" : "进化后开启", x, y + r + 18);
    });
  }

  drawParticles(particles, camera, world) {
    const ctx = this.ctx;
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      forEachWrapDraw(p.x, p.y, camera, world, this.w, this.h, 20, (x, y) => {
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(p.color, a);
        ctx.arc(x, y, p.r * a, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  drawFloats(floats, camera, world) {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
    for (const f of floats) {
      const a = Math.max(0, f.life / f.maxLife);
      forEachWrapDraw(f.x, f.y, camera, world, this.w, this.h, 30, (x, y) => {
        ctx.fillStyle = hexToRgba(f.color, a);
        ctx.fillText(f.text, x, y - (1 - a) * 28);
      });
    }
  }

  render(level, camera, canEvolve, portalOpen) {
    this.time += 0.016;
    const p = level.player;
    const world = level.world;
    // 移动越快，深层与幽灵层相对滑动越明显
    this.motion.x += p.vx * 0.012;
    this.motion.y += p.vy * 0.012;
    this.motion.x *= 0.985;
    this.motion.y *= 0.985;

    const deepShift = {
      x: camera.x + this.motion.x * 1.8,
      y: camera.y + this.motion.y * 1.8,
    };
    const ghostShift = {
      x: camera.x + this.motion.x * 1.15,
      y: camera.y + this.motion.y * 1.15,
    };

    this.drawLayeredBackground(level, deepShift);
    this.drawGhosts(level.ghosts, ghostShift, world);
    this.drawPortal(level.portal, camera, portalOpen, world);
    this.drawProteins(level.proteins, camera, world);
    this.drawDnas(level.dnas, camera, canEvolve, world);
    for (const c of level.creatures) this.drawCreature(c, camera, world);
    this.drawCreature(level.player, camera, world);
    this.drawParticles(level.particles, camera, world);
    this.drawFloats(level.floats, camera, world);
  }
}
