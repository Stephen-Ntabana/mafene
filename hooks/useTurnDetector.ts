/**
 * Turn detector backed by the platform's fused rotation sensor.
 *
 * Android path ─────────────────────────────────────────────────────────────
 *   expo-sensors DeviceMotion subscribes to TYPE_GAME_ROTATION_VECTOR
 *   (accelerometer + gyroscope fused, no magnetometer → no compass drift).
 *   Internally it calls:
 *     SensorManager.getRotationMatrixFromVector(R, values)
 *     SensorManager.getOrientation(R, angles)          ← azimuth = angles[0]
 *   This is exactly TYPE_ROTATION_VECTOR + SensorManager.getOrientation().
 *   TYPE_GAME_ROTATION_VECTOR is used instead of TYPE_ROTATION_VECTOR to
 *   avoid magnetic interference from mall structures.
 *
 * iOS path ─────────────────────────────────────────────────────────────────
 *   expo-sensors DeviceMotion uses CMDeviceMotion with
 *   CMAttitudeReferenceFrame.xArbitraryZVertical — attitude is referenced
 *   to a frame where Z is vertical (gravity axis). attitude.yaw maps to
 *   rotation.alpha.
 *
 * Phone-orientation independence ───────────────────────────────────────────
 *   SensorManager.getOrientation() (Android) and xArbitraryZVertical (iOS)
 *   both extract yaw around the WORLD vertical axis from the full rotation
 *   matrix, so the result is identical whether the phone is flat, vertical,
 *   or in a pocket.
 *
 * Sign convention ──────────────────────────────────────────────────────────
 *   delta > 0 → clockwise / RIGHT  (matches Android getOrientation azimuth)
 *   delta < 0 → counter-clockwise / LEFT
 */

import { DeviceMotion } from "expo-sensors";
import { useEffect, useRef } from "react";

// ─── Public types ──────────────────────────────────────────────────────────────

export type TurnDirection = "LEFT" | "RIGHT" | "UTURN";

export interface TurnDetectorConfig {
  /** Minimum yaw change in degrees that counts as a turn (default: 45) */
  threshold?: number;
  /** Minimum milliseconds between consecutive turn events (default: 1000) */
  cooldown?: number;
  /** Fired every time a qualifying turn is detected */
  onTurnDetected: (direction: TurnDirection) => void;
}

export interface UseTurnDetectorOptions extends TurnDetectorConfig {
  /**
   * Set to false to pause detection without unmounting the hook.
   * Sensor listener is removed while disabled. (default: true)
   */
  enabled?: boolean;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Fold an arbitrary degree delta into the half-open interval (−180, +180].
 * Handles the 0 ↔ 360 seam so a 10° → 350° move is read as −20°, not +340°.
 */
function normalizeDelta(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Map a normalized delta to a turn direction.
 *
 * Thresholds (relative to the configurable `threshold`):
 *   |delta| >= 135°            → UTURN  (±180°)
 *   delta  >= threshold        → RIGHT  (~+90°)
 *   delta  <= -threshold       → LEFT   (~-90°)
 *
 * The 135° UTURN boundary is hard-coded; the caller's `threshold` gates
 * whether a turn fires at all (must be >= threshold to reach classify()).
 */
function classify(delta: number): TurnDirection {
  if (Math.abs(delta) >= 135) return "UTURN";
  return delta > 0 ? "RIGHT" : "LEFT";
}

// ─── Class-based API ──────────────────────────────────────────────────────────

/**
 * Imperative turn detector — useful outside React component trees.
 *
 * ```ts
 * const detector = new TurnDetector({
 *   threshold: 45,
 *   cooldown: 1000,
 *   onTurnDetected: (dir) => console.log(dir),
 * });
 * detector.start();
 * // ... later
 * detector.stop();
 * ```
 */
export class TurnDetector {
  private sub: { remove: () => void } | null = null;
  private baseYaw: number | null = null; // degrees, [0, 360)
  private lastTurnTs = 0;

  readonly threshold: number;
  readonly cooldown: number;
  readonly onTurnDetected: (direction: TurnDirection) => void;

  constructor({ threshold = 45, cooldown = 1000, onTurnDetected }: TurnDetectorConfig) {
    this.threshold = threshold;
    this.cooldown = cooldown;
    this.onTurnDetected = onTurnDetected;
  }

  /**
   * Register the sensor listener and begin turn detection.
   * Safe to call multiple times — no-ops if already running.
   */
  start(): void {
    if (this.sub) return;

    // 10 Hz is sufficient for human-pace turns and keeps battery overhead low
    DeviceMotion.setUpdateInterval(100);
    this.baseYaw = null;

    this.sub = DeviceMotion.addListener(({ rotation }) => {
      if (!rotation) return;

      // rotation.alpha is in radians [0, 2π]; convert to degrees [0, 360)
      const alpha = ((rotation.alpha * 180) / Math.PI + 360) % 360;

      // First sample → set baseline, no turn to report yet
      if (this.baseYaw === null) {
        this.baseYaw = alpha;
        return;
      }

      // How many degrees has the device rotated since the last baseline reset?
      const delta = normalizeDelta(alpha - this.baseYaw);

      if (Math.abs(delta) >= this.threshold) {
        const now = Date.now();
        if (now - this.lastTurnTs >= this.cooldown) {
          this.lastTurnTs = now;
          this.baseYaw = alpha; // reset so the NEXT turn is measured from here
          this.onTurnDetected(classify(delta));
        }
      }
    });
  }

  /**
   * Unregister the sensor listener and stop turn detection.
   * Safe to call when already stopped.
   */
  stop(): void {
    this.sub?.remove();
    this.sub = null;
  }
}

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * React hook that wires turn detection into a component's lifecycle.
 *
 * ```tsx
 * useTurnDetector({
 *   enabled: isNavigating,
 *   threshold: 45,
 *   cooldown: 1000,
 *   onTurnDetected: (dir) => setLastTurn(dir),
 * });
 * ```
 *
 * The sensor listener is automatically removed on unmount or when
 * `enabled` becomes false.
 */
export function useTurnDetector({
  threshold = 45,
  cooldown = 1000,
  onTurnDetected,
  enabled = true,
}: UseTurnDetectorOptions): void {
  // Stable ref so the effect never needs to restart just because the caller
  // passes a new callback object on each render
  const cbRef = useRef(onTurnDetected);
  useEffect(() => {
    cbRef.current = onTurnDetected;
  });

  const baseYawRef = useRef<number | null>(null);
  const lastTurnTsRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    DeviceMotion.setUpdateInterval(100);
    baseYawRef.current = null;

    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (!rotation) return;

      const alpha = ((rotation.alpha * 180) / Math.PI + 360) % 360;

      if (baseYawRef.current === null) {
        baseYawRef.current = alpha;
        return;
      }

      const delta = normalizeDelta(alpha - baseYawRef.current);

      if (Math.abs(delta) >= threshold) {
        const now = Date.now();
        if (now - lastTurnTsRef.current >= cooldown) {
          lastTurnTsRef.current = now;
          baseYawRef.current = alpha;
          cbRef.current(classify(delta));
        }
      }
    });

    return () => sub.remove();
  // threshold / cooldown changes restart the sensor so stale values are never
  // captured inside the closure; enabled toggles the listener on/off cleanly
  }, [enabled, threshold, cooldown]);
}
