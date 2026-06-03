import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Accelerometer } from "expo-sensors";
import { StatusBar } from "expo-status-bar";
import * as TaskManager from "expo-task-manager";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line } from "react-native-svg";
import OnboardingScreen from "../../screens/OnboardingScreen";

// ------------------------------
// Constants
// ------------------------------
const MALL_NAME = "CHIC Mall - Main Entrance";
const MALL_LAT = -1.942472;
const MALL_LNG = 30.058417;

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

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
        const storedDestination = await AsyncStorage.getItem("destination");
        if (storedMallLat && storedMallLng && storedDestination) {
          const mallLat = parseFloat(storedMallLat);
          const mallLng = parseFloat(storedMallLng);
          const dist = calculateDistance(
            lastLocation.coords.latitude,
            lastLocation.coords.longitude,
            mallLat,
            mallLng,
          );
          if (dist <= 40 && dist >= 5) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "📍 Approaching CHIC Mall",
                body: `You are roughly ${Math.round(dist)} meters away. Tap to switch to indoor navigation.`,
                data: { screen: "switchToIndoor" },
              },
              trigger: null,
            });
          }
        }
      } catch (err) {}
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
  onSelectDestination,
}: {
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

  const openGoogleMaps = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${MALL_LAT},${MALL_LNG}&travelmode=driving`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Could not open Google Maps"),
    );
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
              onPress={() => {
                openGoogleMaps();
                onSelectDestination(MALL_NAME, MALL_LAT, MALL_LNG, false);
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
// Floor Plan Navigation Screen
// ------------------------------
function FloorPlanScreen({ onBack }: { onBack: () => void }) {
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
  const accelerometerSubscription = useRef<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const LOCATIONS = [
    { name: "Entrance 1", x: 120, y: 560, icon: "🚪" },
    { name: "Entrance 2", x: 268, y: 560, icon: "🚪" },
    { name: "Stairs 1", x: 108, y: 542, icon: "📶" },
    { name: "Stairs 2", x: 85, y: 61, icon: "📶" },
    { name: "Elevator 1", x: 106, y: 135, icon: "🔘" },
    { name: "Elevator 2", x: 268, y: 531, icon: "🔘" },
    { name: "Toilet 1 (Men)", x: 68, y: 500, icon: "🚻" },
    { name: "Toilet 2 (Women)", x: 125, y: 92, icon: "🚺" },
    { name: "Coffee Shop", x: 176, y: 286, icon: "☕" },
    { name: "Restaurant", x: 199, y: 355, icon: "🍔" },
  ];

  const JUNCTION_POINTS = [
    { x: 269, y: 495, name: "J1" },
    { x: 319, y: 490, name: "J2" },
    { x: 324, y: 304, name: "J3" },
    { x: 321, y: 164, name: "J4" },
    { x: 187, y: 485, name: "J5" },
    { x: 187, y: 329, name: "J6" },
    { x: 187, y: 302, name: "J7" },
    { x: 186, y: 240, name: "J8" },
    { x: 189, y: 164, name: "J9" },
    { x: 188, y: 151, name: "J10" },
    { x: 123, y: 149, name: "J11" },
    { x: 124, y: 100, name: "J12" },
    { x: 75, y: 95, name: "J13" },
    { x: 84, y: 67, name: "J14" },
    { x: 74, y: 484, name: "J15" },
    { x: 74, y: 330, name: "J16" },
    { x: 74, y: 237, name: "J17" },
    { x: 118, y: 490, name: "J18" },
  ];

  const DESTINATION_TO_JUNCTION: { [key: string]: { x: number; y: number } } = {
    "Entrance 1": { x: 118, y: 490 },
    "Entrance 2": { x: 269, y: 495 },
    "Stairs 1": { x: 118, y: 490 },
    "Stairs 2": { x: 84, y: 67 },
    "Elevator 1": { x: 124, y: 100 },
    "Elevator 2": { x: 269, y: 495 },
    "Toilet 1 (Men)": { x: 74, y: 484 },
    "Toilet 2 (Women)": { x: 84, y: 67 },
    "Coffee Shop": { x: 187, y: 302 },
    Restaurant: { x: 187, y: 329 },
  };

  const WALKABLE_CONNECTIONS = [
    { from: { x: 269, y: 495 }, to: { x: 319, y: 490 } },
    { from: { x: 319, y: 490 }, to: { x: 324, y: 304 } },
    { from: { x: 324, y: 304 }, to: { x: 321, y: 164 } },
    { from: { x: 321, y: 164 }, to: { x: 189, y: 164 } },
    { from: { x: 189, y: 164 }, to: { x: 188, y: 151 } },
    { from: { x: 188, y: 151 }, to: { x: 123, y: 149 } },
    { from: { x: 123, y: 149 }, to: { x: 124, y: 100 } },
    { from: { x: 124, y: 100 }, to: { x: 75, y: 95 } },
    { from: { x: 75, y: 95 }, to: { x: 84, y: 67 } },
    { from: { x: 269, y: 495 }, to: { x: 187, y: 485 } },
    { from: { x: 187, y: 485 }, to: { x: 187, y: 329 } },
    { from: { x: 187, y: 329 }, to: { x: 187, y: 302 } },
    { from: { x: 187, y: 302 }, to: { x: 186, y: 240 } },
    { from: { x: 186, y: 240 }, to: { x: 189, y: 164 } },
    { from: { x: 324, y: 304 }, to: { x: 187, y: 302 } },
    { from: { x: 269, y: 495 }, to: { x: 118, y: 490 } },
    { from: { x: 74, y: 484 }, to: { x: 74, y: 330 } },
    { from: { x: 74, y: 330 }, to: { x: 74, y: 237 } },
    { from: { x: 74, y: 237 }, to: { x: 75, y: 95 } },
    { from: { x: 74, y: 330 }, to: { x: 187, y: 329 } },
    { from: { x: 74, y: 237 }, to: { x: 186, y: 240 } },
    { from: { x: 118, y: 490 }, to: { x: 187, y: 485 } },
    { from: { x: 118, y: 490 }, to: { x: 74, y: 484 } },
  ];

  const graph: Map<string, { x: number; y: number }[]> = new Map();
  for (const conn of WALKABLE_CONNECTIONS) {
    const key1 = `${conn.from.x},${conn.from.y}`;
    const key2 = `${conn.to.x},${conn.to.y}`;
    if (!graph.has(key1)) graph.set(key1, []);
    if (!graph.has(key2)) graph.set(key2, []);
    graph.get(key1)!.push({ x: conn.to.x, y: conn.to.y });
    graph.get(key2)!.push({ x: conn.from.x, y: conn.from.y });
  }

  const WALKABLE_PATHS: { x1: number; y1: number; x2: number; y2: number }[] =
    [];
  for (const conn of WALKABLE_CONNECTIONS) {
    WALKABLE_PATHS.push({
      x1: conn.from.x,
      y1: conn.from.y,
      x2: conn.to.x,
      y2: conn.to.y,
    });
    WALKABLE_PATHS.push({
      x1: conn.to.x,
      y1: conn.to.y,
      x2: conn.from.x,
      y2: conn.from.y,
    });
  }

  function findPathThroughJunctions(
    startJunction: { x: number; y: number },
    endJunction: { x: number; y: number },
  ): { x: number; y: number }[] {
    const queue: { x: number; y: number; path: { x: number; y: number }[] }[] =
      [{ x: startJunction.x, y: startJunction.y, path: [startJunction] }];
    const visited = new Set<string>();
    visited.add(`${startJunction.x},${startJunction.y}`);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (
        Math.hypot(current.x - endJunction.x, current.y - endJunction.y) < 10
      ) {
        return current.path;
      }
      const key = `${current.x},${current.y}`;
      const neighbors = graph.get(key) || [];
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (!visited.has(neighborKey)) {
          visited.add(neighborKey);
          queue.push({
            x: neighbor.x,
            y: neighbor.y,
            path: [...current.path, neighbor],
          });
        }
      }
    }
    return [startJunction, endJunction];
  }

  function getJunctionForDestination(destinationName: string): {
    x: number;
    y: number;
  } {
    return DESTINATION_TO_JUNCTION[destinationName] || { x: 187, y: 302 };
  }

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);
    let lastY = 0;
    const stepThreshold = 1.0;
    const subscription = Accelerometer.addListener((data) => {
      const { y } = data;
      if (Math.abs(y - lastY) > stepThreshold && y > 0.8) {
        setStepCount((prevCount) => prevCount + 1);
      }
      lastY = y;
    });
    accelerometerSubscription.current = subscription;
    return () => subscription.remove();
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

  const resetZoom = () => {
    if (scrollViewRef.current)
      scrollViewRef.current.setNativeProps({ zoomScale: 1 });
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
    Alert.alert("🔄 Reset", "Select your starting position again.");
  };

  return (
    <SafeAreaView style={styles.fullContainer}>
      <StatusBar style="light" />

      <LinearGradient colors={["#0066CC", "#004999"]} style={styles.navHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Indoor Navigation</Text>
        <TouchableOpacity onPress={resetZoom} style={styles.fitButton}>
          <Text style={styles.fitButtonText}>Fit</Text>
        </TouchableOpacity>
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

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          maximumZoomScale={3}
          minimumZoomScale={1}
          showsVerticalScrollIndicator={true}
          showsHorizontalScrollIndicator={true}
          pinchGestureEnabled={true}
          bounces={true}
        >
          <View style={{ width: 427, height: 584 }}>
            <Image
              source={require("../../assets/images/floorplan.png")}
              style={{ width: 427, height: 584, position: "absolute" }}
              resizeMode="contain"
              onError={(e) => console.log("Image error:", e.nativeEvent.error)}
            />
            <Svg style={{ width: 427, height: 584, position: "absolute" }}>
              {WALKABLE_PATHS.map((p, idx) => (
                <Line
                  key={`walk-${idx}`}
                  x1={p.x1}
                  y1={p.y1}
                  x2={p.x2}
                  y2={p.y2}
                  stroke="#4CAF50"
                  strokeWidth="2"
                  strokeOpacity="0.3"
                />
              ))}
              {path.map(
                (p, idx) =>
                  idx < path.length - 1 && (
                    <Line
                      key={`nav-${idx}`}
                      x1={p.x}
                      y1={p.y}
                      x2={path[idx + 1].x}
                      y2={path[idx + 1].y}
                      stroke="#0066CC"
                      strokeWidth="3"
                      strokeDasharray="6,4"
                    />
                  ),
              )}
              {JUNCTION_POINTS.map((j, idx) => (
                <Circle
                  key={`junc-${idx}`}
                  cx={j.x}
                  cy={j.y}
                  r="3"
                  fill="#888888"
                  stroke="white"
                  strokeWidth="1"
                />
              ))}
              {LOCATIONS.map((dest, idx) => (
                <Circle
                  key={`dest-${idx}`}
                  cx={dest.x}
                  cy={dest.y}
                  r="6"
                  fill="#FF4444"
                  stroke="white"
                  strokeWidth="2"
                />
              ))}
              {userPos && (
                <>
                  <Circle
                    cx={userPos.x}
                    cy={userPos.y}
                    r="10"
                    fill="#0066CC"
                    stroke="white"
                    strokeWidth="3"
                  />
                  <Circle cx={userPos.x} cy={userPos.y} r="4" fill="white" />
                </>
              )}
            </Svg>
          </View>
        </ScrollView>

        <View style={styles.bottomPanel}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stepCount}</Text>
              <Text style={styles.statLabel}>Steps</Text>
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

function NavigationScreen({
  skipLocation,
  destination,
  mallLat,
  mallLng,
  onBack,
}: any) {
  return <FloorPlanScreen onBack={onBack} />;
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

    if (!skip) {
      try {
        const { status: foreStatus } =
          await Location.requestForegroundPermissionsAsync();
        if (foreStatus === "granted") {
          const { status: backStatus } =
            await Location.requestBackgroundPermissionsAsync();
          if (backStatus === "granted") {
            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 5,
              deferredUpdatesInterval: 5000,
              foregroundService: {
                notificationTitle: "SeamlessNav Tracking",
                notificationBody: "Monitoring proximity to CHIC Mall.",
              },
            });
          }
        }
      } catch (e) {
        console.log("Background tracking setup error: ", e);
      }
    }
  };

  if (screen === "onboarding") {
    return <OnboardingScreen onFinish={handleOnboardingFinish} />;
  }

  if (screen === "home") {
    return <HomeScreen onSelectDestination={handleSelectDestination} />;
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
});
