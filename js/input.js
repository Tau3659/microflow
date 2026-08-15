/**
 * 左侧虚拟摇杆只改方向 + 右侧加速键按住释放
 * 不要全屏点拖。桌面 WASD / 空格兜底。
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.root = canvas?.parentElement || document.getElementById("app");
    this.dirX = 0;
    this.dirY = 0;
    this.pull = 0;
    this.boostPressed = false;
    this.aimX = 0;
    this.aimY = 0;
    this._bound = false;
    this._padPointer = null;
    this._boostPointer = null;
    this._boostHeld = false;
    this._space = false;
    this._keyX = 0;
    this._keyY = 0;
    this.pad = this.root?.querySelector("#virtual-pad") || null;
    this.knob = this.root?.querySelector("#virtual-knob") || null;
    this.boostBtn = this.root?.querySelector("#btn-boost") || null;
    this.controls = this.root?.querySelector("#controls") || null;
  }

  get moving() {
    return Math.hypot(this.dirX, this.dirY) > 0.12;
  }

  bind() {
    if (this._bound) return;
    this._bound = true;

    if (this.pad) {
      const onPadDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._padPointer = e.pointerId;
        this.pad.classList.add("active");
        try {
          this.pad.setPointerCapture?.(e.pointerId);
        } catch {
          // ignore
        }
        this._updatePad(e.clientX, e.clientY);
      };
      const onPadMove = (e) => {
        if (this._padPointer !== e.pointerId) return;
        e.preventDefault();
        this._updatePad(e.clientX, e.clientY);
      };
      const onPadUp = (e) => {
        if (this._padPointer != null && e.pointerId !== this._padPointer) return;
        this._padPointer = null;
        this.dirX = 0;
        this.dirY = 0;
        this.pull = 0;
        this.pad.classList.remove("active");
        if (this.knob) this.knob.style.transform = "translate(-50%, -50%)";
      };
      this.pad.addEventListener("pointerdown", onPadDown, { passive: false });
      this.pad.addEventListener("pointermove", onPadMove, { passive: false });
      this.pad.addEventListener("pointerup", onPadUp);
      this.pad.addEventListener("pointercancel", onPadUp);
      this.pad.addEventListener("lostpointercapture", onPadUp);
    }

    const el = this.canvas;
    const killPinch = (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    };
    el.addEventListener("touchstart", killPinch, { passive: false });
    el.addEventListener("touchmove", killPinch, { passive: false });
    window.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
    window.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
    window.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") this._keyY = -1;
      if (e.code === "ArrowDown" || e.code === "KeyS") this._keyY = 1;
      if (e.code === "ArrowLeft" || e.code === "KeyA") this._keyX = -1;
      if (e.code === "ArrowRight" || e.code === "KeyD") this._keyX = 1;
      if (e.code === "Space" || e.code === "ShiftLeft") {
        e.preventDefault();
        this._space = true;
      }
      this._normalizeKeys();
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") if (this._keyY < 0) this._keyY = 0;
      if (e.code === "ArrowDown" || e.code === "KeyS") if (this._keyY > 0) this._keyY = 0;
      if (e.code === "ArrowLeft" || e.code === "KeyA") if (this._keyX < 0) this._keyX = 0;
      if (e.code === "ArrowRight" || e.code === "KeyD") if (this._keyX > 0) this._keyX = 0;
      if (e.code === "Space" || e.code === "ShiftLeft") this._space = false;
      this._normalizeKeys();
    });
  }

  _normalizeKeys() {
    const len = Math.hypot(this._keyX, this._keyY);
    if (len > 1) {
      this._keyX /= len;
      this._keyY /= len;
    }
  }

  _updatePad(clientX, clientY) {
    if (!this.pad) return;
    const rect = this.pad.getBoundingClientRect();
    const px = rect.left + rect.width / 2;
    const py = rect.top + rect.height / 2;
    let dx = clientX - px;
    let dy = clientY - py;
    const max = Math.max(28, rect.width * 0.42);
    const len = Math.hypot(dx, dy) || 1;
    const mag = Math.min(1, len / max);
    this.dirX = (dx / len) * mag;
    this.dirY = (dy / len) * mag;
    this.pull = mag;
    const kx = this.dirX * max;
    const ky = this.dirY * max;
    if (this.knob) {
      this.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    }
  }

  bindBoost(btn) {
    this.boostBtn = btn || this.boostBtn;
    const el = this.boostBtn;
    if (!el || el.dataset.boostBound) return;
    el.dataset.boostBound = "1";
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._boostPointer = e.pointerId;
      this._boostHeld = true;
      this.boostPressed = true;
      el.classList.add("active");
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
    };
    const up = (e) => {
      if (this._boostPointer != null && e.pointerId !== this._boostPointer) return;
      this._boostPointer = null;
      this._boostHeld = false;
      this.boostPressed = this._space;
      el.classList.remove("active");
    };
    el.addEventListener("pointerdown", down, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  }

  refresh() {
    if (this._padPointer == null) {
      if (this._keyX || this._keyY) {
        this.dirX = this._keyX;
        this.dirY = this._keyY;
        this.pull = 1;
      } else {
        this.dirX = 0;
        this.dirY = 0;
        this.pull = 0;
      }
    }
    this.aimX = this.dirX * 90;
    this.aimY = this.dirY * 90;
    this.boostPressed = this._space || this._boostHeld;
  }

  show() {
    this.controls?.classList.remove("hidden");
    this.boostBtn?.classList.remove("hidden");
  }

  dropPointer() {
    this._padPointer = null;
    this.dirX = 0;
    this.dirY = 0;
    this.pull = 0;
    this.aimX = 0;
    this.aimY = 0;
    this.boostPressed = this._space || this._boostHeld;
    this.pad?.classList.remove("active");
    if (this.knob) this.knob.style.transform = "translate(-50%, -50%)";
  }

  hide() {
    this.dropPointer();
    this._space = false;
    this._boostHeld = false;
    this._boostPointer = null;
    this.boostPressed = false;
    this.boostBtn?.classList.remove("active");
    this.controls?.classList.add("hidden");
  }
}
