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
    /** 相对当前画面拉近，圈里菌体更大 */
    this.viewZoom = 1.3;
  }

  /** 镜圈：竖屏左右窄黑边，底拇指区不压控件 */
  slideMetrics() {
    const w = this.w;
    const h = this.h;
    const topBar = 52;
    const controls = document.getElementById("controls");
    let thumbZone = h > w ? h * 0.33 : 148;
    if (controls && !controls.classList.contains("hidden")) {
      const top = controls.getBoundingClientRect().top;
      if (controls.getBoundingClientRect().height > 0) {
        thumbZone = Math.max(96, h - top);
      }
    }
    const playH = Math.max(80, h - topBar - thumbZone);
    const cx = w * 0.5;
    const cy = topBar + playH * 0.5;
    const r = Math.min(w * 0.5 - 8, playH * 0.5);
    return { cx, cy, r, topBar, thumbZone, playH };
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

    // 浅景深：大块失焦菌影
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 7; i += 1) {
      const bx = ((i * 347 + this.time * 12 + fx * 0.15) % (this.w + 160)) - 80;
      const by = ((i * 211 + this.time * 8 + fy * 0.12) % (this.h + 160)) - 80;
      const br = 28 + (i % 4) * 18;
      const bg = ctx.createRadialGradient(bx, by, 2, bx, by, br);
      bg.addColorStop(0, hexToRgba(layer.accent, 0.07));
      bg.addColorStop(1, hexToRgba(layer.accent, 0));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 载玻片镜圈：圈外实黑、厚玻璃沿、红青色散 */
  drawSlideVignette() {
    const ctx = this.ctx;
    const { cx, cy, r } = this.slideMetrics();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.w, this.h);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fillStyle = "#031016";
    ctx.fill("evenodd");

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(186, 224, 220, 0.28)";
    ctx.lineWidth = 11;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(224, 90, 106, 0.45)";
    ctx.lineWidth = 3;
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(62, 207, 176, 0.45)";
    ctx.lineWidth = 3;
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.stroke();

    const vg = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r);
    vg.addColorStop(0, "rgba(3,16,22,0)");
    vg.addColorStop(1, "rgba(3,16,22,0.08)");
    ctx.beginPath();
    ctx.fillStyle = vg;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

  drawCilia(ctx, radius, alpha, density = 24) {
    ctx.strokeStyle = hexToRgba("#e8f4f2", alpha * 0.4);
    ctx.lineWidth = 1;
    const n = Math.max(24, density);
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
      g.addColorStop(0, hexToRgba("#ffffff", alpha * (ghost ? 0.22 : 0.55)));
      g.addColorStop(0.4, hexToRgba(creature.coreColor || creature.color, alpha * (ghost ? 0.42 : 0.85)));
      g.addColorStop(1, hexToRgba(creature.membrane || creature.color, alpha * (ghost ? 0.22 : 0.7)));
      return g;
    };

    ctx.save();
    ctx.rotate(creature.angle);
    const isPlayer = creature.kind === "player";
    if (!ghost && isPlayer) {
      ctx.shadowColor = hexToRgba(creature.color, 0.55);
      ctx.shadowBlur = 22;
    } else {
      ctx.shadowBlur = 0;
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
      if (creature.cilia || creature.kind === "player") this.drawCilia(ctx, r * 1.05, alpha, creature.kind === "player" ? Math.max(24, 12 + complexity * 3) : 12 + complexity * 3);
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
      if (creature.cilia || creature.kind === "player") this.drawCilia(ctx, Math.max(rx, ry), alpha, creature.kind === "player" ? Math.max(24, 14 + complexity * 4) : 14 + complexity * 4);
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

  /** 按技能功能绘制图标（不只是色块） */
  drawAbilityGlyph(ctx, abilityId, color, r) {
    ctx.strokeStyle = hexToRgba("#ffffff", 0.75);
    ctx.fillStyle = hexToRgba(color, 0.95);
    ctx.lineWidth = Math.max(1.4, r * 0.1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (abilityId) {
      case "flagella": {
        // 鞭毛：波浪尾，暗示加速
        ctx.beginPath();
        ctx.moveTo(-r * 0.15, 0);
        for (let i = 0; i <= 8; i += 1) {
          const t = i / 8;
          ctx.lineTo(t * r * 0.95, Math.sin(t * Math.PI * 2.2) * r * 0.28);
        }
        ctx.strokeStyle = hexToRgba(color, 0.95);
        ctx.lineWidth = r * 0.16;
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = hexToRgba("#ffffff", 0.85);
        ctx.arc(-r * 0.28, 0, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "cilia": {
        // 纤毛：短毛环，暗示转向灵活
        for (let i = 0; i < 12; i += 1) {
          const a = (Math.PI * 2 * i) / 12;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.28, Math.sin(a) * r * 0.28);
          ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
          ctx.strokeStyle = hexToRgba(color, 0.9);
          ctx.lineWidth = r * 0.1;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.fillStyle = hexToRgba("#ffffff", 0.8);
        ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "cellWall": {
        // 细胞壁：六边形外壳，暗示防护
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (Math.PI * 2 * i) / 6 - Math.PI / 6;
          const px = Math.cos(a) * r * 0.78;
          const py = Math.sin(a) * r * 0.78;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.35);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(color, 0.95);
        ctx.lineWidth = r * 0.18;
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba("#ffffff", 0.55);
        ctx.lineWidth = r * 0.08;
        ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "buccal": {
        // 胞口：张开的嘴，暗示吞噬
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(color, 0.9);
        ctx.ellipse(0, 0, r * 0.82, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "rgba(3,16,22,0.72)";
        ctx.ellipse(0, 0, r * 0.48, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba("#ffffff", 0.65);
        ctx.lineWidth = r * 0.1;
        ctx.arc(0, 0, r * 0.7, 0.2, Math.PI - 0.2);
        ctx.stroke();
        break;
      }
      case "polyMouth": {
        // 裂口：多张小嘴，暗示嘴数量+1
        for (let i = 0; i < 3; i += 1) {
          const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
          const cx = Math.cos(a) * r * 0.42;
          const cy = Math.sin(a) * r * 0.42;
          ctx.beginPath();
          ctx.fillStyle = hexToRgba(color, 0.9);
          ctx.ellipse(cx, cy, r * 0.32, r * 0.2, a, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = "rgba(3,16,22,0.7)";
          ctx.ellipse(cx, cy, r * 0.16, r * 0.1, a, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "capsule": {
        // 荚膜：双层软膜，暗示减伤
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(color, 0.45);
        ctx.lineWidth = r * 0.22;
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(color, 0.95);
        ctx.lineWidth = r * 0.12;
        ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = hexToRgba("#ffffff", 0.55);
        ctx.arc(-r * 0.15, -r * 0.12, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "gasVacuole": {
        // 气泡：三泡上浮，暗示加速续航
        const bubbles = [
          [0, r * 0.15, r * 0.42],
          [-r * 0.38, -r * 0.25, r * 0.26],
          [r * 0.34, -r * 0.38, r * 0.22],
        ];
        for (const [bx, by, br] of bubbles) {
          ctx.beginPath();
          ctx.fillStyle = hexToRgba(color, 0.55);
          ctx.strokeStyle = hexToRgba("#ffffff", 0.7);
          ctx.lineWidth = r * 0.08;
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.fillStyle = hexToRgba("#ffffff", 0.55);
          ctx.arc(bx - br * 0.28, by - br * 0.28, br * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "chromatophore": {
        // 载色体：叶绿体瓣，暗示汲取/吸引
        for (let i = 0; i < 5; i += 1) {
          const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          ctx.beginPath();
          ctx.fillStyle = hexToRgba(color, 0.85);
          ctx.ellipse(
            Math.cos(a) * r * 0.28,
            Math.sin(a) * r * 0.28,
            r * 0.34,
            r * 0.18,
            a,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.beginPath();
        ctx.fillStyle = hexToRgba("#ffffff", 0.75);
        ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "spikeProtein": {
        // 刺突：放射尖刺，暗示攻击加成
        for (let i = 0; i < 8; i += 1) {
          const a = (Math.PI * 2 * i) / 8;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
          ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
          ctx.strokeStyle = hexToRgba(color, 0.95);
          ctx.lineWidth = r * 0.12;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.fillStyle = hexToRgba("#ffffff", 0.8);
        ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "plasmid": {
        // 质粒：小环 DNA，暗示蛋白收益
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(color, 0.95);
        ctx.lineWidth = r * 0.14;
        ctx.ellipse(0, 0, r * 0.62, r * 0.4, -0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.42, r * 0.26, 0.5, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "endospore": {
        // 芽孢：厚壁核心，暗示更快修核
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(color, 0.4);
        ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(color, 0.95);
        ctx.lineWidth = r * 0.16;
        ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = hexToRgba("#ffffff", 0.85);
        ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default: {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** 稀有能力掉落：更大，带功能图标 */
  drawAbilities(abilities, camera, world) {
    if (!abilities?.length) return;
    const ctx = this.ctx;
    for (const a of abilities) {
      forEachWrapDraw(a.x, a.y, camera, world, this.w, this.h, 48, (x, y) => {
        const pulse = 0.92 + Math.sin(this.time * 4.2 + a.phase) * 0.1;
        const fade = Math.min(1, (a.life || 8) / 4);
        const r = a.r;
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = 0.65 + fade * 0.35;

        // 底盘光晕
        const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.65);
        g.addColorStop(0, hexToRgba(a.color, 0.35));
        g.addColorStop(0.55, hexToRgba(a.color, 0.16));
        g.addColorStop(1, hexToRgba(a.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.65, 0, Math.PI * 2);
        ctx.fill();

        // 圆形底板
        ctx.beginPath();
        ctx.fillStyle = "rgba(3, 16, 22, 0.55)";
        ctx.strokeStyle = hexToRgba(a.color, 0.85);
        ctx.lineWidth = 2;
        ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 功能图标（缓慢自转，便于辨认）
        ctx.save();
        ctx.rotate(this.time * 0.7 + a.phase * 0.2);
        ctx.scale(pulse, pulse);
        this.drawAbilityGlyph(ctx, a.abilityId, a.color, r * 0.72);
        ctx.restore();

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
        const isPlayer = creature.kind === "player";
        const bodyAlpha = isPlayer ? 0.82 * shimmer : 0.45;
        if (!isPlayer) ctx.filter = "blur(1.4px)";

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
        if (isPlayer) {
          const r = creature.radius;
          ctx.beginPath();
          ctx.strokeStyle = hexToRgba(creature.membrane || creature.color, 0.5 * shimmer);
          ctx.lineWidth = 3.5;
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.strokeStyle = hexToRgba(creature.coreColor || "#9be8d6", 0.72 * shimmer);
          ctx.lineWidth = 2;
          ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
          ctx.stroke();
          const nr = r * 0.28;
          const ng = ctx.createRadialGradient(-nr * 0.4, -nr * 0.45, 0, 0, 0, nr);
          ng.addColorStop(0, "rgba(255,255,255,0.88)");
          ng.addColorStop(0.45, hexToRgba(creature.coreColor, 0.9));
          ng.addColorStop(1, hexToRgba(creature.membrane || creature.color, 0.3));
          ctx.beginPath();
          ctx.fillStyle = ng;
          ctx.arc(-nr * 0.08, -nr * 0.1, nr, 0, Math.PI * 2);
          ctx.fill();
          const spec = ctx.createRadialGradient(-r * 0.35, -r * 0.42, 0, 0, 0, r * 1.05);
          spec.addColorStop(0, "rgba(255,255,255,0.38)");
          spec.addColorStop(0.28, "rgba(155,232,214,0.12)");
          spec.addColorStop(1, "rgba(255,255,255,0)");
          ctx.beginPath();
          ctx.fillStyle = spec;
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
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
    const color = portal.color || "#3ecfb0";
    forEachWrapDraw(portal.x, portal.y, camera, world, this.w, this.h, 120, (x, y) => {
      const pulse = 1 + Math.sin(portal.pulse * 2.8) * 0.08;
      const r = portal.r * pulse;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(portal.pulse * (portal.dir === "up" ? -0.45 : 0.5));
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.strokeStyle = open
          ? hexToRgba(color, 0.55 - i * 0.14)
          : "rgba(232,244,242,0.14)";
        ctx.lineWidth = 2;
        ctx.ellipse(0, 0, r * (1 + i * 0.2), r * (0.55 + i * 0.08), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (open) {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
        g.addColorStop(0, hexToRgba(color, 0.28));
        g.addColorStop(1, hexToRgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  /** 屏幕边缘弱提示：传送门方向（颜色随入口/出口） */
  drawPortalEdgeHint(portal, camera, open) {
    if (!portal || !open) return;
    const sx = portal.x - camera.x;
    const sy = portal.y - camera.y;
    const margin = 28;
    const onScreen =
      sx > margin && sy > margin && sx < this.w - margin && sy < this.h - margin;
    if (onScreen) return;

    const color = portal.color || "#3ecfb0";
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const dx = sx - cx;
    const dy = sy - cy;
    const ang = Math.atan2(dy, dx);
    const edgePad = 18;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const tx = cos > 0 ? (this.w - edgePad - cx) / cos : cos < 0 ? (edgePad - cx) / cos : Infinity;
    const ty = sin > 0 ? (this.h - edgePad - cy) / sin : sin < 0 ? (edgePad - cy) / sin : Infinity;
    const t = Math.min(Math.abs(tx), Math.abs(ty));
    const ex = cx + cos * t;
    const ey = cy + sin * t;
    const pulse = 0.35 + Math.sin(this.time * 3.2) * 0.12;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = hexToRgba(color, 0.55);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = hexToRgba(color, 0.35);
    ctx.lineWidth = 1.5;
    ctx.arc(-2, 0, 14, -0.9, 0.9);
    ctx.stroke();
    ctx.restore();
  }

  drawTransition(alpha, accent = "#3ecfb0") {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    const a = Math.max(0, Math.min(1, alpha));
    ctx.save();
    // 过门：色温罩 + 浅景深暗角（青门冷、琥珀门暖）
    ctx.fillStyle = hexToRgba(accent, a * 0.18);
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = `rgba(3, 16, 22, ${a * 0.78})`;
    ctx.fillRect(0, 0, this.w, this.h);
    const g = ctx.createRadialGradient(
      this.w * 0.5,
      this.h * 0.45,
      8,
      this.w * 0.5,
      this.h * 0.5,
      Math.max(this.w, this.h) * 0.55
    );
    g.addColorStop(0, hexToRgba(accent, 0.42 * a));
    g.addColorStop(0.4, hexToRgba(accent, 0.12 * a));
    g.addColorStop(1, "rgba(3,16,22,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    const vig = ctx.createRadialGradient(
      this.w * 0.5,
      this.h * 0.5,
      Math.min(this.w, this.h) * 0.18,
      this.w * 0.5,
      this.h * 0.5,
      Math.max(this.w, this.h) * 0.72
    );
    vig.addColorStop(0, "rgba(3,16,22,0)");
    vig.addColorStop(1, `rgba(3, 16, 22, ${0.55 * a})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.w, this.h);
    // 漂浮微粒
    for (let i = 0; i < 24; i += 1) {
      const px = ((i * 97 + this.time * 40 * (1 + (i % 3))) % (this.w + 40)) - 20;
      const py = ((i * 53 + this.time * 28) % (this.h + 40)) - 20;
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(accent, 0.15 * a * (0.4 + (i % 4) * 0.15));
      ctx.arc(px, py, 1.2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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

  render(level, camera, canEvolve, portalOpen, transitionAlpha = 0, transitionAccent = null, zoom = 1) {
    this.time += 0.016;
    const p = level.player;
    const world = level.world;
    const z = zoom || 1;
    const slide = this.slideMetrics();
    if (z !== 1) {
      this.ctx.save();
      this.ctx.translate(slide.cx, slide.cy);
      this.ctx.scale(z, z);
      this.ctx.translate(-slide.cx, -slide.cy);
    }

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
    if (level.exitPortal) {
      this.drawPortal(level.exitPortal, camera, true, world);
    }
    this.drawProteins(level.proteins, camera, world);
    this.drawAbilities(level.abilities, camera, world);
    this.drawDnas(level.dnas, camera, canEvolve, world);
    for (const c of level.creatures) this.drawCreature(c, camera, world);
    this.drawCreature(level.player, camera, world);
    this.drawParticles(level.particles, camera, world);
    this.drawPortalEdgeHint(level.portal, camera, portalOpen);
    if (level.exitPortal) {
      this.drawPortalEdgeHint(level.exitPortal, camera, true);
    }
    if (transitionAlpha > 0) {
      this.drawTransition(
        transitionAlpha,
        transitionAccent || level.layer?.accent || "#3ecfb0"
      );
    }
    if (z !== 1) this.ctx.restore();
    this.drawSlideVignette();
  }
}
