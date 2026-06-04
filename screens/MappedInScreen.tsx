import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";

const VENUE_ID = "6a21b0e1e84964000b752362";
const BASE_URL  = `https://app.mappedin.com/map/${VENUE_ID}?embedded=true`;

interface Props {
  /** Optional destination name to deep-link directly into directions */
  destination?: string;
  onBack: () => void;
}

export default function MappedInScreen({ destination, onBack }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(false);

  // Build URL — if a destination is passed we append it so Mappedin can
  // pre-fill the search / start directions automatically.
  const mapUrl = destination
    ? `${BASE_URL}&location=${encodeURIComponent(destination)}`
    : BASE_URL;

  const reload = () => {
    setError(false);
    setLoading(true);
    webViewRef.current?.reload();
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Indoor Map</Text>
        <TouchableOpacity onPress={reload} style={styles.reloadBtn}>
          <Text style={styles.reloadText}>↺</Text>
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: mapUrl }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onLoadStart={() => { setLoading(true); setError(false); }}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          onHttpError={() => { setLoading(false); setError(true); }}
        />

        {loading && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#0066CC" />
            <Text style={styles.loadingText}>Loading indoor map…</Text>
          </View>
        )}

        {error && (
          <View style={styles.overlay}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorTitle}>Couldn't load map</Text>
            <Text style={styles.errorSub}>Check your internet connection</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={reload}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: "#F5F5F5" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0066CC",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn:   { padding: 6 },
  backText:  { color: "white", fontSize: 24, fontWeight: "bold" },
  title:     { color: "white", fontSize: 18, fontWeight: "bold" },
  reloadBtn: { padding: 6 },
  reloadText:{ color: "white", fontSize: 22 },

  mapContainer: { flex: 1 },
  webview:      { flex: 1 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(245,245,245,0.95)",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loadingText: { fontSize: 15, color: "#555", fontWeight: "500" },

  errorEmoji: { fontSize: 44 },
  errorTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  errorSub:   { fontSize: 14, color: "#777" },
  retryBtn: {
    marginTop: 8,
    backgroundColor: "#0066CC",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryText: { color: "white", fontWeight: "bold", fontSize: 15 },
});
