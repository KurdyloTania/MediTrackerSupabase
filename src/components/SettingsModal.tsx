// // src/components/SettingsModal.tsx
// import React, { useState } from 'react';
// import {
//   View, Text, StyleSheet, TouchableOpacity, Switch, Alert,
//   Modal, Platform, Linking, ScrollView,
// } from 'react-native';
// import { ActivityIndicator } from 'react-native-paper';
// import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
// import { useAuth } from '../context/AuthContext';
// import { COLORS } from '../theme/colors';

// const C = COLORS;

// interface SettingRowProps {
//   icon: string;
//   iconBg?: string;
//   iconColor?: string;
//   title: string;
//   subtitle?: string;
//   onPress?: () => void;
//   rightElement?: React.ReactNode;
//   danger?: boolean;
// }

// function SettingRow({
//   icon, iconBg, iconColor, title, subtitle, onPress, rightElement, danger,
// }: SettingRowProps) {
//   return (
//     <TouchableOpacity
//       style={styles.row}
//       onPress={onPress}
//       activeOpacity={onPress ? 0.7 : 1}
//       disabled={!onPress && !rightElement}
//     >
//       <View style={[styles.rowIcon, { backgroundColor: iconBg || C.softGreen + '20' }]}>
//         <Icon name={icon} size={20} color={iconColor || C.softGreen} />
//       </View>
//       <View style={styles.rowText}>
//         <Text style={[styles.rowTitle, danger && { color: C.missed }]}>{title}</Text>
//         {subtitle && <Text style={styles.rowSub}>{subtitle}</Text>}
//       </View>
//       {rightElement ?? (onPress && <Icon name="chevron-right" size={20} color={C.textTertiary} />)}
//     </TouchableOpacity>
//   );
// }

// interface SettingsModalProps {
//   visible: boolean;
//   onClose: () => void;
// }

// export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
//   const { user, signOut } = useAuth();
//   const [signingOut, setSigningOut] = useState(false);
//   const [notifEnabled, setNotifEnabled] = useState(true);

//   const handleSignOut = () => {
//     Alert.alert(
//       'Вийти з акаунту',
//       'Ви впевнені, що хочете вийти?',
//       [
//         { text: 'Скасувати', style: 'cancel' },
//         {
//           text: 'Вийти',
//           style: 'destructive',
//           onPress: async () => {
//             setSigningOut(true);
//             try { await signOut(); onClose(); } catch (e) { console.error(e); }
//             finally { setSigningOut(false); }
//           },
//         },
//       ]
//     );
//   };

//   const userName = user?.user_metadata?.full_name || 'Користувач';
//   const userEmail = user?.email || '';

//   return (
//     <Modal
//       visible={visible}
//       animationType="slide"
//       transparent={false}
//       presentationStyle="fullScreen"
//     >
//       <View style={styles.container}>
//         <View style={styles.header}>
//           <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
//             <Icon name="close" size={24} color={C.cream} />
//           </TouchableOpacity>
//           <Text style={styles.headerTitle}>Налаштування</Text>
//           <View style={{ width: 40 }} />
//         </View>

//         <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
//           <View style={styles.profileCard}>
//             <View style={styles.profileAvatar}>
//               <Icon name="account" size={32} color={C.cream} />
//             </View>
//             <View style={styles.profileInfo}>
//               <Text style={styles.profileName}>{userName}</Text>
//               <Text style={styles.profileEmail}>{userEmail}</Text>
//             </View>
//           </View>

//           <View style={styles.sectionCard}>
//             <Text style={styles.sectionTitle}>НАГАДУВАННЯ</Text>
//             <SettingRow
//               icon="bell-outline"
//               iconBg={C.warnBg}
//               iconColor={C.warn}
//               title="Push-нагадування"
//               subtitle="Сповіщення про прийом ліків"
//               rightElement={
//                 <Switch
//                   value={notifEnabled}
//                   onValueChange={setNotifEnabled}
//                   trackColor={{ false: C.borderLight, true: C.softGreen }}
//                   thumbColor={notifEnabled ? C.darkGreen : C.textTertiary}
//                 />
//               }
//             />
//             <View style={styles.separator} />
//             <SettingRow
//               icon="timer-outline"
//               iconBg={C.softGreen + '20'}
//               iconColor={C.darkGreen}
//               title="Авто-пропуск через 30 хв"
//               subtitle="Якщо прийом не підтверджено — автоматично позначається як пропущено"
//               rightElement={
//                 <View style={styles.infoBadge}>
//                   <Text style={styles.infoBadgeText}>Увімк.</Text>
//                 </View>
//               }
//             />
//           </View>

//           <View style={styles.sectionCard}>
//             <Text style={styles.sectionTitle}>ЗАЛИШКИ ЛІКІВ</Text>
//             <SettingRow
//               icon="archive-arrow-down-outline"
//               iconBg={C.takenBg}
//               iconColor={C.taken}
//               title="Поріг попередження"
//               subtitle="Сповіщення коли залишилось ≤ 3 доз"
//               rightElement={
//                 <View style={styles.infoBadge}>
//                   <Text style={styles.infoBadgeText}>3 дози</Text>
//                 </View>
//               }
//             />
//           </View>

