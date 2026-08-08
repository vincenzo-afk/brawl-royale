// ============================================================
// CAMERA — follows local player with smooth lerp
// ============================================================

export class Camera {
  constructor(canvasWidth, canvasHeight) {
    this.x = 0;
    this.y = 0;
    this.zoom = 1.0;
    this.targetZoom = 1.0;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.lerpSpeed = 8;   // camera follow speed
    this.zoomLerpSpeed = 5;
    this.minZoom = 0.4;
    this.maxZoom = 2.0;
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    this._shakeX = 0;
    this._shakeY = 0;
  }

  resize(w, h) {
    this.canvasWidth = w;
    this.canvasHeight = h;
  }

  // Follow target position with smooth lerp
  follow(targetX, targetY, dt) {
    const lerpFactor = 1 - Math.pow(1 - Math.min(1, this.lerpSpeed * dt), 1);
    this.x += (targetX - this.x) * lerpFactor;
    this.y += (targetY - this.y) * lerpFactor;

    // Zoom lerp
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, this.zoomLerpSpeed * dt);

    // Screen shake
    if (this.shakeIntensity > 0.01) {
      this._shakeX = (Math.random() * 2 - 1) * this.shakeIntensity;
      this._shakeY = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this._shakeX = 0;
      this._shakeY = 0;
      this.shakeIntensity = 0;
    }
  }

  shake(intensity = 8) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  adjustZoom(delta) {
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom - delta * 0.001));
  }

  // Apply camera transform to canvas context
  begin(ctx) {
    ctx.save();
    ctx.translate(
      this.canvasWidth / 2 + this._shakeX,
      this.canvasHeight / 2 + this._shakeY
    );
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  end(ctx) {
    ctx.restore();
  }

  // Convert screen coords to world coords
  screenToWorld(screenX, screenY) {
    return {
      x: (screenX - this.canvasWidth / 2) / this.zoom + this.x,
      y: (screenY - this.canvasHeight / 2) / this.zoom + this.y,
    };
  }

  // Convert world coords to screen coords
  worldToScreen(worldX, worldY) {
    return {
      x: (worldX - this.x) * this.zoom + this.canvasWidth / 2,
      y: (worldY - this.y) * this.zoom + this.canvasHeight / 2,
    };
  }
}
