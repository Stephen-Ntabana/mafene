import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

const onboardingData = [
  {
    id: "1",
    title: "📍 Step 1: Choose Your Destination",
    description:
      "Tap on CHIC Mall to start outdoor navigation. Google Maps will open with directions to the mall entrance.",
    icon: "🗺️",
    gradientColors: ["#0066CC", "#0055AA"] as const,
  },
  {
    id: "2",
    title: "🚗 Step 2: Follow Google Maps",
    description:
      "Drive or walk to the mall using Google Maps. The app runs in the background tracking your location.",
    icon: "🚗",
    gradientColors: ["#4CAF50", "#388E3C"] as const,
  },
  {
    id: "3",
    title: "🔔 Step 3: Get Notified",
    description:
      "When you are within 20 meters of the mall, you will receive a push notification. Tap it to enter indoor navigation.",
    icon: "🔔",
    gradientColors: ["#FF9800", "#F57C00"] as const,
  },
  {
    id: "4",
    title: "📍 Step 4: Set Your Position",
    description:
      "Tap on the floor plan where you are standing. Then select your destination (Coffee Shop, Restaurant, etc.).",
    icon: "👆",
    gradientColors: ["#9C27B0", "#7B1FA2"] as const,
  },
  {
    id: "5",
    title: "🚶 Step 5: Start Walking",
    description:
      "Walk while holding your phone. The app counts your steps and moves the blue dot along the path to your destination.",
    icon: "🚶",
    gradientColors: ["#2196F3", "#1976D2"] as const,
  },
  {
    id: "6",
    title: "🎉 You're Ready!",
    description: 'Tap "Get Started" to begin using SeamlessNav.',
    icon: "🚀",
    gradientColors: ["#E91E63", "#C2185B"] as const,
  },
];

const OnboardingScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
      setCurrentIndex(currentIndex + 1);
    } else {
      onFinish();
    }
  };

  const handleSkip = () => {
    onFinish();
  };

  const renderItem = ({ item }: { item: (typeof onboardingData)[0] }) => {
    return (
      <View style={[styles.slide, { width }]}>
        <LinearGradient
          colors={item.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientCard}
        >
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>
        </LinearGradient>
      </View>
    );
  };

  const renderDot = () => {
    const dotPosition = Animated.divide(scrollX, width);
    return (
      <View style={styles.dotsContainer}>
        {onboardingData.map((_, idx) => {
          const inputRange = [idx - 1, idx, idx + 1];
          const opacityOutputRange = [0.3, 1, 0.3];
          const scaleOutputRange = [0.8, 1.2, 0.8];

          const opacity = dotPosition.interpolate({
            inputRange,
            outputRange: opacityOutputRange,
            extrapolate: "clamp" as Animated.ExtrapolateType,
          });
          const scale = dotPosition.interpolate({
            inputRange,
            outputRange: scaleOutputRange,
            extrapolate: "clamp" as Animated.ExtrapolateType,
          });
          return (
            <Animated.View
              key={idx}
              style={[styles.dot, { opacity, transform: [{ scale }] }]}
            />
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        keyExtractor={(item) => item.id}
      />

      {renderDot()}

      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <LinearGradient
          colors={["#0066CC", "#004999"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.nextButtonGradient}
        >
          <Text style={styles.nextButtonText}>
            {currentIndex === onboardingData.length - 1
              ? "Get Started"
              : "Next"}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {onboardingData.length}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f3460",
  },
  skipButton: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  skipText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  slide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  gradientCard: {
    width: width - 60,
    padding: 30,
    borderRadius: 30,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  icon: {
    fontSize: 80,
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    marginBottom: 15,
  },
  description: {
    fontSize: 16,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    lineHeight: 24,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "white",
    marginHorizontal: 6,
  },
  nextButton: {
    marginHorizontal: 40,
    marginBottom: 40,
    borderRadius: 30,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  nextButtonGradient: {
    paddingVertical: 15,
    alignItems: "center",
  },
  nextButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  progressContainer: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  progressText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});

export default OnboardingScreen;
