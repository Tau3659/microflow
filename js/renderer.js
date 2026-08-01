import { MORPH, PARALLAX, WARNING } from "./config.js";
import { allMouthsWorldPos, isAggressive, nucleusWorldPos } from "./creature.js";

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
    /** 与玩家前进相反的背景飘移，强化速度感 */
    this.counterFlow = { x: 0, y: 0 };
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

  /** 双层背景：远处下一层 + 近处当前层；内容逆玩家方向飘动 */
  drawLayeredBackground(level, camera, flow) {
    const ctx = this.ctx;
    const layer = level.layer;
    const next = level.nextLayer;
    const fx = flow?.x || 0;
    const fy = flow?.y || 0;

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

    // 下一层雾团（慢视差 + 轻微逆向相对运动）
    if (level.deepField && next) {
      const deepCam = camOf(camera, PARALLAX.deep);
      ctx.save();
      ctx.globalAlpha = 0.22;
      for (const b of level.deepField.blobs) {
        const x = b.x - deepCam.x + fx * 0.22;
        const y = b.y - deepCam.y + fy * 0.22;
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
        const x = m.x - moteCam.x + fx * 0.35;
        const y = m.y - moteCam.y + fy * 0.35;
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

    // 当前层微粒：轻微逆向飘动，体现相对运动即可
    const midCam = camOf(camera, PARALLAX.mid);
    for (let i = 0; i < 40; i += 1) {
      const speed = 0.28 + (i % 5) * 0.08;
      let px = i * 211 + midCam.x * 0.35 + fx * speed;
      let py = i * 127 + midCam.y * 0.35 + fy * speed + Math.sin(this.time * 0.4 + i) * 6;
      px = ((px % (this.w + 50)) + (this.w + 50)) % (this.w + 50) - 25;
      py = ((py % (this.h + 50)) + (this.h + 50)) % (this.h + 50) - 25;
      ctx.fillStyle = hexToRgba(layer.protein, 0.1 + (i % 4) * 0.025);
      ctx.beginPath();
      ctx.arc(px, py, 1 + (i % 3) * 0.5, 0, Math.PI * 2);
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

  drawCilia(ctx, radius, alpha, density = 16) {
    ctx.strokeStyle = hexToRgba("#e8f4f2", alpha * 0.4);
    ctx.lineWidth = 1;
    const n = Math.max(10, density);
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n + this.time * 1.5;
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

  /** 随进化复杂度增加的细胞器 / 液泡 / 膜层细节 */
  drawComplexityDetails(ctx, creature, r, alpha, ghost) {
    if (ghost) return;
    const complexity = creature.complexity || 1;
    if (complexity < 2) return;

    const organelles = creature.organelles || 0;
    for (let i = 0; i < organelles; i += 1) {
      const a = (Math.PI * 2 * i) / Math.max(1, organelles) + creature.pulse * 0.08 + i * 0.4;
      const dist = r * (0.28 + (i % 3) * 0.12);
      const ox = Math.cos(a) * dist;
      const oy = Math.sin(a) * dist;
      const or = r * (0.08 + (i % 2) * 0.03);
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(creature.coreColor || "#e8f4f2", alpha * 0.35);
      ctx.ellipse(ox, oy, or * 1.35, or * 0.85, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = hexToRgba("#e8f4f2", alpha * 0.22);
      ctx.lineWidth = 0.9;
      ctx.ellipse(ox, oy, or * 1.35, or * 0.85, a, 0, Math.PI * 2);
      ctx.stroke();
    }

    const vacuoles = creature.vacuoles || 0;
    for (let i = 0; i < vacuoles; i += 1) {
      const a = (Math.PI * 2 * i) / Math.max(1, vacuoles) + 1.1;
      const dist = r * (0.18 + (i % 2) * 0.16);
      const vx = Math.cos(a) * dist * 0.7;
      const vy = Math.sin(a) * dist * 0.7;
      const vr = r * (0.12 + (i % 3) * 0.03);
      ctx.beginPath();
      ctx.fillStyle = hexToRgba("#ffffff", alpha * 0.08);
      ctx.strokeStyle = hexToRgba(creature.membrane || creature.color, alpha * 0.28);
      ctx.lineWidth = 1;
      ctx.arc(vx, vy, vr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const layers = creature.membraneLayers || 1;
    for (let L = 1; L < layers; L += 1) {
      ctx.beginPath();
      ctx.strokeStyle = hexToRgba(creature.membrane || creature.color, alpha * (0.18 + L * 0.06));
      ctx.lineWidth = 1 + L * 0.3;
      ctx.setLineDash(L > 1 ? [3, 4] : []);
      ctx.arc(0, 0, r * (0.72 + L * 0.12), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (complexity >= 4) {
      ctx.beginPath();
      ctx.strokeStyle = hexToRgba(creature.coreColor || "#e8f4f2", alpha * 0.18);
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i += 1) {
        const a0 = (Math.PI * 2 * i) / 5 + creature.pulse * 0.1;
        const a1 = a0 + 0.9;
        ctx.moveTo(Math.cos(a0) * r * 0.35, Math.sin(a0) * r * 0.35);
        ctx.quadraticCurveTo(0, 0, Math.cos(a1) * r * 0.55, Math.sin(a1) * r * 0.55);
      }
      ctx.stroke();
    }
  }

  drawMorphBody(creature, alpha = 1, ghost = false) {
    const ctx = this.ctx;
    const r = creature.radius * (1 + Math.sin(creature.pulse) * 0.03);
    const morph = creature.morph || MORPH.COCCUS;
    const complexity = creature.complexity || 1;
    const membrane = hexToRgba(creature.membrane || creature.color, alpha * (ghost ? 0.4 : 0.9));
    const core = hexToRgba(creature.coreColor || "#e8f4f2", alpha * (ghost ? 0.35 : 0.9));
    const bodyGrad = (x0, y0, rad) => {
      const g = ctx.createRadialGradient(x0 - rad * 0.35, y0 - rad * 0.4, rad * 0.1, x0, y0, rad);
      g.addColorStop(0, hexToRgba("#ffffff", alpha * (ghost ? 0.25 : 0.45)));
      g.addColorStop(0.35, hexToRgba(creature.color, alpha * (ghost ? 0.5 : 0.88)));
      g.addColorStop(1, hexToRgba(creature.membrane || creature.color, alpha * (ghost ? 0.25 : 0.75)));
      return g;
    };

    ctx.save();
    ctx.rotate(creature.angle);
    if (!ghost) {
      ctx.shadowColor = hexToRgba(creature.color, 0.35);
      ctx.shadowBlur = 12;
    }

    if (morph === MORPH.BACILLUS) {
      const aspect = creature.aspect || 2.25;
      const curve = creature.curve || 0;
      const w = r * aspect;
      const h = r * (creature.thin ? 0.72 : 1.08);
      ctx.beginPath();
      ctx.fillStyle = bodyGrad(0, 0, r * 1.2);
      ctx.strokeStyle = membrane;
      ctx.lineWidth = ghost ? 1 : 2;
      if (curve > 0.1) {
        // 弧菌样弯曲杆菌
        ctx.moveTo(-w / 2, 0);
        ctx.quadraticCurveTo(0, -h * (0.9 + curve), w / 2, 0);
        ctx.quadraticCurveTo(0, h * (0.9 + curve * 0.6), -w / 2, 0);
        ctx.closePath();
      } else if (typeof ctx.roundRect === "function") {
        ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
      } else {
        this._roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      }
      ctx.fill();
      ctx.stroke();
      if (creature.chain && !ghost) {
        ctx.shadowBlur = 0;
        for (let k = -1; k <= 1; k += 1) {
          if (k === 0) continue;
          ctx.beginPath();
          ctx.strokeStyle = hexToRgba(creature.membrane || creature.color, alpha * 0.35);
          ctx.ellipse(k * w * 0.28, 0, w * 0.16, h * 0.35, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (!ghost) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = hexToRgba(creature.coreColor, 0.22);
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.08, r * 0.4, r * 0.2, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      this.drawComplexityDetails(ctx, creature, r, alpha, ghost);
      this.drawFlagella(ctx, r, creature.flagella || 0, 1, alpha);
    } else if (morph === MORPH.SPIRILLUM) {
      ctx.shadowBlur = 0;
      ctx.lineCap = "round";
      const len = r * (creature.aspect || 2.7);
      const amp = r * (creature.thin ? 0.32 : 0.58);
      const thick = r * (creature.thin ? 0.28 : 0.62);
      ctx.strokeStyle = membrane;
      ctx.lineWidth = thick;
      ctx.beginPath();
      for (let i = 0; i <= 28; i += 1) {
        const t = i / 28;
        const x = (t - 0.5) * len;
        const y = Math.sin(t * Math.PI * 3.2 + creature.pulse) * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(creature.color, alpha * 0.9);
      ctx.lineWidth = thick * 0.68;
      ctx.stroke();
      this.drawFlagella(ctx, r * 0.8, creature.flagella || 0, 1, alpha);
    } else if (morph === MORPH.COLONY) {
      const cells = creature.colonyCells || 5;
      const pts = [];
      for (let i = 0; i < cells; i += 1) {
        const a = (Math.PI * 2 * i) / cells + creature.pulse * 0.05;
        const dist =
          creature.hollow && i === 0 ? 0 : i === 0 ? 0 : r * (0.48 + (i % 3) * 0.08);
        const cx = Math.cos(a) * dist;
        const cy = Math.sin(a) * dist;
        const cr = r * (i === 0 ? 0.5 : 0.36);
        pts.push({ cx, cy, cr });
      }
      if (!ghost && creature.cellBridges && pts.length > 1) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = hexToRgba(creature.membrane || creature.color, alpha * 0.35);
        ctx.lineWidth = Math.max(2, r * 0.08);
        for (let i = 1; i < pts.length; i += 1) {
          ctx.beginPath();
          ctx.moveTo(pts[0].cx, pts[0].cy);
          ctx.lineTo(pts[i].cx, pts[i].cy);
          ctx.stroke();
        }
        if (complexity >= 4) {
          for (let i = 1; i < pts.length; i += 1) {
            const j = i === pts.length - 1 ? 1 : i + 1;
            ctx.beginPath();
            ctx.strokeStyle = hexToRgba(creature.color, alpha * 0.2);
            ctx.lineWidth = Math.max(1.2, r * 0.045);
            ctx.moveTo(pts[i].cx, pts[i].cy);
            ctx.lineTo(pts[j].cx, pts[j].cy);
            ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.beginPath();
        ctx.fillStyle = bodyGrad(p.cx, p.cy, p.cr);
        ctx.strokeStyle = membrane;
        ctx.lineWidth = ghost ? 1 : 1.7;
        ctx.arc(p.cx, p.cy, p.cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (!ghost) {
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.fillStyle = hexToRgba(creature.coreColor, 0.4);
          ctx.arc(p.cx - p.cr * 0.15, p.cy - p.cr * 0.12, p.cr * 0.22, 0, Math.PI * 2);
          ctx.fill();
          if (complexity >= 3) {
            ctx.beginPath();
            ctx.strokeStyle = hexToRgba("#e8f4f2", 0.18);
            ctx.arc(p.cx, p.cy, p.cr * 0.72, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      this.drawComplexityDetails(ctx, creature, r * 0.75, alpha, ghost);
      if (creature.cilia) this.drawCilia(ctx, r * 1.05, alpha, 12 + complexity * 3);
    } else if (morph === MORPH.VIRUS) {
      ctx.beginPath();
      ctx.fillStyle = bodyGrad(0, 0, r * 0.9);
      ctx.strokeStyle = membrane;
      ctx.lineWidth = ghost ? 1 : 2;
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const facets = creature.capsidFacets || (complexity >= 4 ? 8 : 6);
      if (!ghost) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(creature.coreColor, 0.4);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < facets; i += 1) {
          const a = (Math.PI * 2 * i) / facets - Math.PI / 2;
          const x = Math.cos(a) * r * 0.52;
          const y = Math.sin(a) * r * 0.52;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        if (complexity >= 5) {
          ctx.beginPath();
          ctx.strokeStyle = hexToRgba(creature.membrane || creature.color, 0.3);
          for (let i = 0; i < facets; i += 1) {
            const a = (Math.PI * 2 * i) / facets - Math.PI / 2;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
          }
          ctx.stroke();
        }
      }
      const spikes = creature.spikes || 10;
      for (let i = 0; i < spikes; i += 1) {
        const a = (Math.PI * 2 * i) / spikes;
        const x0 = Math.cos(a) * r * 0.78;
        const y0 = Math.sin(a) * r * 0.78;
        const x1 = Math.cos(a) * r * 1.28;
        const y1 = Math.sin(a) * r * 1.28;
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(creature.color, alpha * 0.9);
        ctx.lineWidth = 2.4;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = core;
        ctx.shadowBlur = ghost ? 0 : 8;
        ctx.arc(x1, y1, Math.max(2.4, r * 0.13), 0, Math.PI * 2);
        ctx.fill();
        if (complexity >= 4 && i % 2 === 0) {
          ctx.beginPath();
          ctx.strokeStyle = hexToRgba(creature.coreColor, alpha * 0.45);
          ctx.lineWidth = 1.2;
          ctx.arc(x1, y1, Math.max(3.2, r * 0.2), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      this.drawComplexityDetails(ctx, creature, r * 0.7, alpha, ghost);
    } else if (morph === MORPH.PHAGE) {
      ctx.beginPath();
      ctx.fillStyle = bodyGrad(0, -r * 0.15, r * 0.75);
      ctx.strokeStyle = membrane;
      ctx.lineWidth = ghost ? 1 : 2;
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const x = Math.cos(a) * r * 0.72;
        const y = Math.sin(a) * r * 0.72 - r * 0.15;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (complexity >= 3) {
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(creature.coreColor, alpha * 0.35);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 6; i += 1) {
          const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42 - r * 0.15);
        }
        ctx.closePath();
        ctx.stroke();
      }
      const sheath = ctx.createLinearGradient(-r * 0.12, r * 0.3, r * 0.12, r * 1.2);
      sheath.addColorStop(0, hexToRgba(creature.color, alpha * 0.9));
      sheath.addColorStop(1, hexToRgba(creature.membrane || creature.color, alpha * 0.8));
      ctx.fillStyle = sheath;
      ctx.fillRect(-r * 0.13, r * 0.32, r * 0.26, r * 0.9);
      if (complexity >= 4) {
        ctx.strokeStyle = hexToRgba("#e8f4f2", alpha * 0.25);
        ctx.lineWidth = 1;
        for (let s = 0; s < 4; s += 1) {
          const sy = r * (0.4 + s * 0.2);
          ctx.beginPath();
          ctx.moveTo(-r * 0.13, sy);
          ctx.lineTo(r * 0.13, sy);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = hexToRgba(creature.color, alpha * 0.8);
      ctx.lineWidth = 1.6;
      const legs = complexity >= 4 ? 3 : 2;
      for (let i = -legs; i <= legs; i += 1) {
        ctx.beginPath();
        ctx.moveTo(0, r * 1.18);
        ctx.quadraticCurveTo(
          i * r * 0.38,
          r * 1.48,
          i * r * 0.58,
          r * 1.8 + Math.sin(this.time * 4 + i) * 2
        );
        ctx.stroke();
      }
    } else {
      // 球菌 / 变形虫 / 草履虫 / 硅藻 等
      const rx = r * (creature.elongate ? creature.aspect || 1.45 : creature.lobed ? 1.08 : 1);
      const ry = r * (creature.elongate ? 0.72 : creature.lobed ? 0.92 : 1);
      ctx.beginPath();
      ctx.fillStyle = bodyGrad(0, 0, r);
      ctx.strokeStyle = membrane;
      ctx.lineWidth = ghost ? 1 : 2.3;
      if (creature.lobed) {
        for (let i = 0; i < 8; i += 1) {
          const a = (Math.PI * 2 * i) / 8;
          const bump = 1 + Math.sin(creature.pulse * 2 + i) * 0.08;
          const x = Math.cos(a) * rx * bump;
          const y = Math.sin(a) * ry * bump;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      } else if (creature.facets) {
        const n = creature.facets;
        for (let i = 0; i < n; i += 1) {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          const x = Math.cos(a) * rx;
          const y = Math.sin(a) * ry;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      } else {
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      if (!ghost) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(creature.coreColor, 0.28);
        ctx.ellipse(0, 0, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.drawComplexityDetails(ctx, creature, r, alpha, ghost);
      if (creature.cilia) this.drawCilia(ctx, Math.max(rx, ry), alpha, 14 + complexity * 4);
    }

    // 荚膜外晕（玩家获得荚膜能力时）
    if (!ghost && creature.capsule > 0) {
      ctx.beginPath();
      ctx.strokeStyle = hexToRgba(creature.coreColor || "#e8f4f2", alpha * 0.18);
      ctx.lineWidth = 1.2 + creature.capsule * 0.4;
      ctx.arc(0, 0, r * (1.12 + creature.capsule * 0.04), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
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

  drawGhosts(ghosts, camera, world, flow) {
    if (!ghosts?.length) return;
    const ghostCam = camOf(camera, PARALLAX.ghost);
    const fx = (flow?.x || 0) * 0.28;
    const fy = (flow?.y || 0) * 0.28;
    const ctx = this.ctx;
    for (const g of ghosts) {
      const fade = Math.max(0, Math.min(1, g.alpha ?? 0));
      if (fade < 0.02) continue;
      forEachWrapDraw(g.x + fx, g.y + fy, ghostCam, world, this.w, this.h, 160, (x, y) => {
        const base = g.isBossSilhouette ? 0.18 : 0.13;
        const alpha = base * fade;
        ctx.save();
        ctx.translate(x, y);
        if (typeof ctx.filter !== "undefined") {
          ctx.filter = `blur(${(g.blur || 2.5) * (0.7 + (1 - fade) * 0.8)}px)`;
        }
        ctx.globalAlpha = Math.min(1, fade * 1.05);
        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, g.radius * 1.55);
        glow.addColorStop(0, hexToRgba(g.color, alpha * 1.35));
        glow.addColorStop(1, hexToRgba(g.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, g.radius * 1.55, 0, Math.PI * 2);
        ctx.fill();
        this.drawMorphBody(g, alpha + 0.06, true);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
        ctx.restore();
      });
    }
  }

  drawProteins(proteins, camera, world) {
    const ctx = this.ctx;
    for (const p of proteins) {
      forEachWrapDraw(p.x, p.y, camera, world, this.w, this.h, 24, (x, y) => {
        const pulse = 0.85 + Math.sin(this.time * 3.2 + p.phase) * 0.15;
        const g = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, p.r * pulse * 1.6);
        g.addColorStop(0, hexToRgba("#ffffff", 0.85));
        g.addColorStop(0.4, hexToRgba(p.color, 0.95));
        g.addColorStop(1, hexToRgba(p.color, 0));
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.arc(x, y, p.r * pulse, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.shadowBlur = 0;
  }

  /** 稀有能力掉落：菱形微光，区别于普通蛋白 */
  drawAbilities(abilities, camera, world) {
    if (!abilities?.length) return;
    const ctx = this.ctx;
    for (const a of abilities) {
      forEachWrapDraw(a.x, a.y, camera, world, this.w, this.h, 28, (x, y) => {
        const pulse = 0.9 + Math.sin(this.time * 5 + a.phase) * 0.12;
        const fade = Math.min(1, (a.life || 8) / 4);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.time * 1.6 + a.phase);
        ctx.scale(pulse, pulse);
        ctx.globalAlpha = 0.55 + fade * 0.4;
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, a.r * 1.8);
        g.addColorStop(0, hexToRgba("#ffffff", 0.75));
        g.addColorStop(0.45, hexToRgba(a.color, 0.85));
        g.addColorStop(1, hexToRgba(a.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -a.r);
        ctx.lineTo(a.r * 0.75, 0);
        ctx.lineTo(0, a.r);
        ctx.lineTo(-a.r * 0.75, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = hexToRgba("#ffffff", 0.45);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      });
    }
    ctx.globalAlpha = 1;
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
        // 若隐若现的半透明胞体
        const shimmer =
          0.58 +
          Math.sin(creature.pulse * 1.55) * 0.12 +
          Math.sin(this.time * 2.2 + (creature.id || 0) * 0.7) * 0.1;
        const bodyAlpha = (creature.kind === "player" ? 0.78 : 0.64) * shimmer;

        if (creature.kind === "player" && creature.boosting) {
          ctx.beginPath();
          ctx.strokeStyle = hexToRgba("#e8c27a", 0.28 * shimmer);
          ctx.lineWidth = 1.6;
          ctx.arc(0, 0, creature.radius * 1.35, 0, Math.PI * 2);
          ctx.stroke();
        }
        // 进化过渡：旧形态淡出、新形态淡入，体现成长而非瞬变
        if (creature.kind === "player" && creature.evolutionTween && creature.renderFrom) {
          const mix = creature.morphMix || 0;
          const from = { ...creature, ...creature.renderFrom, radius: creature.radius };
          const to = { ...creature, ...creature.renderTo, radius: creature.radius };
          this.drawMorphBody(from, (1 - mix) * bodyAlpha, false);
          this.drawMorphBody(to, mix * bodyAlpha, false);
        } else {
          this.drawMorphBody(creature, bodyAlpha, false);
        }
        ctx.restore();

        // 嘴：按形态多点布置（吞噬判定点）
        const mouths = allMouthsWorldPos(creature);
        for (let mi = 0; mi < mouths.length; mi += 1) {
          const mouth = mouths[mi];
          const mx = mouth.x + ox - camera.x;
          const my = mouth.y + oy - camera.y;
          ctx.save();
          ctx.translate(mx, my);
          ctx.rotate(mouth.facing || creature.angle);
          const open = 0.72 + Math.sin(creature.pulse * 2.4 + mi) * 0.22;
          const lip = ctx.createRadialGradient(-mouth.r * 0.2, 0, 1, 0, 0, mouth.r);
          lip.addColorStop(0, hexToRgba("#1a3036", 0.72));
          lip.addColorStop(0.55, hexToRgba("#031016", 0.65));
          lip.addColorStop(1, hexToRgba(creature.membrane || creature.color, 0.22));
          ctx.beginPath();
          ctx.fillStyle = lip;
          ctx.strokeStyle = hexToRgba(
            creature.kind === "player" ? "#e8c27a" : creature.coreColor || creature.color,
            (creature.kind === "player" ? 0.7 : 0.5) * shimmer
          );
          ctx.lineWidth = 1.5;
          ctx.ellipse(0, 0, mouth.r * open, mouth.r * 0.58, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        for (const n of creature.nuclei || []) {
          if (!n.alive) continue;
          const wp = nucleusWorldPos(creature, n);
          const nx = wp.x + ox - camera.x;
          const ny = wp.y + oy - camera.y;
          const pulse = 1 + Math.sin(creature.pulse + nx * 0.01) * 0.06;
          const nAlpha = 0.55 + shimmer * 0.35;
          const ng = ctx.createRadialGradient(nx - wp.r * 0.25, ny - wp.r * 0.25, 1, nx, ny, wp.r * 1.35);
          ng.addColorStop(0, hexToRgba("#ffffff", 0.55 * nAlpha));
          ng.addColorStop(0.35, hexToRgba(creature.coreColor, 0.75 * nAlpha));
          ng.addColorStop(1, hexToRgba(creature.coreColor, 0.02));
          ctx.beginPath();
          ctx.fillStyle = ng;
          ctx.shadowColor = creature.coreColor;
          ctx.shadowBlur = 10;
          ctx.arc(nx, ny, wp.r * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // 攻击性仅保留极淡色晕，去掉环与三角等非必要 UI
        if (isAggressive(creature) || creature.warning) {
          const flash = creature.provokeFlash > 0 ? 0.12 : 0;
          const g = ctx.createRadialGradient(
            headX,
            headY,
            creature.radius * 0.4,
            headX,
            headY,
            creature.radius * 1.35
          );
          g.addColorStop(0, hexToRgba(WARNING.color, 0.08 + flash));
          g.addColorStop(1, hexToRgba(WARNING.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(headX, headY, creature.radius * 1.35, 0, Math.PI * 2);
          ctx.fill();
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
      // 开启时用向上箭头符号形提示，无文字
      if (open) {
        ctx.beginPath();
        ctx.fillStyle = hexToRgba("#3ecfb0", 0.85);
        ctx.moveTo(x, y - r - 10);
        ctx.lineTo(x - 8, y - r + 4);
        ctx.lineTo(x + 8, y - r + 4);
        ctx.closePath();
        ctx.fill();
      }
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

  render(level, camera, canEvolve, portalOpen) {
    this.time += 0.016;
    const p = level.player;
    const world = level.world;

    // 背景轻微逆向相对运动（不宜晃动过猛）
    this.counterFlow.x -= p.vx * 0.012;
    this.counterFlow.y -= p.vy * 0.012;
    this.counterFlow.x *= 0.94;
    this.counterFlow.y *= 0.94;
    const maxFlow = 18;
    const fLen = Math.hypot(this.counterFlow.x, this.counterFlow.y);
    if (fLen > maxFlow) {
      this.counterFlow.x = (this.counterFlow.x / fLen) * maxFlow;
      this.counterFlow.y = (this.counterFlow.y / fLen) * maxFlow;
    }

    const flow = this.counterFlow;
    const deepCam = {
      x: camera.x * PARALLAX.deep,
      y: camera.y * PARALLAX.deep,
    };

    this.drawLayeredBackground(level, deepCam, flow);
    this.drawGhosts(level.ghosts, camera, world, flow);
    this.drawPortal(level.portal, camera, portalOpen, world);
    this.drawProteins(level.proteins, camera, world);
    this.drawAbilities(level.abilities, camera, world);
    this.drawDnas(level.dnas, camera, canEvolve, world);
    for (const c of level.creatures) this.drawCreature(c, camera, world);
    this.drawCreature(level.player, camera, world);
    this.drawParticles(level.particles, camera, world);
  }
}
