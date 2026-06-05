import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import * as TaskManager from "expo-task-manager";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
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
import MappedInScreen from "../../screens/MappedInScreen";
import OnboardingScreen from "../../screens/OnboardingScreen";

// ------------------------------
// Constants
// ------------------------------
const MALL_NAME = "Mateus House";
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
              title: "🏬 You've arrived at Mateus House!",
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
              title: "📍 Approaching Mateus House",
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
          <Image
            source={require("../../assets/images/tajyire-logo.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.title}>SeamlessNav</Text>
          <Text style={styles.subtitle}>Where Electronics Businesses Find Space, Skills, And Scale</Text>
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
            <Text style={styles.mainCardTitle}>Mateus House</Text>
            <Text style={styles.mainCardSubtitle}>Kigali, Rwanda</Text>
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
            <Text style={styles.permissionHint}>
              Requires location &amp; notification access to alert you on arrival
            </Text>
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
            <Text style={styles.demoButtonText}>🏢 Indoor Navigation</Text>
            <Text style={styles.demoButtonSubtext}>
              Navigate inside Mateus House
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
            <Text style={styles.featureIcon}>🗺️</Text>
            <Text style={styles.featureTitle}>Indoor Maps</Text>
            <Text style={styles.featureDesc}>Mappedin integration</Text>
          </View>
          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🔄</Text>
            <Text style={styles.featureTitle}>Auto Transition</Text>
            <Text style={styles.featureDesc}>Seamless switching</Text>
          </View>
          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🏪</Text>
            <Text style={styles.featureTitle}>Tech Hub</Text>
            <Text style={styles.featureDesc}>5 services under one roof</Text>
          </View>
        </View>

        <View style={styles.contactStrip}>
          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => Linking.openURL("tel:+250793396427")}
          >
            <Text style={styles.contactIcon}>📞</Text>
            <Text style={styles.contactText}>+250 793 396 427</Text>
          </TouchableOpacity>
          <View style={styles.contactDivider} />
          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => Linking.openURL("mailto:tajyiregroup@gmail.com")}
          >
            <Text style={styles.contactIcon}>✉️</Text>
            <Text style={styles.contactText}>tajyiregroup@gmail.com</Text>
          </TouchableOpacity>
          <View style={styles.contactDivider} />
          <View style={styles.contactItem}>
            <Text style={styles.contactIcon}>🕐</Text>
            <Text style={styles.contactText}>Mon–Fri, 9AM–7PM</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


function NavigationScreen({ destination, onBack }: { destination: string; onBack: () => void }) {
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
      const [hasCompletedOnboarding, storedDest, storedLat, storedLng] =
        await Promise.all([
          AsyncStorage.getItem("onboardingCompleted"),
          AsyncStorage.getItem("destination"),
          AsyncStorage.getItem("mallLat"),
          AsyncStorage.getItem("mallLng"),
        ]);

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

  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "navigation") {
        setScreen("home");
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [screen]);

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
                notificationBody: "Monitoring your proximity to Mateus House.",
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

  // Render all screens simultaneously once past onboarding.
  // NavigationScreen is mounted as a hidden overlay on the home screen so the
  // WebView starts loading immediately — toggling display avoids a full reload
  // every time the user navigates in and out of the map.
  if (screen === "onboarding") {
    return <OnboardingScreen onFinish={handleOnboardingFinish} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {screen === "home" && (
        <HomeScreen
          onStartOutdoor={handleStartOutdoor}
          onSelectDestination={handleSelectDestination}
        />
      )}

      {/* Keep WebView alive between visits — only hide, never unmount */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { display: screen === "navigation" ? "flex" : "none" },
        ]}
        pointerEvents={screen === "navigation" ? "box-none" : "none"}
      >
        <NavigationScreen
          destination={destination}
          onBack={() => setScreen("home")}
        />
      </View>
    </View>
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
  headerLogo: { width: 80, height: 80, marginBottom: 8 },
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

  contactStrip: {
    marginHorizontal: 20,
    marginBottom: 30,
    backgroundColor: "white",
    borderRadius: 15,
    paddingVertical: 12,
    paddingHorizontal: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  contactIcon: { fontSize: 16 },
  contactText: { fontSize: 12, color: "#444", flex: 1 },
  contactDivider: {
    height: 1,
    backgroundColor: "#F0F0F0",
  },

  permissionHint: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: 10,
  },

});
