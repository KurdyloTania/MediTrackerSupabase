// app.config.js
export default {
  expo: {
    name: "MediTrackerSupabase",
    slug: "meditrackersupabase",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.meditracker.supabase"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.meditracker.supabase"
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-notifications"
    ],
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      // 👇 ДОДАЙТЕ ЦІ РЯДКИ
      eas: {
        projectId: "ac5d9f56-d930-455c-93e3-7718d1863f0f"
      }
    }
  }
};