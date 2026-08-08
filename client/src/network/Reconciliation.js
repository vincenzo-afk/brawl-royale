// ============================================================
// SERVER RECONCILIATION
// When server sends authoritative state, we snap local player
// to server position then re-apply all unacknowledged inputs.
// ============================================================

export class Reconciliation {
  constructor(prediction) {
    this.prediction = prediction;
    this.enabled = true;
    this.correctionThreshold = 4;  // px — only reconcile if error > this
  }

  // Called when server sends updated player state
  reconcile(localPlayer, serverState, applyInputFn) {
    if (!this.enabled) return;

    const serverX = serverState.x;
    const serverY = serverState.y;

    const errorX = Math.abs(localPlayer.x - serverX);
    const errorY = Math.abs(localPlayer.y - serverY);

    // Acknowledge inputs up to server's last processed
    const lastAcked = serverState.lastProcessedInput;
    if (lastAcked !== undefined) {
      this.prediction.acknowledgeInput(lastAcked);
    }

    // If discrepancy is tiny, just nudge gently
    if (errorX < this.correctionThreshold && errorY < this.correctionThreshold) {
      localPlayer.x += (serverX - localPlayer.x) * 0.3;
      localPlayer.y += (serverY - localPlayer.y) * 0.3;
      return;
    }

    // Large error — snap to server then re-apply pending inputs
    localPlayer.x = serverX;
    localPlayer.y = serverY;
    localPlayer.health = serverState.health ?? localPlayer.health;
    localPlayer.shield = serverState.shield ?? localPlayer.shield;

    // Re-simulate all unacked inputs
    const pending = this.prediction.getPendingInputs();
    for (const input of pending) {
      applyInputFn(localPlayer, input);
    }
  }
}
