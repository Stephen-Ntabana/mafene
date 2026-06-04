import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Accelerometer, Pedometer } from "expo-sensors";
import { StatusBar } from "expo-status-bar";
import * as TaskManager from "expo-task-manager";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line } from "react-native-svg";
import MappedInScreen from "../../screens/MappedInScreen";
import OnboardingScreen from "../../screens/OnboardingScreen";
import { TurnDirection, useTurnDetector } from "../../hooks/useTurnDetector";
import {
  CANVAS_FLOOR0, CANVAS_FLOOR1,
  LOCATIONS_FLOOR0, LOCATIONS_FLOOR1,
  JUNCTION_POINTS_FLOOR0, JUNCTION_POINTS_FLOOR1,
  WALKABLE_CONNECTIONS_FLOOR0, WALKABLE_CONNECTIONS_FLOOR1,
  DESTINATION_TO_JUNCTION_FLOOR0, DESTINATION_TO_JUNCTION_FLOOR1,
} from "../../constants/floorData";

// require() must be static — declare both images at module level
const FLOOR_IMAGES = [
  require("../../assets/images/floor0.png"),
  require("../../assets/images/floor1.png"),
] as const;

// ------------------------------
// Constants
// ------------------------------
const MALL_NAME = "CHIC Mall - Main Entrance";
const MALL_LAT = -1.976684;
const MALL_LNG = 30.050527;


