// src/screens/Auth/ForgotPasswordScreen.tsx
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

export default function ForgotPasswordScreen({ navigation }: any) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (!email.trim()) { setError('Введіть email'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Некоректний email'); return; }
    setLoading(true);
    setError('');
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (e: any) {
      setError(e?.message || 'Помилка відправки');
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
          <Icon name="lock-reset" size={36} color={C.cream} />
        </View>
        <Text style={styles.title}>Відновлення паролю</Text>
        <Text style={styles.subtitle}>Введіть email, щоб отримати інструкції</Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Біла картка на всю ширину та висоту */}
        <View style={styles.whiteCard}>
          {sent ? (
            <View style={styles.successWrap}>
              <View style={styles.successIcon}>
                <Icon name="email-check" size={40} color={C.taken} />
              </View>
              <Text style={styles.successTitle}>Лист відправлено!</Text>
              <Text style={styles.successText}>
                Перевірте {email} та перейдіть за посиланням для відновлення паролю.
              </Text>
              <TouchableOpacity
                style={styles.btn}
                onPress={() => navigation.navigate('SignIn')}
              >
                <Icon name="login" size={18} color={C.cream} />
                <Text style={styles.btnText}>Повернутися до входу</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.cardTitle}>Введіть ваш email</Text>
              
              <TextInput
                label="Email"
                value={email}
                onChangeText={v => { setEmail(v); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                mode="outlined"
                outlineColor={error ? C.missed : C.border}
                activeOutlineColor={C.darkGreen}
                textColor={C.text}
                style={styles.input}
                left={<TextInput.Icon icon="email-outline" color={C.textSub} />}
                error={!!error}
              />
              {error && <Text style={styles.errText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnLoading]}
                onPress={handleReset}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={C.cream} />
                ) : (
                  <>
                    <Icon name="send-outline" size={18} color={C.cream} />
                    <Text style={styles.btnText}>Відправити</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.backLink} onPress={() => navigation.navigate('SignIn')}>
                <Text style={styles.backLinkText}>← Повернутися до входу</Text>
              </TouchableOpacity>
            </>
          )}
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 28,
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
  title: { 
    fontSize: 22, 
    fontWeight: '800', 
    color: C.cream,
  },
  subtitle: { 
    fontSize: 13, 
    color: 'rgba(243,232,211,0.65)', 
    textAlign: 'center', 
    paddingHorizontal: 32,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  cardTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
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
    marginBottom: 16, 
    fontWeight: '600',
    paddingLeft: 4,
  },
  btn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: C.darkGreen, 
    paddingVertical: 15,
    borderRadius: 18, 
    gap: 10, 
    marginTop: 12,
  },
  btnLoading: { 
    opacity: 0.7,
  },
  btnText: { 
    color: C.cream, 
    fontSize: 16, 
    fontWeight: '800',
  },
  backLink: { 
    marginTop: 20, 
    alignItems: 'center',
  },
  backLinkText: { 
    color: C.darkGreen, 
    fontSize: 14, 
    fontWeight: '600',
  },
  successWrap: { 
    alignItems: 'center', 
    gap: 14,
  },
  successIcon: {
    width: 80, 
    height: 80, 
    borderRadius: 24,
    backgroundColor: C.takenBg,
    alignItems: 'center', 
    justifyContent: 'center',
  },
  successTitle: { 
    fontSize: 20, 
    fontWeight: '800', 
    color: C.text,
  },
  successText: {
    fontSize: 14, 
    color: C.textSub, 
    textAlign: 'center',
    lineHeight: 22, 
    paddingHorizontal: 10,
  },
});