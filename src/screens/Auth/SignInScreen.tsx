// src/screens/Auth/SignInScreen.tsx
// @ts-nocheck
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, StatusBar, Alert,
} from 'react-native';
import { TextInput, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../theme/colors';

const C = COLORS;

export default function SignInScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!email.trim()) errs.email = 'Введіть email';
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Некоректний email';
    if (!password) errs.password = 'Введіть пароль';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSignIn = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (error: any) {
      const msg = error?.message?.includes('Invalid')
        ? 'Невірний email або пароль'
        : error?.message || 'Помилка входу';
      Alert.alert('Помилка', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header - зелений верх */}
      <View style={styles.header}>
        <View style={styles.logoWrap}>
          <Icon name="pill-multiple" size={36} color={C.cream} />
        </View>
        <Text style={styles.appName}>MediTracker</Text>
        <Text style={styles.tagline}>Ваш персональний помічник</Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Біла картка на всю ширину та висоту */}
        <View style={styles.whiteCard}>
          <Text style={styles.cardTitle}>Вхід до акаунту</Text>

          <TextInput
            label="Email"
            value={email}
            onChangeText={v => { setEmail(v); setErrors(p => ({ ...p, email: '' })); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            mode="outlined"
            outlineColor={errors.email ? C.missed : C.border}
            activeOutlineColor={C.darkGreen}
            textColor={C.text}
            style={styles.input}
            left={<TextInput.Icon icon="email-outline" color={C.textSub} />}
            error={!!errors.email}
          />
          {errors.email && <Text style={styles.errText}>{errors.email}</Text>}

          <TextInput
            label="Пароль"
            value={password}
            onChangeText={v => { setPassword(v); setErrors(p => ({ ...p, password: '' })); }}
            secureTextEntry={!showPassword}
            mode="outlined"
            outlineColor={errors.password ? C.missed : C.border}
            activeOutlineColor={C.darkGreen}
            textColor={C.text}
            style={styles.input}
            left={<TextInput.Icon icon="lock-outline" color={C.textSub} />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                color={C.textSub}
                onPress={() => setShowPassword(v => !v)}
              />
            }
            error={!!errors.password}
          />
          {errors.password && <Text style={styles.errText}>{errors.password}</Text>}

          <TouchableOpacity
            style={styles.forgot}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotText}>Забули пароль?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnLoading]}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color={C.cream} />
            ) : (
              <>
                <Icon name="login" size={20} color={C.cream} />
                <Text style={styles.btnText}>Увійти</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>або</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('SignUp')}
          >
            <Text style={styles.secondaryBtnText}>Створити акаунт</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: C.darkGreen,
  },
  header: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    paddingBottom: 30,
    gap: 10,
  },
  logoWrap: {
    width: 80, 
    height: 80, 
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 2, 
    borderColor: 'rgba(146,183,117,0.35)',
  },
  appName: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: C.cream, 
    letterSpacing: -0.3,
  },
  tagline: { 
    fontSize: 14, 
    color: 'rgba(243,232,211,0.65)',
  },
  keyboardView: {
    flex: 1,
  },
  whiteCard: {
    flex: 1, // Займає весь доступний простір
    backgroundColor: C.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    // Тінь тільки зверху
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  cardTitle: { 
    fontSize: 20, 
    fontWeight: '800', 
    color: C.text, 
    marginBottom: 24, 
    textAlign: 'center',
  },
  input: { 
    marginBottom: 6, 
    backgroundColor: C.creamLight,
  },
  errText: { 
    color: C.missed, 
    fontSize: 12, 
    marginTop: 0, 
    marginBottom: 12, 
    fontWeight: '600',
    paddingLeft: 4,
  },
  forgot: { 
    alignSelf: 'flex-end', 
    marginBottom: 28,
    marginTop: 4,
  },
  forgotText: { 
    fontSize: 13, 
    color: C.darkGreen, 
    fontWeight: '600',
  },
  btn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: C.darkGreen, 
    paddingVertical: 16,
    borderRadius: 18, 
    gap: 10,
    shadowColor: C.darkGreen, 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, 
    shadowRadius: 8, 
    elevation: 6,
  },
  btnLoading: { 
    opacity: 0.7,
  },
  btnText: { 
    color: C.cream, 
    fontSize: 16, 
    fontWeight: '800',
  },
  divider: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12, 
    marginVertical: 24,
  },
  dividerLine: { 
    flex: 1, 
    height: 1, 
    backgroundColor: C.borderLight,
  },
  dividerText: { 
    fontSize: 13, 
    color: C.textSub, 
    fontWeight: '500',
  },
  secondaryBtn: {
    paddingVertical: 14, 
    borderRadius: 18,
    borderWidth: 2, 
    borderColor: C.darkGreen + '40',
    alignItems: 'center',
  },
  secondaryBtnText: { 
    color: C.darkGreen, 
    fontSize: 15, 
    fontWeight: '700',
  },
});