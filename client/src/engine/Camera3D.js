// ============================================================
// CAMERA 3D — third-person shooter camera
// yaw IS the aim angle (game coords: 0 = +x, π/2 = +y) so the
// model rotation, aim input and the camera all stay in sync.
// ============================================================

export class Camera3D {
  constructor() {
    // Aim / look
    this.yaw = 0;            // radians — also the game aim angle
    this.pitch = 0.42;       // radians — vertical look
    this._targetYaw = 0;
    this._targetPitch = 0.42;

    // Distance + FOV
    this.distance = 330;
    this._targetDistance = 330;
    this.minDistance = 150;
    this.maxDistance = 620;
    this.fov = 75;
    this.targetFov = 75;
    this.baseFov = 75;
    this.adsFov = 52;

    // Follow target (game coords x/y)
    this.targetX = 0;
    this.targetY = 0;

    // Smoothing
    this.posLerp = 9;
    this.lookLerp = 16;

    // Screen shake
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    this._shakeX = 0;
    this._shakeY = 0;
    this._shakeZ = 0;

    // Smoothed camera position (three space)
    this._px = null; this._py = null; this._pz = null;

    // Shoulder offset (right-handed offset for a PUBG-style over-shoulder look)
    this.shoulder = 26;
    this.eyeHeight = 62;
  }

  resize() { /* three handles aspect in renderer */ }

  // Mouse-look from pointer lock deltas
  rotateLook(dx, dy, sensitivity = 0.0022) {
    this._targetYaw -= dx * sensitivity;
    this._targetPitch -= dy * sensitivity;
    this._targetPitch = Math.max(-0.35, Math.min(1.25, this._targetPitch));
    // Keep yaw in a sane range
    const twoPi = Math.PI * 2;
    this._targetYaw = ((this._targetYaw % twoPi) + twoPi) % twoPi;
  }

  // Instantly aim somewhere (spawn / spectate switch)
  snapYaw(angle) {
    this.yaw = angle;
    this._targetYaw = angle;
  }

  setPitch(p) {
    this._targetPitch = Math.max(-0.35, Math.min(1.25, p));
  }

  shake(intensity = 8) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  adjustDistance(delta) {
    this._targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this._targetDistance + delta * 0.45));
  }

  setAds(ads) {
    this.targetFov = ads ? this.adsFov : this.baseFov;
    this._targetDistance = ads ? Math.min(this._targetDistance, 165) : this._targetDistance;
  }

  // Returns the world-space aim direction (game coords: {x, y} on the plane)
  getAimVector() {
    return { x: Math.cos(this.yaw), y: Math.sin(this.yaw) };
  }

  // Smoothly follow the target + shake, returns nothing (mutates camera)
  update(dt, threeCamera) {
    if (!threeCamera) return;

    // Smooth yaw/pitch/fov/distance
    const lookT = 1 - Math.exp(-this.lookLerp * dt);
    const posT = 1 - Math.exp(-this.posLerp * dt);

    let dy = this._targetYaw - this.yaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * lookT;
    this.pitch += (this._targetPitch - this.pitch) * lookT;
    this.distance += (this._targetDistance - this.distance) * posT;
    this.fov += (this.targetFov - this.fov) * lookT;

    // Decay shake
    if (this.shakeIntensity > 0.01) {
      this._shakeX = (Math.random() * 2 - 1) * this.shakeIntensity;
      this._shakeY = (Math.random() * 2 - 1) * this.shakeIntensity;
      this._shakeZ = (Math.random() * 2 - 1) * this.shakeIntensity * 0.5;
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this._shakeX = 0; this._shakeY = 0; this._shakeZ = 0;
      this.shakeIntensity = 0;
    }

    // Aim forward on the ground plane
    const fx = Math.cos(this.yaw);
    const fy = Math.sin(this.yaw);
    // Right vector for the shoulder offset
    const rx = -fy;
    const ry = fx;

    const horiz = Math.cos(this.pitch) * this.distance;
    const height = Math.sin(this.pitch) * this.distance + this.eyeHeight * 0.85;

    // World position (three.js: z = game y)
    const px = this.targetX - fx * horiz + rx * this.shoulder;
    const pz = this.targetY - fy * horiz + ry * this.shoulder;
    const py = height;

    // Smooth the camera position toward it (lerp in three space)
    const smooth = 1 - Math.exp(-this.posLerp * 2.2 * dt);
    if (this._px === null) { this._px = px; this._py = py; this._pz = pz; }
    this._px += (px - this._px) * smooth;
    this._py += (py - this._py) * smooth;
    this._pz += (pz - this._pz) * smooth;

    threeCamera.position.set(
      this._px + this._shakeX,
      this._py + this._shakeY,
      this._pz + this._shakeZ
    );

    // Look at the target (slightly ahead so the character isn't centered)
    threeCamera.lookAt(
      this.targetX + fx * 90,
      this.eyeHeight * 0.9,
      this.targetY + fy * 90
    );

    // FOV
    threeCamera.fov = this.fov;
    threeCamera.updateProjectionMatrix();
  }

  // Reset for a new match / spectate switch
  reset() {
    this._px = null; this._py = null; this._pz = null;
    this.shakeIntensity = 0;
    this.distance = 330;
    this._targetDistance = 330;
    this.fov = this.baseFov;
    this.targetFov = this.baseFov;
  }
}
