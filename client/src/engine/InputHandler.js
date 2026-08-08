// ============================================================
// INPUT HANDLER — keyboard + pointer-lock mouse at 60Hz
// Movement is camera-relative: the pressed keys are rotated by
// the camera yaw into a world-space moveX/moveY vector that is
// mirrored by the server + client prediction.
// ============================================================
import { INPUT_FLAGS } from 'battle-royale-shared';

export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.pointerLocked = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheelDelta = 0;
    this.enabled = false;
    this.cameraYaw = 0;   // set by the Game each frame

    this._keyDown = this._onKeyDown.bind(this);
    this._keyUp = this._onKeyUp.bind(this);
    this._mouseMove = this._onMouseMove.bind(this);
    this._mouseDown = this._onMouseDown.bind(this);
    this._mouseUp = this._onMouseUp.bind(this);
    this._wheel = this._onWheel.bind(this);
    this._lockChange = this._onLockChange.bind(this);
    this._contextMenu = (e) => e.preventDefault();
  }

  enable() {
    this.enabled = true;
    window.addEventListener('keydown', this._keyDown);
    window.addEventListener('keyup', this._keyUp);
    document.addEventListener('mousemove', this._mouseMove);
    document.addEventListener('mousedown', this._mouseDown);
    document.addEventListener('mouseup', this._mouseUp);
    this.canvas.addEventListener('wheel', this._wheel, { passive: true });
    this.canvas.addEventListener('contextmenu', this._contextMenu);
    document.addEventListener('pointerlockchange', this._lockChange);
  }

  disable() {
    this.enabled = false;
    window.removeEventListener('keydown', this._keyDown);
    window.removeEventListener('keyup', this._keyUp);
    document.removeEventListener('mousemove', this._mouseMove);
    document.removeEventListener('mousedown', this._mouseDown);
    document.removeEventListener('mouseup', this._mouseUp);
    this.canvas.removeEventListener('wheel', this._wheel);
    this.canvas.removeEventListener('contextmenu', this._contextMenu);
    document.removeEventListener('pointerlockchange', this._lockChange);
  }

  _onKeyDown(e) {
    this.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }
  _onKeyUp(e) { this.keys.delete(e.code); }

  _onMouseMove(e) {
    if (this.pointerLocked) {
      this.lookDX += e.movementX || 0;
      this.lookDY += e.movementY || 0;
    }
  }
  _onMouseDown(e) {
    if (e.button === 0) this.mouseDown = true;
    if (e.button === 2) this.rightMouseDown = true;
  }
  _onMouseUp(e) {
    if (e.button === 0) this.mouseDown = false;
    if (e.button === 2) this.rightMouseDown = false;
  }
  _onWheel(e) { this.wheelDelta += e.deltaY; }
  _onLockChange() {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  }

  // Consume accumulated pointer-lock look deltas
  consumeLook() {
    const dx = this.lookDX;
    const dy = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    return { dx, dy };
  }

  // Packed action flags (movement handled via moveX/moveY below)
  getFlags() {
    let flags = 0;
    if (this.mouseDown)                                        flags |= INPUT_FLAGS.FIRE;
    if (this.keys.has('KeyR'))                                 flags |= INPUT_FLAGS.RELOAD;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) flags |= INPUT_FLAGS.SPRINT;
    if (this.keys.has('ControlLeft') || this.keys.has('KeyC'))    flags |= INPUT_FLAGS.CROUCH;
    if (this.keys.has('KeyE'))                                 flags |= INPUT_FLAGS.USE;
    if (this.keys.has('KeyH'))                                 flags |= INPUT_FLAGS.HEAL;
    if (this.rightMouseDown)                                   flags |= INPUT_FLAGS.ADS;
    // Legacy world-axis flags kept for bots/compat (moveX/moveY takes precedence)
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))     flags |= INPUT_FLAGS.UP;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))   flags |= INPUT_FLAGS.DOWN;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))   flags |= INPUT_FLAGS.LEFT;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight'))  flags |= INPUT_FLAGS.RIGHT;
    return flags;
  }

  // Camera-relative movement vector in WORLD space (-1..1 per axis)
  getMoveVector() {
    let f = 0;  // forward
    let r = 0;  // right
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  f -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  r -= 1;
    if (f === 0 && r === 0) return { moveX: 0, moveY: 0 };

    // Rotate by camera yaw (aim angle): forward = (cos yaw, sin yaw)
    const yaw = this.cameraYaw;
    const fx = Math.cos(yaw), fy = Math.sin(yaw);
    const rx = -fy, ry = fx;

    let wx = fx * f + rx * r;
    let wy = fy * f + ry * r;
    const len = Math.hypot(wx, wy);
    if (len > 0) { wx /= len; wy /= len; }
    return { moveX: wx, moveY: wy };
  }

  // Slot switch from keys
  getSlotSwitch() {
    if (this.keys.has('Digit1')) return 0;
    if (this.keys.has('Digit2')) return 1;
    if (this.keys.has('Digit3')) return 2;
    return -1;
  }

  consumeWheel() {
    const delta = this.wheelDelta;
    this.wheelDelta = 0;
    return delta;
  }
}