//           <View style={styles.sectionCard}>
//             <Text style={styles.sectionTitle}>ПРО ДОДАТОК</Text>
//             <SettingRow
//               icon="shield-lock-outline"
//               iconBg={C.creamDark}
//               iconColor={C.textSub}
//               title="Політика конфіденційності"
//               onPress={() => Linking.openURL('https://your-app.com/privacy')}
//             />
//             <View style={styles.separator} />
//             <SettingRow
//               icon="file-document-outline"
//               iconBg={C.creamDark}
//               iconColor={C.textSub}
//               title="Умови використання"
//               onPress={() => Linking.openURL('https://your-app.com/terms')}
//             />
//             <View style={styles.separator} />
//             <SettingRow
//               icon="email-outline"
//               iconBg={C.creamDark}
//               iconColor={C.textSub}
//               title="Написати розробнику"
//               onPress={() => Linking.openURL('mailto:support@your-app.com')}
//             />
//           </View>

//           <View style={styles.sectionCard}>
//             <Text style={styles.sectionTitle}>АКАУНТ</Text>
//             <SettingRow
//               icon="logout"
//               iconBg={C.warnBg}
//               iconColor={C.warn}
//               title="Вийти з акаунту"
//               onPress={handleSignOut}
//               rightElement={
//                 signingOut
//                   ? <ActivityIndicator size="small" color={C.warn} />
//                   : <Icon name="chevron-right" size={20} color={C.textTertiary} />
//               }
//             />
//           </View>

//           <Text style={styles.versionText}>MediTracker · v1.2.0 · Зроблено з ❤️</Text>
//         </ScrollView>
//       </View>
//     </Modal>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: C.creamLight },
//   header: {
//     backgroundColor: C.darkGreen,
//     paddingTop: Platform.OS === 'ios' ? 60 : 46,
//     paddingHorizontal: 16,
//     paddingBottom: 16,
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//   },
//   headerTitle: { fontSize: 18, fontWeight: '700', color: C.cream },
//   closeBtn: { padding: 8, width: 40, alignItems: 'center' },
//   scrollContent: { paddingBottom: 50 },
//   profileCard: {
//     backgroundColor: C.darkGreen,
//     margin: 16, borderRadius: 24,
//     padding: 20,
//     flexDirection: 'row', alignItems: 'center', gap: 14,
//     shadowColor: C.darkGreen, shadowOffset: { width: 0, height: 6 },
//     shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
//   },
//   profileAvatar: {
//     width: 60, height: 60, borderRadius: 18,
//     backgroundColor: 'rgba(255,255,255,0.12)',
//     alignItems: 'center', justifyContent: 'center',
//     borderWidth: 2, borderColor: 'rgba(146,183,117,0.4)',
//   },
//   profileInfo: { flex: 1 },
//   profileName: { fontSize: 18, fontWeight: '800', color: C.cream },
//   profileEmail: { fontSize: 13, color: 'rgba(243,232,211,0.65)', marginTop: 3 },
//   sectionCard: {
//     backgroundColor: C.surface,
//     marginHorizontal: 16, marginBottom: 12,
//     borderRadius: 20, overflow: 'hidden',
//     shadowColor: C.darkGreen, shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
//   },
//   sectionTitle: {
//     fontSize: 11, fontWeight: '800', color: C.textSub,
//     letterSpacing: 0.8, textTransform: 'uppercase',
//     paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
//   },
//   row: {
//     flexDirection: 'row', alignItems: 'center',
//     paddingHorizontal: 16, paddingVertical: 14, gap: 12,
//   },
//   rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
//   rowText: { flex: 1 },
//   rowTitle: { fontSize: 15, fontWeight: '600', color: C.text },
//   rowSub: { fontSize: 12, color: C.textSub, marginTop: 2, lineHeight: 17 },
//   separator: { height: 1, backgroundColor: C.borderLight, marginHorizontal: 16 },
//   infoBadge: { backgroundColor: C.softGreen + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
//   infoBadgeText: { fontSize: 12, fontWeight: '700', color: C.darkGreen },
//   versionText: { textAlign: 'center', color: C.textTertiary, fontSize: 12, marginTop: 8, marginBottom: 16 },
// });






















// src/components/SettingsModal.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, Alert,
  Modal, Platform, Linking, ScrollView,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme/colors';

const C = COLORS;

const PRIVACY_URL = 'https://htmlpreview.github.io/?https://gist.githubusercontent.com/KurdyloTania/90d1c33fa9d19ff544fa67c6647b06fd/raw/a5931baff87159999e125ac6dc8f73c464bbc85a/privacy.html';
const TERMS_URL = 'https://htmlpreview.github.io/?https://gist.githubusercontent.com/KurdyloTania/92a6203b33b708810d8af91cb5d3f9c5/raw/d9118c2028bb0d2a1f6bd5f81b24df241ce97690/terms.html';interface SettingRowProps {
  icon: string;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
}

