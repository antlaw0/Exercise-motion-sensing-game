/* public/js/motion.js – runs on the phone controller page */
'use strict';

class MotionDetector {
  /**
   * @param {object} options
   * @param {number} options.punchThreshold – m/s² magnitude needed to trigger a punch (default 15)
   * @param {number} options.cooldownMs     – minimum ms between punches on this controller (default 600)
   */
  constructor(options = {}) {
    this.punchThreshold = options.punchThreshold || 15;
    this.cooldownMs = options.cooldownMs || 600;
    this._lastPunch = 0;

    /** Called with (hand, force 0-1) when a punch is detected */
    this.onPunch = null;
  }

  /**
   * Feed one accelerometer sample.
   * @param {{ x:number, y:number, z:number }} acc – accelerationIncludingGravity values
   * @param {string} hand – 'left' | 'right'
   */
  process(acc, hand) {
    if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
    const now = Date.now();
    const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);

    if (magnitude >= this.punchThreshold && now - this._lastPunch > this.cooldownMs) {
      this._lastPunch = now;
      const force = Math.min(magnitude / 30, 1.0); // normalise to 0–1
      if (typeof this.onPunch === 'function') {
        this.onPunch(hand, force);
      }
    }
  }
}
