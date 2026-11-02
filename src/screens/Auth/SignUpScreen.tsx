// src/screens/Auth/SignUpScreen.tsx
// @ts-nocheck
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, StatusBar, Alert,
  ScrollView,
} from 'react-native';
import { TextInput, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../theme/colors';

const C = COLORS;

export default function SignUpScreen({ navigation }: any) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Введіть ім'я";
    if (!email.trim()) errs.email = 'Введіть email';
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Некоректний email';
    if (!password) errs.password = 'Введіть пароль';
    else if (password.length < 8) errs.password = 'Пароль мінімум 8 символів';
    if (password !== confirmPassword) errs.confirm = 'Паролі не збігаються';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await signUp(email.trim(), password, fullName.trim());
      Alert.alert(
        'Успішно!',
        'Перевірте пошту для підтвердження акаунту',
        [{ text: 'OK', onPress: () => navigation.navigate('SignIn') }]
      );
    } catch (error: any) {
      Alert.alert('Помилка', error?.message || 'Не вдалося зареєструватись');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header - зелений верх */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={C.cream} />
        </TouchableOpacity>
        <View style={styles.logoWrap}>
          <Icon name="account-plus" size={36} color={C.cream} />
        </View>
        <Text style={styles.appName}>Реєстрація</Text>
        <Text style={styles.tagline}>Створіть акаунт MediTracker</Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Біла картка на всю ширину та висоту */}
        <ScrollView 
          style={styles.whiteCard}
          contentContainerStyle={styles.whiteCardContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {([
            { label: "Ім'я та прізвище", key: 'fullName', value: fullName, onChange: setFullName, icon: 'account-outline', keyboardType: 'default', autoCapitalize: 'words' },
            { label: 'Email', key: 'email', value: email, onChange: setEmail, icon: 'email-outline', keyboardType: 'email-address', autoCapitalize: 'none' },
            { label: 'Пароль', key: 'password', value: password, onChange: setPassword, icon: 'lock-outline', secure: true },
            { label: 'Підтвердіть пароль', key: 'confirm', value: confirmPassword, onChange: setConfirmPassword, icon: 'lock-check-outline', secure: true },
          ] as any[]).map(field => (
            <View key={field.key}>
              <TextInput
                label={field.label}
                value={field.value}
                onChangeText={(v: string) => { field.onChange(v); setErrors(p => ({ ...p, [field.key]: '' })); }}
                keyboardType={field.keyboardType || 'default'}
                autoCapitalize={field.autoCapitalize || 'none'}
                secureTextEntry={field.secure && !showPassword}
                mode="outlined"
                outlineColor={errors[field.key] ? C.missed : C.border}
                activeOutlineColor={C.darkGreen}
                textColor={C.text}
                style={styles.input}
                left={<TextInput.Icon icon={field.icon} color={C.textSub} />}
                right={field.secure ? (
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    color={C.textSub}
                    onPress={() => setShowPassword(v => !v)}
                  />
                ) : undefined}
                error={!!errors[field.key]}
              />
              {errors[field.key] && <Text style={styles.errText}>{errors[field.key]}</Text>}
            </View>
          ))}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnLoading]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color={C.cream} />
            ) : (
              <>
                <Icon name="account-check" size={20} color={C.cream} />
                <Text style={styles.btnText}>Зареєструватись</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.loginLinkText}>
              Вже є акаунт? <Text style={styles.loginLinkBold}>Увійти</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 24,
    gap: 8,
  },
  backBtn: {
    position: 'absolute', 
    left: 20,
    top: Platform.OS === 'ios' ? 60 : 40,
    width: 40, 
    height: 40, 
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', 
    justifyContent: 'center',
  },
  logoWrap: {
    width: 70, 
    height: 70, 
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 2, 
    borderColor: 'rgba(146,183,117,0.35)',
  },
  appName: { 
    fontSize: 24, 
    fontWeight: '800', 
    color: C.cream,
  },
  tagline: { 
    fontSize: 13, 
    color: 'rgba(243,232,211,0.65)',
  },
  keyboardView: {
    flex: 1,
  },
  whiteCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
  },
  whiteCardContent: {
    paddingTop: 32,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
  },
  input: { 
    marginBottom: 4, 
    backgroundColor: C.creamLight,
  },
  errText: { 
    color: C.missed, 
    fontSize: 12, 
    marginBottom: 16, 
    fontWeight: '600',
    paddingLeft: 4,
  },
  btn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: C.darkGreen, 
    paddingVertical: 16,
    borderRadius: 18, 
    gap: 10, 
    marginTop: 20,
  },
  btnLoading: { 
    opacity: 0.7,
  },
  btnText: { 
    color: C.cream, 
    fontSize: 16, 
    fontWeight: '800',
  },
  loginLink: { 
    marginTop: 20, 
    alignItems: 'center',
  },
  loginLinkText: { 
    color: C.textSub, 
    fontSize: 14,
  },
  loginLinkBold: { 
    color: C.darkGreen, 
    fontWeight: '700',
  },
});