function SettingRow({
  icon, iconBg, iconColor, title, subtitle, onPress, rightElement, danger,
}: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !rightElement}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg || C.softGreen + '20' }]}>
        <Icon name={icon} size={20} color={iconColor || C.softGreen} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && { color: C.missed }]}>{title}</Text>
        {subtitle && <Text style={styles.rowSub}>{subtitle}</Text>}
      </View>
      {rightElement ?? (onPress && <Icon name="chevron-right" size={20} color={C.textTertiary} />)}
    </TouchableOpacity>
  );
}

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);

  const handleSignOut = () => {
    Alert.alert(
      'Вийти з акаунту',
      'Ви впевнені, що хочете вийти?',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Вийти',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try { await signOut(); onClose(); } catch (e) { console.error(e); }
            finally { setSigningOut(false); }
          },
        },
      ]
    );
  };

  const userName = user?.user_metadata?.full_name || 'Користувач';
  const userEmail = user?.email || '';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle="fullScreen"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="close" size={24} color={C.cream} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Налаштування</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Icon name="account" size={32} color={C.cream} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{userName}</Text>
              <Text style={styles.profileEmail}>{userEmail}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>НАГАДУВАННЯ</Text>
            <SettingRow
              icon="bell-outline"
              iconBg={C.warnBg}
              iconColor={C.warn}
              title="Push-нагадування"
              subtitle="Сповіщення про прийом ліків"
              rightElement={
                <Switch
                  value={notifEnabled}
                  onValueChange={setNotifEnabled}
                  trackColor={{ false: C.borderLight, true: C.softGreen }}
                  thumbColor={notifEnabled ? C.darkGreen : C.textTertiary}
                />
              }
            />
            <View style={styles.separator} />
            <SettingRow
              icon="timer-outline"
              iconBg={C.softGreen + '20'}
              iconColor={C.darkGreen}
              title="Авто-пропуск через 30 хв"
              subtitle="Якщо прийом не підтверджено — автоматично позначається як пропущено"
              rightElement={
                <View style={styles.infoBadge}>
                  <Text style={styles.infoBadgeText}>Увімк.</Text>
                </View>
              }
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>ЗАЛИШКИ ЛІКІВ</Text>
            <SettingRow
              icon="archive-arrow-down-outline"
              iconBg={C.takenBg}
              iconColor={C.taken}
              title="Поріг попередження"
              subtitle="Сповіщення коли залишилось ≤ 3 доз"
              rightElement={
                <View style={styles.infoBadge}>
                  <Text style={styles.infoBadgeText}>3 дози</Text>
                </View>
              }
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>ПРО ДОДАТОК</Text>
            <SettingRow
              icon="shield-lock-outline"
              iconBg={C.creamDark}
              iconColor={C.textSub}
              title="Політика конфіденційності"
              onPress={() => Linking.openURL(PRIVACY_URL)}
            />
            <View style={styles.separator} />
            <SettingRow
              icon="file-document-outline"
              iconBg={C.creamDark}
              iconColor={C.textSub}
              title="Умови використання"
              onPress={() => Linking.openURL(TERMS_URL)}
            />
            <View style={styles.separator} />
            <SettingRow
              icon="email-outline"
              iconBg={C.creamDark}
              iconColor={C.textSub}
              title="Написати розробнику"
              onPress={() => Linking.openURL('mailto:support@your-app.com')}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>АКАУНТ</Text>
            <SettingRow
              icon="logout"
              iconBg={C.warnBg}
              iconColor={C.warn}
              title="Вийти з акаунту"
              onPress={handleSignOut}
              rightElement={
                signingOut
                  ? <ActivityIndicator size="small" color={C.warn} />
                  : <Icon name="chevron-right" size={20} color={C.textTertiary} />
              }
            />
          </View>

          <Text style={styles.versionText}>MediTracker · v1.2.0 · Зроблено з ❤️</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.creamLight },
  header: {
    backgroundColor: C.darkGreen,
    paddingTop: Platform.OS === 'ios' ? 60 : 46,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.cream },
  closeBtn: { padding: 8, width: 40, alignItems: 'center' },
  scrollContent: { paddingBottom: 50 },
  profileCard: {
    backgroundColor: C.darkGreen,
    margin: 16, borderRadius: 24,
    padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: C.darkGreen, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  profileAvatar: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(146,183,117,0.4)',
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '800', color: C.cream },
  profileEmail: { fontSize: 13, color: 'rgba(243,232,211,0.65)', marginTop: 3 },
  sectionCard: {
    backgroundColor: C.surface,
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 20, overflow: 'hidden',
    shadowColor: C.darkGreen, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: C.textSub,
    letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  rowSub: { fontSize: 12, color: C.textSub, marginTop: 2, lineHeight: 17 },
  separator: { height: 1, backgroundColor: C.borderLight, marginHorizontal: 16 },
  infoBadge: { backgroundColor: C.softGreen + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  infoBadgeText: { fontSize: 12, fontWeight: '700', color: C.darkGreen },
  versionText: { textAlign: 'center', color: C.textTertiary, fontSize: 12, marginTop: 8, marginBottom: 16 },
});