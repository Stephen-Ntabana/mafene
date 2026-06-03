import React, { useState } from "react";
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// Define types
interface HomeScreenProps {
  onSelectDestination: (destination: string) => void;
}

interface NavigationScreenProps {
  destination: string;
  onBack: () => void;
}

function HomeScreen({ onSelectDestination }: HomeScreenProps) {
  const destinations = [
    { id: 1, name: "CHIC Mall - Main Entrance", icon: "🏬" },
    { id: 2, name: "CHIC Mall - Food Court", icon: "🍔" },
    { id: 3, name: "YYUSSA CITY CENTER", icon: "🏢" },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🚀 SeamlessNav</Text>
        <Text style={styles.subtitle}>Outdoor → Indoor Navigation</Text>
        <Text style={styles.location}>Kigali, Rwanda</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Select Destination</Text>
        {destinations.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            onPress={() => onSelectDestination(item.name)}
          >
            <Text style={styles.cardText}>
              {item.icon} {item.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function NavigationScreen({ destination, onBack }: NavigationScreenProps) {
  const [mode, setMode] = useState<string>("outdoor");

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Navigation</Text>
        <View style={{ width: 50 }} />
      </View>
      <View
        style={[
          styles.modeBadge,
          mode === "outdoor" ? styles.outdoor : styles.indoor,
        ]}
      >
        <Text style={styles.modeText}>
          {mode === "outdoor"
            ? "🌍 OUTDOOR MODE (GPS)"
            : "📱 INDOOR MODE (BLE)"}
        </Text>
      </View>
      <View style={styles.mapBox}>
        <Text style={styles.mapText}>Destination: {destination}</Text>
        <Text style={styles.mapText}>
          {mode === "outdoor"
            ? "📍 Following GPS to mall entrance..."
            : "📍 BLE beacons tracking your position..."}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.switchBtn}
        onPress={() => setMode(mode === "outdoor" ? "indoor" : "outdoor")}
      >
        <Text style={styles.btnText}>🔄 Test Mode Switch</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

export default function App() {
  const [screen, setScreen] = useState<"home" | "navigation">("home");
  const [destination, setDestination] = useState<string>("");

  if (screen === "home") {
    return (
      <HomeScreen
        onSelectDestination={(dest: string) => {
          setDestination(dest);
          setScreen("navigation");
        }}
      />
    );
  }
  return (
    <NavigationScreen
      destination={destination}
      onBack={() => setScreen("home")}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    backgroundColor: "#0066CC",
    padding: 50,
    paddingTop: 60,
    alignItems: "center",
  },
  title: { fontSize: 28, fontWeight: "bold", color: "white" },
  subtitle: { fontSize: 14, color: "#E0E0E0", marginTop: 5 },
  location: { fontSize: 12, color: "#B3D4FC", marginTop: 5 },
  content: { padding: 20 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#333",
  },
  card: {
    backgroundColor: "white",
    padding: 18,
    borderRadius: 12,
    marginBottom: 10,
  },
  cardText: { fontSize: 16 },
  navHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    backgroundColor: "#0066CC",
  },
  backText: { color: "white", fontSize: 16 },
  navTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  modeBadge: { padding: 12, alignItems: "center" },
  outdoor: { backgroundColor: "#4CAF50" },
  indoor: { backgroundColor: "#2196F3" },
  modeText: { color: "white", fontWeight: "bold" },
  mapBox: {
    flex: 1,
    margin: 15,
    backgroundColor: "#333",
    borderRadius: 15,
    padding: 20,
    alignItems: "center",
  },
  mapText: { color: "white", fontSize: 16, marginVertical: 5 },
  switchBtn: {
    backgroundColor: "#FF9800",
    margin: 15,
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "bold" },
});