// Notification setup
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ------------------------------
// Background Location Task
// ------------------------------
const BACKGROUND_LOCATION_TASK = "background-location-task";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations && locations.length > 0) {
      const lastLocation = locations[locations.length - 1];
      try {
        const storedMallLat = await AsyncStorage.getItem("mallLat");
        const storedMallLng = await AsyncStorage.getItem("mallLng");
        if (!storedMallLat || !storedMallLng) return;

        const dist = calculateDistance(
          lastLocation.coords.latitude,
          lastLocation.coords.longitude,
          parseFloat(storedMallLat),
          parseFloat(storedMallLng),
        );

        const lastNotifiedDist = await AsyncStorage.getItem("lastNotifiedDist");
        const prev = lastNotifiedDist ? parseFloat(lastNotifiedDist) : Infinity;

        // Arrived: within 15 m and haven't sent arrival notification yet
        if (dist <= 15 && prev > 15) {
          await AsyncStorage.setItem("lastNotifiedDist", dist.toString());
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "🏬 You've arrived at CHIC Mall!",
              body: "Tap to switch to indoor navigation.",
              data: { screen: "switchToIndoor" },
            },
            trigger: null,
          });
        } else if (dist <= 50 && dist > 15 && prev > 50) {
          // Approaching: crossed the 50 m boundary for the first time
          await AsyncStorage.setItem("lastNotifiedDist", dist.toString());
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "📍 Approaching CHIC Mall",
              body: `You are ~${Math.round(dist)} m away. Tap to switch to indoor navigation.`,
              data: { screen: "switchToIndoor" },
            },
            trigger: null,
          });
        }
      } catch (_) {}
    }
  }
});

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ------------------------------
// Home Screen
// ------------------------------
function HomeScreen({
  onStartOutdoor,
  onSelectDestination,
}: {
  onStartOutdoor: () => Promise<void>;
  onSelectDestination: (
    dest: string,
    lat: number,
    lng: number,
    skipLocation: boolean,
  ) => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const openGoogleMaps = async (): Promise<void> => {
    // On Android 11+, canOpenURL requires <queries> in the manifest and is unreliable
    // for custom schemes. Instead, try the native scheme directly and fall back on error.
    const nativeUrl =
      Platform.OS === "android"
        ? `google.navigation:q=${MALL_LAT},${MALL_LNG}&mode=d`
        : `comgooglemaps://?daddr=${MALL_LAT},${MALL_LNG}&directionsmode=driving`;
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${MALL_LAT},${MALL_LNG}&travelmode=driving`;

    try {
      await Linking.openURL(nativeUrl);
    } catch {
      try {
        await Linking.openURL(webUrl);
      } catch {
        Alert.alert("Error", "Could not open Google Maps");
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f3460"]}
        style={styles.gradientHeader}
      >
        <Animated.View
          style={[
            styles.headerContent,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text style={styles.title}>🚀 SeamlessNav</Text>
          <Text style={styles.subtitle}>Navigate Seamlessly</Text>
          <View style={styles.locationChip}>
            <Text style={styles.locationChipText}>📍 Kigali, Rwanda</Text>
          </View>
        </Animated.View>
      </LinearGradient>

      <ScrollView style={styles.content}>
        <Animated.View
          style={[
            styles.mainCard,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <LinearGradient
            colors={["#0066CC", "#0055AA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mainCardGradient}
          >
            <Text style={styles.mainCardEmoji}>🏬</Text>
            <Text style={styles.mainCardTitle}>CHIC Mall</Text>
            <Text style={styles.mainCardSubtitle}>Main Entrance</Text>
            <TouchableOpacity
              style={styles.mainButton}
              onPress={async () => {
                await onStartOutdoor();  // permissions & background tracking first
                await openGoogleMaps();  // open Maps last so it stays in foreground
              }}
            >
              <Text style={styles.mainButtonText}>
                Start Outdoor Navigation
              </Text>
              <Text style={styles.mainButtonIcon}>🗺️</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        <TouchableOpacity
          style={styles.demoButton}
          onPress={() =>
            onSelectDestination(MALL_NAME, MALL_LAT, MALL_LNG, true)
          }
        >
          <LinearGradient
            colors={["#FF9800", "#F57C00"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.demoButtonGradient}
          >
            <Text style={styles.demoButtonText}>🏢 Try Indoor Demo</Text>
            <Text style={styles.demoButtonSubtext}>
              Experience navigation without leaving home
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.featuresGrid}>
          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>📍</Text>
            <Text style={styles.featureTitle}>GPS Outdoor</Text>
            <Text style={styles.featureDesc}>Google Maps integration</Text>
          </View>
          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>📱</Text>
            <Text style={styles.featureTitle}>BLE Indoor</Text>
            <Text style={styles.featureDesc}>Beacon-based positioning</Text>
          </View>
          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🔄</Text>
            <Text style={styles.featureTitle}>Auto Transition</Text>
            <Text style={styles.featureDesc}>Seamless switching</Text>
          </View>
          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>👣</Text>
            <Text style={styles.featureTitle}>Step Counting</Text>
            <Text style={styles.featureDesc}>Pedestrian Dead Reckoning</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ------------------------------
// Floor Plan Navigation Screen (reserved — step counter / turn detection)
// Currently not rendered; NavigationScreen uses MappedInScreen directly.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FloorPlanScreen({ onBack }: { onBack: () => void }) {
  const [floor, setFloor] = useState<0 | 1>(0);
  const [stepCount, setStepCount] = useState(0);
  const [userPos, setUserPos] = useState<{
    x: number;
    y: number;
    name: string;
  } | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<{
    x: number;
    y: number;
    name: string;
  } | null>(null);
  const [path, setPath] = useState<{ x: number; y: number }[]>([]);
  const [arrived, setArrived] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(true);
  const [pedometerStatus, setPedometerStatus] = useState<"checking" | "active" | "fallback">("checking");
  const [lastTurn, setLastTurn] = useState<TurnDirection | null>(null);
  const turnClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // 1 step ≈ 22 px on the floor plan (scaled for 1581×737 image vs old 427×584)
  const STEP_LENGTH_PX = 22;
  // Pixels accumulated from steps, spent against the distance to the next path node
  const pixelDebtRef = useRef(0);
  // Pedometer gives cumulative steps since subscription — track last value to get delta
  const lastPedometerStepsRef = useRef(0);

  // Mutable ref so the pedometer callback always reads fresh state
  // without needing to be re-subscribed on every render
  const navRef = useRef({
    userPos: null as { x: number; y: number; name: string } | null,
    path: [] as { x: number; y: number }[],
    destination: null as { x: number; y: number; name: string } | null,
    arrived: false,
  });
  useEffect(() => { navRef.current.userPos = userPos; }, [userPos]);
  useEffect(() => { navRef.current.path = path; }, [path]);
  useEffect(() => { navRef.current.destination = selectedDestination; }, [selectedDestination]);
  useEffect(() => { navRef.current.arrived = arrived; }, [arrived]);

  // Auto-clear the turn banner after 2.5 s
  useEffect(() => {
    if (!lastTurn) return;
    if (turnClearTimer.current) clearTimeout(turnClearTimer.current);
    turnClearTimer.current = setTimeout(() => setLastTurn(null), 2500);
    return () => {
      if (turnClearTimer.current) clearTimeout(turnClearTimer.current);
    };
  }, [lastTurn]);

  // Turn detection — active only while navigation is in progress
  useTurnDetector({
    enabled: !!(userPos && selectedDestination && !arrived),
    threshold: 45,
    cooldown: 1000,
    onTurnDetected: (dir) => setLastTurn(dir),
  });

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // ── Floor-specific data ────────────────────────────────────────────────────
  const CANVAS      = floor === 0 ? CANVAS_FLOOR0      : CANVAS_FLOOR1;
  // Scale the floor plan to fit the phone screen (marginHorizontal 15 on each side)
  const { width: screenW } = Dimensions.get("window");
  const dispW = screenW - 30;
  const dispH = Math.round(CANVAS.height * (dispW / CANVAS.width));
  const LOCATIONS   = floor === 0 ? LOCATIONS_FLOOR0   : LOCATIONS_FLOOR1;
  const JUNCTION_POINTS = floor === 0 ? JUNCTION_POINTS_FLOOR0 : JUNCTION_POINTS_FLOOR1;
  const WALKABLE_CONNECTIONS = floor === 0 ? WALKABLE_CONNECTIONS_FLOOR0 : WALKABLE_CONNECTIONS_FLOOR1;
  const DEST_TO_JCT = floor === 0 ? DESTINATION_TO_JUNCTION_FLOOR0 : DESTINATION_TO_JUNCTION_FLOOR1;

  // Rebuild BFS graph whenever the floor changes
  const graph = useMemo(() => {
    const g = new Map<string, { x: number; y: number }[]>();
    for (const c of WALKABLE_CONNECTIONS) {
      const k1 = `${c.from.x},${c.from.y}`;
      const k2 = `${c.to.x},${c.to.y}`;
      if (!g.has(k1)) g.set(k1, []);
      if (!g.has(k2)) g.set(k2, []);
      g.get(k1)!.push({ x: c.to.x,   y: c.to.y   });
      g.get(k2)!.push({ x: c.from.x, y: c.from.y });
    }
    return g;
  }, [floor]); // eslint-disable-line react-hooks/exhaustive-deps

  const WALKABLE_PATHS = useMemo(() =>
    WALKABLE_CONNECTIONS.flatMap(c => [
      { x1: c.from.x, y1: c.from.y, x2: c.to.x,   y2: c.to.y   },
      { x1: c.to.x,   y1: c.to.y,   x2: c.from.x, y2: c.from.y },
    ]),
  [floor]); // eslint-disable-line react-hooks/exhaustive-deps

  function findPathThroughJunctions(
    start: { x: number; y: number },
    end:   { x: number; y: number },
  ): { x: number; y: number }[] {
    const queue = [{ x: start.x, y: start.y, path: [start] }];
    const visited = new Set([`${start.x},${start.y}`]);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (Math.hypot(cur.x - end.x, cur.y - end.y) < 15) return cur.path;
      for (const nb of graph.get(`${cur.x},${cur.y}`) ?? []) {
        const nk = `${nb.x},${nb.y}`;
        if (!visited.has(nk)) {
          visited.add(nk);
          queue.push({ x: nb.x, y: nb.y, path: [...cur.path, nb] });
        }
      }
    }
    return [start, end];
  }

  function getJunctionForDestination(name: string): { x: number; y: number } {
    return DEST_TO_JCT[name] ?? JUNCTION_POINTS[0];
  }

  // Reset navigation whenever the user switches floors
  const switchFloor = (f: 0 | 1) => {
    setFloor(f);
    setUserPos(null);
    setSelectedDestination(null);
    setPath([]);
    setArrived(false);
    setShowStartPicker(true);
    pixelDebtRef.current = 0;
    lastPedometerStepsRef.current = 0;
  };

  useEffect(() => {
    let sub: { remove: () => void } | null = null;

    const handleSteps = (newSteps: number) => {
      setStepCount((prev) => prev + newSteps);

      const { userPos, path, destination, arrived } = navRef.current;
      if (!userPos || !destination || arrived || path.length < 2) return;

      pixelDebtRef.current += newSteps * STEP_LENGTH_PX;

      // Find which path node the user is closest to
      let closestIndex = 0;
      let minDist = Infinity;
      for (let i = 0; i < path.length; i++) {
        const d = Math.hypot(userPos.x - path[i].x, userPos.y - path[i].y);
        if (d < minDist) { minDist = d; closestIndex = i; }
      }

      const nextIndex = Math.min(closestIndex + 1, path.length - 1);
      if (nextIndex === closestIndex) return;

      const distToNext = Math.hypot(
        path[nextIndex].x - userPos.x,
        path[nextIndex].y - userPos.y,
      );

      if (pixelDebtRef.current >= distToNext) {
        pixelDebtRef.current -= distToNext;
        const newPos = { x: path[nextIndex].x, y: path[nextIndex].y, name: userPos.name };
        navRef.current.userPos = newPos;

        const distToDest = Math.hypot(newPos.x - destination.x, newPos.y - destination.y);
        if (distToDest < 15) {
          navRef.current.arrived = true;
          setArrived(true);
          Alert.alert("🎉 Arrived!", `You have reached ${destination.name}!`);
        }
        setUserPos(newPos);
      }
    };

    const start = async () => {
      // ACTIVITY_RECOGNITION permission is required on Android 10+
      const { status } = await Pedometer.requestPermissionsAsync();
      const available = status === "granted" && await Pedometer.isAvailableAsync();

      if (available) {
        setPedometerStatus("active");
        lastPedometerStepsRef.current = 0;
        sub = Pedometer.watchStepCount(({ steps }) => {
          // `steps` is cumulative since subscription — compute delta to avoid double-counting
          const delta = steps - lastPedometerStepsRef.current;
          lastPedometerStepsRef.current = steps;
          if (delta > 0) handleSteps(delta);
        });
      } else {
        // Fallback: manual accelerometer step detection
        setPedometerStatus("fallback");
        Accelerometer.setUpdateInterval(200);
        let lastY = 0;
        sub = Accelerometer.addListener(({ y }) => {
          if (Math.abs(y - lastY) > 1.0 && y > 0.8) handleSteps(1);
          lastY = y;
        });
      }
    };

    start();
    return () => sub?.remove();
  }, []);

  const setStartingPosition = (location: (typeof LOCATIONS)[0]) => {
    setUserPos({ x: location.x, y: location.y, name: location.name });
    setShowStartPicker(false);
    Alert.alert(
      "✅ Starting Position Set",
      `You are at ${location.name}. Now select your destination.`,
    );
  };

  const setDestination = (location: (typeof LOCATIONS)[0]) => {
    if (!userPos) {
      Alert.alert(
        "Select Start First",
        "Please select your starting position first.",
      );
      return;
    }
    if (arrived) {
      Alert.alert("Reset First", "Tap 'Reset' to start over.");
      return;
    }
    setSelectedDestination({
      x: location.x,
      y: location.y,
      name: location.name,
    });
    const startJunction = getJunctionForDestination(userPos.name);
    const endJunction = getJunctionForDestination(location.name);
    const junctionPath = findPathThroughJunctions(startJunction, endJunction);
    const fullPath = [
      { x: userPos.x, y: userPos.y },
      ...junctionPath,
      { x: location.x, y: location.y },
    ];
    setPath(fullPath);
    Alert.alert(
      "🎯 Destination Set",
      `Navigating to ${location.name}. Tap 'Simulate Step' to move.`,
    );
  };

  const simulateStep = () => {
    if (!userPos || !selectedDestination || arrived) return;
    if (path.length > 1) {
      let closestIndex = 0;
      let minDist = Infinity;
      for (let i = 0; i < path.length; i++) {
        const dist = Math.hypot(userPos.x - path[i].x, userPos.y - path[i].y);
        if (dist < minDist) {
          minDist = dist;
          closestIndex = i;
        }
      }
      const nextIndex = Math.min(closestIndex + 1, path.length - 1);
      const newPos = {
        x: path[nextIndex].x,
        y: path[nextIndex].y,
        name: userPos.name,
      };
      const distToDest = Math.hypot(
        newPos.x - selectedDestination.x,
        newPos.y - selectedDestination.y,
      );
      if (distToDest < 15) {
        setArrived(true);
        Alert.alert(
          "🎉 Arrived!",
          `You have reached ${selectedDestination.name}!`,
        );
        setUserPos(newPos);
        setStepCount((prev) => prev + 1);
      } else {
        setUserPos(newPos);
        setStepCount((prev) => prev + 1);
      }
    }
  };


  const sendTestNotification = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Needed", "Please allow notifications");
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "📍 Approaching CHIC Mall",
        body: "You are 15 meters from the mall. Tap to switch to indoor navigation.",
        data: { screen: "switchToIndoor" },
      },
      trigger: null,
    });
    Alert.alert("Notification Sent", "Check your notification center!");
  };

  const resetNavigation = () => {
    setUserPos(null);
    setSelectedDestination(null);
    setPath([]);
    setStepCount(0);
    setArrived(false);
    setShowStartPicker(true);
    pixelDebtRef.current = 0;
    lastPedometerStepsRef.current = 0;
    Alert.alert("🔄 Reset", "Select your starting position again.");
  };

  return (
    <SafeAreaView style={styles.fullContainer}>
      <StatusBar style="light" />

      <LinearGradient colors={["#0066CC", "#004999"]} style={styles.navHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>
          {floor === 0 ? "Ground Floor" : "First Floor"}
        </Text>
        <View style={styles.floorSwitcher}>
          <TouchableOpacity
            style={[styles.floorBtn, floor === 0 && styles.floorBtnActive]}
            onPress={() => switchFloor(0)}
          >
            <Text style={styles.floorBtnText}>G</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.floorBtn, floor === 1 && styles.floorBtnActive]}
            onPress={() => switchFloor(1)}
          >
            <Text style={styles.floorBtnText}>1</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <View style={styles.selectorPanel}>
          <View style={styles.selectorHeader}>
            <Text style={styles.selectorIcon}>
              {showStartPicker ? "📍" : "🎯"}
            </Text>
            <Text style={styles.selectorTitle}>
              {showStartPicker
                ? "Where are you now?"
                : "Where do you want to go?"}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.locationScroll}
          >
            {LOCATIONS.map((loc, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.locationButton,
                  !showStartPicker &&
                    selectedDestination?.name === loc.name &&
                    styles.locationButtonActive,
                  showStartPicker &&
                    userPos?.name === loc.name &&
                    styles.locationButtonActive,
                ]}
                onPress={() =>
                  showStartPicker
                    ? setStartingPosition(loc)
                    : setDestination(loc)
                }
              >
                <Text style={styles.locationIcon}>{loc.icon}</Text>
                <Text style={styles.locationName}>{loc.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {!showStartPicker && userPos && (
            <TouchableOpacity
              style={styles.backToStartBtn}
              onPress={() => setShowStartPicker(true)}
            >
              <Text style={styles.backToStartText}>
                ← Change Starting Position
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.floorPlanContainer}>
          <MappedInScreen
            destination={selectedDestination?.name}
            onBack={onBack}
          />
        </View>

        <View style={styles.bottomPanel}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stepCount}</Text>
              <Text style={styles.statLabel}>Steps</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {pedometerStatus === "active" ? "👣" : pedometerStatus === "fallback" ? "📡" : "⏳"}
              </Text>
              <Text style={styles.statLabel}>
                {pedometerStatus === "active" ? "Pedometer" : pedometerStatus === "fallback" ? "Accel." : "..."}
              </Text>
            </View>
            {userPos && (
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>📍 {userPos.name}</Text>
              </View>
            )}
            {selectedDestination && (
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>
                  🎯 {selectedDestination.name}
                </Text>
              </View>
            )}
          </View>

          {lastTurn && (
            <View style={[
              styles.turnBanner,
              lastTurn === "LEFT"  && styles.turnBannerLeft,
              lastTurn === "RIGHT" && styles.turnBannerRight,
              lastTurn === "UTURN" && styles.turnBannerUturn,
            ]}>
              <Text style={styles.turnBannerIcon}>
                {lastTurn === "LEFT" ? "↰" : lastTurn === "RIGHT" ? "↱" : "↩"}
              </Text>
              <Text style={styles.turnBannerText}>
                {lastTurn === "LEFT" ? "Turn LEFT" : lastTurn === "RIGHT" ? "Turn RIGHT" : "U-Turn"}
              </Text>
            </View>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.stepButton,
                (!userPos || !selectedDestination) && styles.stepButtonDisabled,
              ]}
              onPress={simulateStep}
              disabled={!userPos || !selectedDestination}
            >
              <Text style={styles.buttonText}>🚶 Step</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.notifyButton}
              onPress={sendTestNotification}
            >
              <Text style={styles.buttonText}>🔔 Notify</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resetButtonSmall}
              onPress={resetNavigation}
            >
              <Text style={styles.buttonText}>🔄 Reset</Text>
            </TouchableOpacity>
          </View>
          {arrived && (
            <Text style={styles.arrivedText}>✅ Arrived at destination!</Text>
          )}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

function NavigationScreen({ destination, onBack }: any) {
  return <MappedInScreen destination={destination} onBack={onBack} />;
}

// ------------------------------
// APP MAIN
// ------------------------------
export default function App() {
  const [screen, setScreen] = useState<"home" | "navigation" | "onboarding">(
    "onboarding",
  );
  const [skipLocation, setSkipLocation] = useState(false);
  const [destination, setDestination] = useState("");
  const [mallLat, setMallLat] = useState(0);
  const [mallLng, setMallLng] = useState(0);

  useEffect(() => {
    const loadStoredData = async () => {
      const hasCompletedOnboarding = await AsyncStorage.getItem(
        "onboardingCompleted",
      );
      const storedDest = await AsyncStorage.getItem("destination");
      const storedLat = await AsyncStorage.getItem("mallLat");
      const storedLng = await AsyncStorage.getItem("mallLng");

      if (hasCompletedOnboarding === "true") {
        if (storedDest && storedLat && storedLng) {
          setDestination(storedDest);
          setMallLat(parseFloat(storedLat));
          setMallLng(parseFloat(storedLng));
          const lastNotif =
            await Notifications.getLastNotificationResponseAsync();
          if (
            lastNotif &&
            lastNotif.notification.request.content.data?.screen ===
              "switchToIndoor"
          ) {
            setSkipLocation(true);
            setScreen("navigation");
          } else {
            setScreen("home");
          }
        } else {
          setScreen("home");
        }
      } else {
        setScreen("onboarding");
      }
    };
    loadStoredData();

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (
          response.notification.request.content.data?.screen ===
          "switchToIndoor"
        ) {
          setSkipLocation(true);
          setScreen("navigation");
        }
      },
    );
    return () => subscription.remove();
  }, []);

  const handleOnboardingFinish = async () => {
    await AsyncStorage.setItem("onboardingCompleted", "true");
    setScreen("home");
  };

  const handleStartOutdoor = async () => {
    await AsyncStorage.setItem("destination", MALL_NAME);
    await AsyncStorage.setItem("mallLat", MALL_LAT.toString());
    await AsyncStorage.setItem("mallLng", MALL_LNG.toString());
    await AsyncStorage.removeItem("lastNotifiedDist");
    setDestination(MALL_NAME);
    setMallLat(MALL_LAT);
    setMallLng(MALL_LNG);

    const { status: notifStatus } = await Notifications.requestPermissionsAsync();
    if (notifStatus !== "granted") {
      Alert.alert(
        "Notifications Required",
        "Please allow notifications so we can alert you when you arrive at the mall.",
      );
      return;
    }

    try {
      const { status: foreStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (foreStatus === "granted") {
        const { status: backStatus } =
          await Location.requestBackgroundPermissionsAsync();
        if (backStatus === "granted") {
          const isRunning = await Location.hasStartedLocationUpdatesAsync(
            BACKGROUND_LOCATION_TASK,
          ).catch(() => false);
          if (!isRunning) {
            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 5,
              deferredUpdatesInterval: 5000,
              foregroundService: {
                notificationTitle: "SeamlessNav is active",
                notificationBody: "Monitoring your proximity to CHIC Mall.",
              },
            });
          }
        } else {
          Alert.alert(
            "Background Location Needed",
            "Please allow 'Always' location access so we can notify you when you arrive at the mall.",
          );
        }
      }
    } catch (e) {
      console.log("Background tracking setup error:", e);
    }
    // Stay on home screen — notification tap will navigate to indoor
  };

  const handleSelectDestination = async (
    dest: string,
    lat: number,
    lng: number,
    skip: boolean,
  ) => {
    await AsyncStorage.setItem("destination", dest);
    await AsyncStorage.setItem("mallLat", lat.toString());
    await AsyncStorage.setItem("mallLng", lng.toString());
    setDestination(dest);
    setMallLat(lat);
    setMallLng(lng);
    setSkipLocation(skip);
    setScreen("navigation");
  };

  if (screen === "onboarding") {
    return <OnboardingScreen onFinish={handleOnboardingFinish} />;
  }

  if (screen === "home") {
    return (
      <HomeScreen
        onStartOutdoor={handleStartOutdoor}
        onSelectDestination={handleSelectDestination}
      />
    );
  }

  return (
    <NavigationScreen
      destination={destination}
      mallLat={mallLat}
      mallLng={mallLng}
      skipLocation={skipLocation}
      onBack={() => setScreen("home")}
    />
  );
}

const styles = StyleSheet.create({
  // Home Screen Styles
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  gradientHeader: {
    paddingTop: 60,
    paddingBottom: 40,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerContent: { alignItems: "center" },
  title: { fontSize: 32, fontWeight: "bold", color: "white", letterSpacing: 1 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 5 },
  locationChip: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 12,
  },
  locationChipText: { color: "white", fontSize: 12 },
  content: { flex: 1, marginTop: -20 },

  mainCard: {
    margin: 20,
    borderRadius: 25,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  mainCardGradient: { padding: 24, alignItems: "center" },
  mainCardEmoji: { fontSize: 48, marginBottom: 8 },
  mainCardTitle: { fontSize: 24, fontWeight: "bold", color: "white" },
  mainCardSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 20,
  },
  mainButton: {
    flexDirection: "row",
    backgroundColor: "white",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: "center",
    gap: 10,
  },
  mainButtonText: { fontSize: 16, fontWeight: "bold", color: "#0066CC" },
  mainButtonIcon: { fontSize: 18 },

  demoButton: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 25,
    overflow: "hidden",
  },
  demoButtonGradient: { padding: 18, alignItems: "center" },
  demoButtonText: { fontSize: 16, fontWeight: "bold", color: "white" },
  demoButtonSubtext: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
  },

  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 30,
    gap: 10,
  },
  featureCard: {
    backgroundColor: "white",
    flex: 1,
    minWidth: "45%",
    padding: 15,
    borderRadius: 15,
    alignItems: "center",
    elevation: 2,
  },
  featureIcon: { fontSize: 28, marginBottom: 6 },
  featureTitle: { fontSize: 13, fontWeight: "600", color: "#333" },
  featureDesc: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
    marginTop: 2,
  },

  // Indoor Screen Styles
  fullContainer: { flex: 1, backgroundColor: "#F5F5F5" },
  navHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backButton: { padding: 5 },
  backText: { color: "white", fontSize: 24, fontWeight: "bold" },
  navTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  fitButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
  },
  fitButtonText: { color: "white", fontSize: 12, fontWeight: "bold" },

  selectorPanel: {
    backgroundColor: "white",
    margin: 15,
    padding: 15,
    borderRadius: 20,
    elevation: 3,
  },
  selectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  selectorIcon: { fontSize: 20, marginRight: 8 },
  selectorTitle: { fontSize: 16, fontWeight: "bold", color: "#333" },
  locationScroll: { flexDirection: "row", maxHeight: 50 },
  locationButton: {
    backgroundColor: "#F0F0F0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 25,
    marginRight: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  locationButtonActive: { backgroundColor: "#0066CC" },
  locationIcon: { fontSize: 14, marginRight: 6, color: "#333" },
  locationName: { fontSize: 12, fontWeight: "500", color: "#333" },
  backToStartBtn: { marginTop: 12, alignItems: "center" },
  backToStartText: { color: "#0066CC", fontSize: 12, fontWeight: "500" },

  floorPlanContainer: {
    flex: 1,
    marginHorizontal: 15,
    marginVertical: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
    backgroundColor: "#000",
    marginHorizontal: 15,
    borderRadius: 15,
    overflow: "hidden",
  },

  bottomPanel: {
    backgroundColor: "white",
    padding: 20,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  statBox: {
    backgroundColor: "#F8F9FA",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    marginHorizontal: 4,
  },
  statValue: { fontSize: 18, fontWeight: "bold", color: "#0066CC" },
  statLabel: {
    fontSize: 11,
    color: "#666",
    fontWeight: "600",
    textAlign: "center",
  },
  actionRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  stepButton: {
    flex: 2,
    backgroundColor: "#4CAF50",
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: "center",
  },
  stepButtonDisabled: { backgroundColor: "#A5D6A7", opacity: 0.6 },
  notifyButton: {
    flex: 1.2,
    backgroundColor: "#FF9800",
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: "center",
  },
  resetButtonSmall: {
    flex: 1.2,
    backgroundColor: "#f44336",
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 14 },
  arrivedText: {
    textAlign: "center",
    color: "#4CAF50",
    fontWeight: "bold",
    marginTop: 12,
    fontSize: 14,
  },

  // Floor switcher
  floorSwitcher: { flexDirection: "row", gap: 6 },
  floorBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  floorBtnActive: { backgroundColor: "white" },
  floorBtnText: { fontSize: 14, fontWeight: "bold", color: "#0066CC" },

  // Turn detection banner
  turnBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 10,
    gap: 10,
  },
  turnBannerLeft:  { backgroundColor: "#1565C0" },
  turnBannerRight: { backgroundColor: "#1B5E20" },
  turnBannerUturn: { backgroundColor: "#B71C1C" },
  turnBannerIcon: { fontSize: 26, color: "white" },
  turnBannerText: { fontSize: 16, fontWeight: "bold", color: "white" },
});
