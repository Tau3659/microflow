/**
 * 左侧虚拟方向键 + 右侧加速键
 */
export class Input {
  constructor(root) {
    this.root = root;
    this.dirX = 0;
    this.dirY = 0;
    this.boostPressed = false;
    this._padPointer = null;
    this._boostPointer = null;
    this._bound = false;

    this.pad = root.querySelector("#virtual-pad");
    this.knob = root.querySelector("#virtual-knob");
    this.boostBtn = root.querySelector("#btn-boost");
  }

  get moving() {
    return Math.hypot(this.dirX, this.dirY) > 0.12;
  }

  bind() {
    if (this._bound) return;
    this._bound = true;

    const onPadDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._padPointer = e.pointerId;
      this.pad.setPointerCapture?.(e.pointerId);
      this.pad.classList.add("active");
      this._updatePad(e.clientX, e.clientY);
    };

    const onPadMove = (e) => {
      if (this._padPointer !== e.pointerId) return;
      e.preventDefault();
      this._updatePad(e.clientX, e.clientY);
    };

    const onPadUp = (e) => {
      if (this._padPointer !== e.pointerId) return;
      this._padPointer = null;
      this.dirX = 0;
      this.dirY = 0;
      this.pad.classList.remove("active");
      this.knob.style.transform = "translate(-50%, -50%)";
    };

    this.pad.addEventListener("pointerdown", onPadDown, { passive: false });
    this.pad.addEventListener("pointermove", onPadMove, { passive: false });
    this.pad.addEventListener("pointerup", onPadUp);
    this.pad.addEventListener("pointercancel", onPadUp);

    const boostDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._boostPointer = e.pointerId;
      this.boostPressed = true;
      this.boostBtn.classList.add("active");
      this.boostBtn.setPointerCapture?.(e.pointerId);
    };

    const boostUp = (e) => {
      if (this._boostPointer != null && e.pointerId !== this._boostPointer) return;
      this._boostPointer = null;
      this.boostPressed = false;
      this.boostBtn.classList.remove("active");
    };

    this.boostBtn.addEventListener("pointerdown", boostDown, { passive: false });
    this.boostBtn.addEventListener("pointerup", boostUp);
    this.boostBtn.addEventListener("pointercancel", boostUp);
    this.boostBtn.addEventListener("pointerleave", boostUp);

    // 键盘兜底（桌面调试）
    window.addEventListener("keydown", (e) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") this.dirY = -1;
      if (e.code === "ArrowDown" || e.code === "KeyS") this.dirY = 1;
      if (e.code === "ArrowLeft" || e.code === "KeyA") this.dirX = -1;
      if (e.code === "ArrowRight" || e.code === "KeyD") this.dirX = 1;
      if (e.code === "Space" || e.code === "ShiftLeft") {
        e.preventDefault();
        this.boostPressed = true;
        this.boostBtn.classList.add("active");
      }
      this._normalizeKeyboard();
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") if (this.dirY < 0) this.dirY = 0;
      if (e.code === "ArrowDown" || e.code === "KeyS") if (this.dirY > 0) this.dirY = 0;
      if (e.code === "ArrowLeft" || e.code === "KeyA") if (this.dirX < 0) this.dirX = 0;
      if (e.code === "ArrowRight" || e.code === "KeyD") if (this.dirX > 0) this.dirX = 0;
      if (e.code === "Space" || e.code === "ShiftLeft") {
        this.boostPressed = false;
        this.boostBtn.classList.remove("active");
      }
      this._normalizeKeyboard();
    });
  }

  _normalizeKeyboard() {
    const len = Math.hypot(this.dirX, this.dirY);
    if (len > 1) {
      this.dirX /= len;
      this.dirY /= len;
    }
  }

  _updatePad(clientX, clientY) {
    const rect = this.pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.34;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    this.dirX = dx / max;
    this.dirY = dy / max;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  show() {
    this.root.classList.remove("hidden");
  }

  hide() {
    this.root.classList.add("hidden");
    this.dirX = 0;
    this.dirY = 0;
    this.boostPressed = false;
    this.pad.classList.remove("active");
    this.boostBtn.classList.remove("active");
    this.knob.style.transform = "translate(-50%, -50%)";
  }
}
