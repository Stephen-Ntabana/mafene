import { Pedometer, Magnetometer } from "expo-sensors";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const STEP_LENGTH_M  = 0.73;
const TURN_THRESHOLD = 2.5; // degrees per update to register a turn

function getCardinal(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];
}

interface Props {
  onBack: () => void;
}

export default function StepCounterScreen({ onBack }: Props) {
  const [steps, setSteps]                   = useState(0);
  const [active, setActive]                 = useState(false);
  const [status, setStatus]                 = useState<"standing" | "walking">("standing");
  const [available, setAvailable]           = useState<boolean | null>(null);
  const [elapsed, setElapsed]               = useState(0);
  const [displayHeading, setDisplayHeading] = useState(0);
  const [turnStatus, setTurnStatus]         = useState<"left" | "right" | "straight">("straight");

  const pulseAnim      = useRef(new Animated.Value(1)).current;
  const compassAnim    = useRef(new Animated.Value(0)).current;
  const subscription   = useRef<ReturnType<typeof Pedometer.watchStepCount> | null>(null);
  const magSub         = useRef<ReturnType<typeof Magnetometer.addListener> | null>(null);
  const standingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerInterval  = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingAccum   = useRef(0);
  const prevRawHeading = useRef<number | null>(null);

  const compassRotation = compassAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
    extrapolate: "extend",
  });

  const triggerPulse = () => {
    pulseAnim.setValue(1.2);
    Animated.spring(pulseAnim, { toValue: 1, tension: 120, friction: 5, useNativeDriver: true }).start();
  };

  const stopTracking = () => {
    subscription.current?.remove();
    subscription.current = null;
    magSub.current?.remove();
    magSub.current = null;
    if (standingTimer.current)  clearTimeout(standingTimer.current);
    if (timerInterval.current)  clearInterval(timerInterval.current);
    if (turnTimer.current)      clearTimeout(turnTimer.current);
    setActive(false);
    setStatus("standing");
    setTurnStatus("straight");
  };

  useEffect(() => {
    // --- Pedometer ---
    Pedometer.isAvailableAsync().then((avail) => {
      setAvailable(avail);
      if (!avail) return;

      subscription.current = Pedometer.watchStepCount(({ steps: s }) => {
        setSteps(s);
        setStatus("walking");
        triggerPulse();
        if (standingTimer.current) clearTimeout(standingTimer.current);
        standingTimer.current = setTimeout(() => setStatus("standing"), 1500);
      });

      timerInterval.current = setInterval(() => setElapsed(e => e + 1), 1000);
      setActive(true);
    });

    // --- Magnetometer ---
    Magnetometer.setUpdateInterval(100);
    magSub.current = Magnetometer.addListener(({ x, y }) => {
      const raw = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

      if (prevRawHeading.current === null) {
        prevRawHeading.current = raw;
        headingAccum.current   = raw;
      } else {
        let delta = raw - prevRawHeading.current;
        if (delta >  180) delta -= 360;
        if (delta < -180) delta += 360;

        headingAccum.current  += delta;
        prevRawHeading.current = raw;

        if (Math.abs(delta) > TURN_THRESHOLD) {
          setTurnStatus(delta < 0 ? "right" : "left");
          if (turnTimer.current) clearTimeout(turnTimer.current);
          turnTimer.current = setTimeout(() => setTurnStatus("straight"), 800);
        }
      }

      setDisplayHeading(((headingAccum.current % 360) + 360) % 360);
      Animated.spring(compassAnim, {
        toValue: headingAccum.current,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      subscription.current?.remove();
      magSub.current?.remove();
      if (standingTimer.current) clearTimeout(standingTimer.current);
      if (timerInterval.current) clearInterval(timerInterval.current);
      if (turnTimer.current)     clearTimeout(turnTimer.current);
    };
  }, []);

  const distance = steps * STEP_LENGTH_M;
  const distLabel = distance >= 1000
    ? `${(distance / 1000).toFixed(2)} km`
    : `${distance.toFixed(1)} m`;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const turnLabel = turnStatus === "left"  ? "↺ Turning Left"
                  : turnStatus === "right" ? "↻ Turning Right"
                  : "→ Straight";
  const turnBg = turnStatus === "straight" ? "#EEEEEE" : "#E3F2FD";

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={["#1a1a2e", "#0f3460"]} style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PDR Demo</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <View style={styles.body}>
        {available === false && (
          <View style={styles.warnBadge}>
            <Text style={styles.warnText}>⚠️ Hardware pedometer not available on this device</Text>
          </View>
        )}

        {/* Status badges */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, active ? styles.badgeActive : styles.badgeIdle]}>
            <Text style={styles.badgeText}>
              {!active ? "⏸ Stopped" : status === "walking" ? "🚶 Walking" : "🧍 Standing"}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: turnBg }]}>
            <Text style={styles.badgeText}>{turnLabel}</Text>
          </View>
        </View>

        {/* Step ring + Compass side by side */}
        <View style={styles.metricsRow}>
          {/* Step ring */}
          <View style={styles.ringWrapper}>
            <Animated.View style={[styles.ring, { transform: [{ scale: pulseAnim }] }]}>
              <LinearGradient colors={["#0066CC", "#0044AA"]} style={styles.ringInner}>
                <Text style={styles.stepCount}>{steps}</Text>
                <Text style={styles.stepLabel}>steps</Text>
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Compass */}
          <View style={styles.compassWrapper}>
            <View style={styles.compassCircle}>
              <Text style={[styles.cardinal, styles.cardinalN]}>N</Text>
              <Text style={[styles.cardinal, styles.cardinalE]}>E</Text>
              <Text style={[styles.cardinal, styles.cardinalS]}>S</Text>
              <Text style={[styles.cardinal, styles.cardinalW]}>W</Text>

              <Animated.View style={[styles.needle, { transform: [{ rotate: compassRotation }] }]}>
                <View style={styles.needleTop} />
                <View style={styles.needleBottom} />
              </Animated.View>

              {/* Center dot */}
              <View style={styles.centerDot} />
            </View>
            <Text style={styles.headingText}>
              {Math.round(displayHeading)}°  {getCardinal(displayHeading)}
            </Text>
          </View>
        </View>

        {/* Distance */}
        <View style={styles.distCard}>
          <Text style={styles.distValue}>{distLabel}</Text>
          <Text style={styles.distLabel}>distance travelled</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{STEP_LENGTH_M} m</Text>
            <Text style={styles.statLabel}>step length</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {available === null ? "…" : available ? "✅" : "❌"}
            </Text>
            <Text style={styles.statLabel}>hardware</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{mm}:{ss}</Text>
            <Text style={styles.statLabel}>elapsed</Text>
          </View>
        </View>

        {active && (
          <TouchableOpacity style={styles.stopBtn} onPress={stopTracking}>
            <LinearGradient colors={["#F44336", "#C62828"]} style={styles.btnGradient}>
              <Text style={styles.btnText}>⏹  Stop</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const COMPASS_SIZE = 130;
const NEEDLE_H     = 80;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn:     { padding: 6 },
  backText:    { color: "white", fontSize: 24, fontWeight: "bold" },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },

  body: { flex: 1, alignItems: "center", paddingTop: 20 },

  warnBadge: {
    backgroundColor: "#FFF3E0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
    marginHorizontal: 20,
  },
  warnText: { fontSize: 12, color: "#E65100", textAlign: "center" },

  badgeRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  badge: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 30 },
  badgeActive: { backgroundColor: "#E8F5E9" },
  badgeIdle:   { backgroundColor: "#EEEEEE" },
  badgeText:   { fontSize: 13, fontWeight: "600", color: "#333" },

  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginBottom: 24,
  },

  ringWrapper: { alignItems: "center" },
  ring: {
    width: 150,
    height: 150,
    borderRadius: 75,
    elevation: 10,
    shadowColor: "#0066CC",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  ringInner: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCount: { fontSize: 48, fontWeight: "bold", color: "white" },
  stepLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: -4 },

  compassWrapper: { alignItems: "center" },
  compassCircle: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    backgroundColor: "white",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    justifyContent: "center",
    alignItems: "center",
  },
  cardinal: {
    position: "absolute",
    fontSize: 11,
    fontWeight: "bold",
    color: "#555",
  },
  cardinalN: { top: 6,  alignSelf: "center", color: "#E53935" },
  cardinalS: { bottom: 6, alignSelf: "center" },
  cardinalE: { right: 8, top: COMPASS_SIZE / 2 - 8 },
  cardinalW: { left: 8,  top: COMPASS_SIZE / 2 - 8 },

  needle: {
    position: "absolute",
    width: 6,
    height: NEEDLE_H,
    top: (COMPASS_SIZE - NEEDLE_H) / 2,
    left: (COMPASS_SIZE - 6) / 2,
  },
  needleTop: {
    width: 6,
    height: NEEDLE_H / 2,
    backgroundColor: "#E53935",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  needleBottom: {
    width: 6,
    height: NEEDLE_H / 2,
    backgroundColor: "#BDBDBD",
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  centerDot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#333",
  },
  headingText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
    letterSpacing: 1,
  },

  distCard: {
    alignItems: "center",
    backgroundColor: "white",
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  distValue: { fontSize: 26, fontWeight: "bold", color: "#0066CC" },
  distLabel: { fontSize: 12, color: "#999", marginTop: 2 },

  statsRow: { flexDirection: "row", gap: 12, marginBottom: 28 },
  statBox: {
    backgroundColor: "white",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  statValue: { fontSize: 14, fontWeight: "bold", color: "#333" },
  statLabel: { fontSize: 10, color: "#999", marginTop: 2 },

  stopBtn:     { borderRadius: 30, overflow: "hidden", elevation: 4 },
  btnGradient: { paddingVertical: 14, paddingHorizontal: 48 },
  btnText:     { color: "white", fontSize: 16, fontWeight: "bold" },
});
