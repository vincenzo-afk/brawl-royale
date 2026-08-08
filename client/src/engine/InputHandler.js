// ============================================================
// INPUT HANDLER — keyboard + mouse at 60Hz
// ============================================================
import { INPUT_FLAGS } from 'battle-royale-shared';

export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.wheelDelta = 0;
    this.enabled = false;

    this._keyDown = this._onKeyDown.bind(this);
    this._keyUp = this._onKeyUp.bind(this);
    this._mouseMove = this._onMouseMove.bind(this);
    this._mouseDown = this._onMouseDown.bind(this);
    this._mouseUp = this._onMouseUp.bind(this);
    this._wheel = this._onWheel.bind(this);
    this._contextMenu = (e) => e.preventDefault();
  }

  enable() {
    this.enabled = true;
    window.addEventListener('keydown', this._keyDown);
    window.addEventListener('keyup', this._keyUp);
    this.canvas.addEventListener('mousemove', this._mouseMove);
    this.canvas.addEventListener('mousedown', this._mouseDown);
    this.canvas.addEventListener('mouseup', this._mouseUp);
    this.canvas.addEventListener('wheel', this._wheel, { passive: true });
    this.canvas.addEventListener('contextmenu', this._contextMenu);
  }

  disable() {
    this.enabled = false;
    window.removeEventListener('keydown', this._keyDown);
    window.removeEventListener('keyup', this._keyUp);
    this.canvas.removeEventListener('mousemove', this._mouseMove);
    this.canvas.removeEventListener('mousedown', this._mouseDown);
    this.canvas.removeEventListener('mouseup', this._mouseUp);
    this.canvas.removeEventListener('wheel', this._wheel);
    this.canvas.removeEventListener('contextmenu', this._contextMenu);
  }

  _onKeyDown(e) {
    this.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }
  _onKeyUp(e) { this.keys.delete(e.code); }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
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

  // Returns packed input flags
  getFlags() {
    let flags = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    flags |= INPUT_FLAGS.UP;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  flags |= INPUT_FLAGS.DOWN;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  flags |= INPUT_FLAGS.LEFT;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) flags |= INPUT_FLAGS.RIGHT;
    if (this.mouseDown)                                        flags |= INPUT_FLAGS.FIRE;
    if (this.keys.has('KeyR'))                                 flags |= INPUT_FLAGS.RELOAD;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) flags |= INPUT_FLAGS.SPRINT;
    if (this.keys.has('ControlLeft') || this.keys.has('KeyC'))    flags |= INPUT_FLAGS.CROUCH;
    if (this.keys.has('KeyE'))                                 flags |= INPUT_FLAGS.USE;
    if (this.keys.has('KeyH'))                                 flags |= INPUT_FLAGS.HEAL;
    return flags;
  }

  // World-space angle from canvas center to mouse
  getAimAngle(cameraOffsetX, cameraOffsetY, zoom = 1) {
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    const centerX = canvasW / 2;
    const centerY = canvasH / 2;
    return Math.atan2(this.mouseY - centerY, this.mouseX - centerX);
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
