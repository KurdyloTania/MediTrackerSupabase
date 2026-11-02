// src/screens/SplashScreen.tsx
// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../theme/colors';

const C = COLORS;

export default function AppSplashScreen() {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 300, delay: 100, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[styles.logoWrap, { transform: [{ scale }], opacity }]}>
        <View style={styles.logoCircle}>
          <Icon name="pill-multiple" size={48} color={C.cream} />
        </View>
      </Animated.View>
      <Animated.View style={{ opacity: textOpacity }}>
        <Text style={styles.title}>MediTracker</Text>
        <Text style={styles.subtitle}>Ваш персональний помічник у лікуванні</Text>
      </Animated.View>
      <View style={styles.dots}>
        {[0, 1, 2].map(i => (
          <View
            key={i}
            style={[styles.dot, i === 1 && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: C.darkGreen,
    alignItems: 'center', justifyContent: 'center',
    gap: 20,
  },
  logoWrap: { marginBottom: 10 },
  logoCircle: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(146,183,117,0.4)',
  },
  title: {
    fontSize: 30, fontWeight: '800', color: C.cream,
    letterSpacing: -0.5, textAlign: 'center',
  },
  subtitle: {
    fontSize: 14, color: 'rgba(243,232,211,0.65)',
    textAlign: 'center', marginTop: 8,
  },
  dots: {
    flexDirection: 'row', gap: 8,
    position: 'absolute', bottom: 60,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(243,232,211,0.3)',
  },
  dotActive: { backgroundColor: C.softGreen, width: 20 },
});