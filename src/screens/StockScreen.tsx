// // src/screens/StockScreen.tsx
// import React, { useState, useRef, useCallback } from 'react';
// import {
//   View, Text, ScrollView, TouchableOpacity, StyleSheet,
//   StatusBar, Platform, Linking, RefreshControl,
//   Animated, TextInput, Alert,
// } from 'react-native';
// import { ActivityIndicator, Portal, Dialog, Button } from 'react-native-paper';
// import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
// import * as Location from 'expo-location';
// import { useMedications } from '../context/MedicationsContext';
// import { Medication } from '../types';
// import { supabase } from '../lib/supabase';
// import { COLORS } from '../theme/colors';

// const C = COLORS;

// // Умовний імпорт MapView
// let MapView: any = null;
// let Marker: any = null;
// let PROVIDER_GOOGLE: any = null;

// try {
//   const maps = require('react-native-maps');
//   MapView = maps.default;
//   Marker = maps.Marker;
//   PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
// } catch (e) {
//   console.log('MapView not available');
// }

// // ========== ФУНКЦІЇ ДЛЯ РОБОТИ З ЗАЛИШКАМИ ==========

// function isStockLow(med: Medication): boolean {
//   if (med.stock_quantity == null) return false;
//   if (med.stock_quantity <= 0) return true;
//   return med.stock_quantity <= 3;
// }

// function getStockColor(med: Medication): string {
//   if (med.stock_quantity == null) return C.textSub;
//   if (med.stock_quantity <= 0) return C.missed;
//   if (med.stock_quantity <= 3) return C.warn;
//   return C.taken;
// }

// function getStockStatus(med: Medication): string {
//   if (med.stock_quantity == null) return 'Не відстежується';
//   if (med.stock_quantity <= 0) return 'Вичерпано!';
//   if (med.stock_quantity <= 3) return `Терміново! ${med.stock_quantity} ${med.stock_unit}`;
//   if (med.stock_quantity <= 10) return `Скоро: ${med.stock_quantity} ${med.stock_unit}`;
//   return `${med.stock_quantity} ${med.stock_unit}`;
// }

// const MED_COLORS = [C.softGreen, C.midGreen, C.darkGreen2, '#4CAF50', '#66BB6A', '#81C784'];

// function getMedColor(id: string): string {
//   let h = 0;
//   for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
//   return MED_COLORS[Math.abs(h) % MED_COLORS.length];
// }

// // ========== КОМПОНЕНТ КАРТКИ ==========

// function StockCard({ med, onPress, onRefill }: { med: Medication; onPress: () => void; onRefill: () => void }) {
//   const color = getMedColor(med.id);
//   const scaleAnim = useRef(new Animated.Value(1)).current;
//   const stockColor = getStockColor(med);
//   const stockStatus = getStockStatus(med);
//   const isLow = isStockLow(med);

//   return (
//     <TouchableOpacity
//       onPress={onPress}
//       activeOpacity={0.88}
//       onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start()}
//       onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
//     >
//       <Animated.View style={[styles.stockCard, { transform: [{ scale: scaleAnim }] }]}>
//         <View style={[styles.stockBar, { backgroundColor: stockColor }]} />
//         <View style={styles.stockBody}>
//           <View style={[styles.stockAvatar, { backgroundColor: color + '22' }]}>
//             <Icon name="pill" size={24} color={color} />
//           </View>
//           <View style={styles.stockInfo}>
//             <View style={styles.stockNameRow}>
//               <Text style={styles.stockName} numberOfLines={1}>{med.name}</Text>
//               {isLow && (
//                 <View style={styles.lowBadge}>
//                   <Icon name="alert" size={10} color={C.white} />
//                   <Text style={styles.lowBadgeText}>Мало</Text>
//                 </View>
//               )}
//             </View>
//             {med.dosage ? <Text style={styles.stockDosage}>{med.dosage}</Text> : null}
//             <View style={styles.stockMeta}>
//               <Icon name="package-variant" size={14} color={stockColor} />
//               <Text style={[styles.stockQty, { color: stockColor }]}>{stockStatus}</Text>
//             </View>
//           </View>
//           <TouchableOpacity style={styles.refillBtn} onPress={e => { e.stopPropagation(); onRefill(); }}>
//             <Icon name="plus-circle" size={28} color={C.darkGreen} />
//           </TouchableOpacity>
//         </View>
//       </Animated.View>
//     </TouchableOpacity>
//   );
// }

// // ========== КОМПОНЕНТ КАРТИ ==========

// function PharmacyMap({ userLocation, pharmacies, onOpenInMaps }: any) {
//   if (!MapView || !Marker) {
//     return (
//       <View style={styles.mapPlaceholder}>
//         <Icon name="map" size={40} color={C.textSub} />
//         <Text style={styles.mapPlaceholderText}>Карта доступна тільки в development build</Text>
//       </View>
//     );
//   }

//   return (
//     <MapView
//       style={styles.map}
//       provider={PROVIDER_GOOGLE}
//       initialRegion={{
//         latitude: userLocation.latitude,
//         longitude: userLocation.longitude,
//         latitudeDelta: 0.05,
//         longitudeDelta: 0.05,
//       }}
//     >
//       <Marker coordinate={userLocation} title="Ви тут" pinColor={C.softGreen} />
//       {pharmacies.map((ph: any) => (
//         <Marker
//           key={ph.id}
//           coordinate={{ latitude: ph.latitude, longitude: ph.longitude }}
//           title={ph.name}
//           description={ph.vicinity}
//           pinColor="#52B788"
//           onCalloutPress={() => onOpenInMaps(ph)}
//         />
//       ))}
//     </MapView>
//   );
// }

// // ========== ГОЛОВНИЙ КОМПОНЕНТ ==========

// export default function StockScreen({ navigation }: any) {
//   const { medications, refetch } = useMedications();
//   const [refreshing, setRefreshing] = useState(false);
//   const [pharmacyDialog, setPharmacyDialog] = useState(false);
//   const [pharmacies, setPharmacies] = useState<any[]>([]);
//   const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
//   const [pharmacyLoading, setPharmacyLoading] = useState(false);
//   const [pharmacyError, setPharmacyError] = useState<string | null>(null);
//   const [refillDialog, setRefillDialog] = useState<{ visible: boolean; med?: Medication }>({ visible: false });
//   const [refillQty, setRefillQty] = useState('');
//   const [refillLoading, setRefillLoading] = useState(false);

//   const onRefresh = useCallback(async () => {
//     setRefreshing(true);
//     await refetch();
//     setRefreshing(false);
//   }, [refetch]);

//   // Показуємо тільки активні медикаменти (чий цикл ще не завершився)
//   const now = new Date();
//   const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
//   const allMeds = Array.isArray(medications) ? medications : [];
//   const safeMeds = allMeds.filter((med: Medication) => {
//     if (!med.end_date) return true;
//     const end = new Date(med.end_date);
//     end.setHours(23, 59, 59, 999);
//     return end >= todayStart;
//   });

//   const lowStockMeds = safeMeds.filter((med: Medication) => med.stock_quantity != null && med.stock_quantity <= 3);
//   const mediumStockMeds = safeMeds.filter((med: Medication) => med.stock_quantity != null && med.stock_quantity > 3 && med.stock_quantity <= 10);
//   const goodStockMeds = safeMeds.filter((med: Medication) => med.stock_quantity != null && med.stock_quantity > 10);
//   const untrackedMeds = safeMeds.filter((med: Medication) => med.stock_quantity == null);

//   const openRefill = (med: Medication) => {
//     setRefillQty(String(med.stock_quantity ?? 0));
//     setRefillDialog({ visible: true, med });
//   };

//   const handleRefill = async () => {
//     const qty = parseFloat(refillQty);
//     if (isNaN(qty) || qty < 0) {
//       Alert.alert('Помилка', 'Введіть коректну кількість (≥ 0)');
//       return;
//     }
//     setRefillLoading(true);
//     try {
//       const { error } = await supabase
//         .from('medications')
//         .update({ stock_quantity: qty })
//         .eq('id', refillDialog.med!.id);
      
//       if (error) throw error;
      
//       await refetch();
//       setRefillDialog({ visible: false });
//       setRefillQty('');
//       Alert.alert('Успішно', 'Залишок оновлено');
//     } catch (e: any) {
//       Alert.alert('Помилка', e?.message || 'Не вдалося оновити залишок');
//     } finally {
//       setRefillLoading(false);
//     }
//   };

//   const findPharmacies = async () => {
//     setPharmacyDialog(true);
//     setPharmacyLoading(true);
//     setPharmacyError(null);
//     setPharmacies([]);

//     try {
//       const { status } = await Location.requestForegroundPermissionsAsync();
//       if (status !== 'granted') {
//         setPharmacyError('Доступ до геолокації відхилено');
//         setPharmacyLoading(false);
//         return;
//       }
//       const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
//       const { latitude, longitude } = loc.coords;
//       setUserLocation({ latitude, longitude });

//       const url = `https://nominatim.openstreetmap.org/search?q=pharmacy&format=json&lat=${latitude}&lon=${longitude}&zoom=15&limit=10`;
//       const resp = await fetch(url);
//       const data = await resp.json();

//       if (data && data.length > 0) {
//         const results = data.map((p: any, idx: number) => ({
//           id: `ph_${idx}`,
//           name: p.display_name.split(',')[0] || 'Аптека',
//           latitude: parseFloat(p.lat),
//           longitude: parseFloat(p.lon),
//           vicinity: p.display_name.substring(0, 80),
//         }));
//         setPharmacies(results);
//       } else {
//         setPharmacyError('Аптеки поруч не знайдено');
//       }
//     } catch (e) {
//       console.error(e);
//       setPharmacyError('Помилка пошуку аптек');
//     } finally {
//       setPharmacyLoading(false);
//     }
//   };

//   const openInMaps = (ph: any) => {
//     const url = Platform.select({
//       ios: `maps:0,0?q=${ph.latitude},${ph.longitude}`,
//       android: `geo:${ph.latitude},${ph.longitude}?q=${ph.latitude},${ph.longitude}`,
//       default: `https://www.google.com/maps/search/?api=1&query=${ph.latitude},${ph.longitude}`,
//     });
//     Linking.openURL(url!);
//   };

//   const hasAnyStockTracking = lowStockMeds.length > 0 || mediumStockMeds.length > 0 || goodStockMeds.length > 0;

//   return (
//     <View style={styles.container}>
//       <StatusBar barStyle="light-content" />

//       <View style={styles.header}>
//         <Text style={styles.headerTitle}>Залишки ліків</Text>
//         <Text style={styles.headerSub}>Контроль запасів та аптеки поруч</Text>
//       </View>

//       <ScrollView
//         showsVerticalScrollIndicator={false}
//         contentContainerStyle={styles.scrollContent}
//         refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.softGreen} />}
//       >
//         <TouchableOpacity style={styles.pharmacyBtn} onPress={findPharmacies} activeOpacity={0.87}>
//           <View style={styles.pharmacyBtnLeft}>
//             <Icon name="map-marker-radius" size={24} color={C.cream} />
//             <View>
//               <Text style={styles.pharmacyBtnTitle}>Найближчі аптеки</Text>
//               <Text style={styles.pharmacyBtnSub}>Знайти де купити ліки</Text>
//             </View>
//           </View>
//           <Icon name="chevron-right" size={24} color={C.softGreen} />
//         </TouchableOpacity>

//         {lowStockMeds.length > 0 && (
//           <View style={styles.section}>
//             <View style={styles.sectionHeader}>
//               <View style={[styles.sectionIconWrap, { backgroundColor: C.missedBg }]}>
//                 <Icon name="alert-circle" size={18} color={C.missed} />
//               </View>
//               <Text style={styles.sectionTitle}>Терміново поповнити!</Text>
//               <View style={[styles.badge, { backgroundColor: C.missed }]}>
//                 <Text style={styles.badgeText}>{lowStockMeds.length}</Text>
//               </View>
//             </View>
//             {lowStockMeds.map((med: Medication) => (
//               <StockCard
//                 key={med.id}
//                 med={med}
//                 onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
//                 onRefill={() => openRefill(med)}
//               />
//             ))}
//           </View>
//         )}

//         {mediumStockMeds.length > 0 && (
//           <View style={styles.section}>
//             <View style={styles.sectionHeader}>
//               <View style={[styles.sectionIconWrap, { backgroundColor: C.warnBg }]}>
//                 <Icon name="alert" size={18} color={C.warn} />
//               </View>
//               <Text style={styles.sectionTitle}>Скоро закінчиться</Text>
//               <View style={[styles.badge, { backgroundColor: C.warn }]}>
//                 <Text style={styles.badgeText}>{mediumStockMeds.length}</Text>
//               </View>
//             </View>
//             {mediumStockMeds.map((med: Medication) => (
//               <StockCard
//                 key={med.id}
//                 med={med}
//                 onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
//                 onRefill={() => openRefill(med)}
//               />
//             ))}
//           </View>
//         )}

//         {goodStockMeds.length > 0 && (
//           <View style={styles.section}>
//             <View style={styles.sectionHeader}>
//               <View style={[styles.sectionIconWrap, { backgroundColor: C.takenBg }]}>
//                 <Icon name="check-circle" size={18} color={C.taken} />
//               </View>
//               <Text style={styles.sectionTitle}>Достатньо запасів</Text>
//               <View style={[styles.badge, { backgroundColor: C.taken }]}>
//                 <Text style={styles.badgeText}>{goodStockMeds.length}</Text>
//               </View>
//             </View>
//             {goodStockMeds.map((med: Medication) => (
//               <StockCard
//                 key={med.id}
//                 med={med}
//                 onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
//                 onRefill={() => openRefill(med)}
//               />
//             ))}
//           </View>
//         )}

//         {untrackedMeds.length > 0 && (
//           <View style={styles.section}>
//             <View style={styles.sectionHeader}>
//               <View style={[styles.sectionIconWrap, { backgroundColor: C.borderLight }]}>
//                 <Icon name="package-variant-closed" size={18} color={C.textSub} />
//               </View>
//               <Text style={styles.sectionTitle}>Без відстеження</Text>
//               <View style={[styles.badge, { backgroundColor: C.textSub }]}>
//                 <Text style={styles.badgeText}>{untrackedMeds.length}</Text>
//               </View>
//             </View>
//             {untrackedMeds.map((med: Medication) => (
//               <TouchableOpacity
//                 key={med.id}
//                 style={styles.untrackedCard}
//                 onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
//               >
//                 <Icon name="pill" size={20} color={C.textSub} />
//                 <Text style={styles.untrackedName}>{med.name}</Text>
//                 <Icon name="chevron-right" size={18} color={C.textTertiary} />
//               </TouchableOpacity>
//             ))}
//           </View>
//         )}

//         {/* Немає даних про залишки - БЕЗ кнопки */}
//         {!hasAnyStockTracking && untrackedMeds.length === 0 && safeMeds.length > 0 && (
//           <View style={styles.emptyState}>
//             <View style={styles.emptyIconWrap}>
//               <Icon name="archive-arrow-down-outline" size={44} color={C.softGreen} />
//             </View>
//             <Text style={styles.emptyStateTitle}>Немає даних про залишки</Text>
//             <Text style={styles.emptyStateText}>
//               Увімкніть відстеження залишків при додаванні або редагуванні ліків.
//             </Text>
//           </View>
//         )}

//         {/* Немає ліків - З кнопкою */}
//         {safeMeds.length === 0 && (
//           <View style={styles.emptyState}>
//             <View style={styles.emptyIconWrap}>
//               <Icon name="pill-off" size={44} color={C.softGreen} />
//             </View>
//             <Text style={styles.emptyStateTitle}>Немає ліків</Text>
//             <Text style={styles.emptyStateText}>
//               Додайте перший препарат, щоб почати відстеження.
//             </Text>
//             <TouchableOpacity style={styles.emptyAddBtn} onPress={() => navigation.navigate('AddEditMedication')}>
//               <Icon name="plus" size={18} color={C.white} />
//               <Text style={styles.emptyAddBtnText}>Додати ліки</Text>
//             </TouchableOpacity>
//           </View>
//         )}
//       </ScrollView>

//       <Portal>
//         <Dialog visible={pharmacyDialog} onDismiss={() => setPharmacyDialog(false)} style={styles.pharmacyDialog}>
//           <Dialog.Title style={styles.dialogTitle}>Найближчі аптеки</Dialog.Title>
//           <Dialog.ScrollArea style={styles.dialogScrollArea}>
//             {pharmacyLoading ? (
//               <View style={styles.pharmacyLoader}>
//                 <ActivityIndicator size="large" color={C.softGreen} />
//                 <Text style={styles.loaderText}>Пошук аптек...</Text>
//               </View>
//             ) : pharmacyError ? (
//               <View style={styles.pharmacyError}>
//                 <Icon name="map-marker-off" size={48} color={C.borderLight} />
//                 <Text style={styles.pharmacyErrorText}>{pharmacyError}</Text>
//                 <TouchableOpacity style={styles.retryBtn} onPress={findPharmacies}>
//                   <Text style={styles.retryBtnText}>Спробувати ще</Text>
//                 </TouchableOpacity>
//               </View>
//             ) : (
//               <ScrollView>
//                 {userLocation && pharmacies.length > 0 && (
//                   <PharmacyMap userLocation={userLocation} pharmacies={pharmacies} onOpenInMaps={openInMaps} />
//                 )}
//                 {pharmacies.map((ph: any) => (
//                   <TouchableOpacity key={ph.id} style={styles.pharmacyItem} onPress={() => openInMaps(ph)}>
//                     <View style={styles.pharmacyIcon}>
//                       <Icon name="store" size={22} color={C.darkGreen} />
//                     </View>
//                     <View style={{ flex: 1 }}>
//                       <Text style={styles.pharmacyName}>{ph.name}</Text>
//                       <Text style={styles.pharmacyAddr}>{ph.vicinity}</Text>
//                     </View>
//                     <Icon name="directions" size={24} color={C.softGreen} />
//                   </TouchableOpacity>
//                 ))}
//               </ScrollView>
//             )}
//           </Dialog.ScrollArea>
//           <Dialog.Actions>
//             <Button onPress={() => setPharmacyDialog(false)} textColor={C.darkGreen}>Закрити</Button>
//           </Dialog.Actions>
//         </Dialog>
//       </Portal>

//       <Portal>
//         <Dialog visible={refillDialog.visible} onDismiss={() => setRefillDialog({ visible: false })} style={styles.refillDialogStyle}>
//           <Dialog.Title style={styles.dialogTitle}>Поповнити залишок</Dialog.Title>
//           <Dialog.Content>
//             <Text style={styles.refillMedName}>{refillDialog.med?.name}</Text>
//             <Text style={styles.refillLabel}>
//               Нова кількість ({refillDialog.med?.stock_unit || 'одиниць'})
//             </Text>
//             <TextInput
//               style={styles.refillInput}
//               value={refillQty}
//               onChangeText={setRefillQty}
//               keyboardType="numeric"
//               placeholder="Введіть кількість"
//               placeholderTextColor={C.textTertiary}
//               autoFocus
//             />
//             <Text style={styles.refillHint}>
//               Поточний залишок: {refillDialog.med?.stock_quantity ?? 0} {refillDialog.med?.stock_unit ?? ''}
//             </Text>
//           </Dialog.Content>
//           <Dialog.Actions>
//             <Button onPress={() => setRefillDialog({ visible: false })} textColor={C.textSub}>Скасувати</Button>
//             <Button onPress={handleRefill} textColor={C.darkGreen} loading={refillLoading} disabled={refillLoading}>Зберегти</Button>
//           </Dialog.Actions>
//         </Dialog>
//       </Portal>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: C.creamLight },
//   scrollContent: { paddingBottom: 40 },
//   header: {
//     backgroundColor: C.darkGreen,
//     paddingTop: Platform.OS === 'ios' ? 60 : 46,
//     paddingHorizontal: 20,
//     paddingBottom: 22,
//     borderBottomLeftRadius: 28,
//     borderBottomRightRadius: 28,
//   },
//   headerTitle: { fontSize: 26, fontWeight: '800', color: C.cream },
//   headerSub: { fontSize: 13, color: 'rgba(243,232,211,0.65)', marginTop: 3 },
//   pharmacyBtn: {
//     marginHorizontal: 16,
//     marginTop: 16,
//     marginBottom: 8,
//     backgroundColor: C.darkGreen,
//     borderRadius: 20,
//     paddingVertical: 16,
//     paddingHorizontal: 20,
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     shadowColor: C.darkGreen,
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.25,
//     shadowRadius: 10,
//     elevation: 6,
//   },
//   pharmacyBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
//   pharmacyBtnTitle: { fontSize: 16, fontWeight: '700', color: C.cream },
//   pharmacyBtnSub: { fontSize: 12, color: 'rgba(243,232,211,0.65)', marginTop: 2 },
//   section: { marginTop: 16, paddingHorizontal: 16 },
//   sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
//   sectionIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
//   sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
//   badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
//   badgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
//   stockCard: {
//     backgroundColor: C.surface,
//     borderRadius: 20,
//     flexDirection: 'row',
//     overflow: 'hidden',
//     marginBottom: 10,
//     shadowColor: C.darkGreen,
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.07,
//     shadowRadius: 8,
//     elevation: 3,
//   },
//   stockBar: { width: 5 },
//   stockBody: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
//   stockAvatar: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
//   stockInfo: { flex: 1 },
//   stockNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
//   stockName: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
//   stockDosage: { fontSize: 12, color: C.textSub, marginTop: 2 },
//   stockMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
//   stockQty: { fontSize: 13, fontWeight: '600' },
//   lowBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.missed, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 2 },
//   lowBadgeText: { fontSize: 9, fontWeight: '700', color: C.white },
//   refillBtn: { padding: 6 },
//   untrackedCard: {
//     backgroundColor: C.surface,
//     borderRadius: 16,
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 12,
//     padding: 14,
//     marginBottom: 8,
//     borderWidth: 1,
//     borderColor: C.borderLight,
//   },
//   untrackedName: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  
//   // Єдиний стиль порожнього стану (з контуром, як на головному)
//   emptyState: {
//     alignItems: 'center',
//     paddingVertical: 52,
//     paddingHorizontal: 20,
//     gap: 12,
//   },
//   emptyIconWrap: {
//     width: 96,
//     height: 96,
//     borderRadius: 32,
//     backgroundColor: C.softGreen + '18',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginBottom: 6,
//     borderWidth: 1.5,
//     borderColor: C.softGreen + '30',
//   },
//   emptyStateTitle: {
//     fontSize: 22,
//     fontWeight: '800',
//     color: C.text,
//     letterSpacing: -0.3,
//   },
//   emptyStateText: {
//     fontSize: 14,
//     color: C.textSub,
//     textAlign: 'center',
//     paddingHorizontal: 20,
//     lineHeight: 21,
//   },
//   emptyAddBtn: {
//     flexDirection: 'row', alignItems: 'center', gap: 8,
//     backgroundColor: C.darkGreen,
//     paddingVertical: 14, paddingHorizontal: 32,
//     borderRadius: 18, marginTop: 6,
//     shadowColor: C.darkGreen,
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
//   },
//   emptyAddBtnText: { color: C.cream, fontWeight: '700', fontSize: 15 },
  
//   pharmacyDialog: { backgroundColor: C.surface, borderRadius: 28, maxHeight: '85%', marginHorizontal: 12 },
//   dialogTitle: { fontSize: 18, fontWeight: '700', color: C.text },
//   dialogScrollArea: { maxHeight: 520 },
//   pharmacyLoader: { alignItems: 'center', paddingVertical: 40, gap: 14 },
//   loaderText: { color: C.textSub, fontSize: 14 },
//   pharmacyError: { alignItems: 'center', paddingVertical: 36, gap: 12 },
//   pharmacyErrorText: { color: C.textSub, fontSize: 14, textAlign: 'center' },
//   retryBtn: { backgroundColor: C.darkGreen, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
//   retryBtnText: { color: C.cream, fontWeight: '700' },
//   map: { width: '100%', height: 220, borderRadius: 16, marginBottom: 14 },
//   mapPlaceholder: {
//     width: '100%',
//     height: 200,
//     borderRadius: 16,
//     marginBottom: 14,
//     backgroundColor: C.creamLight,
//     alignItems: 'center',
//     justifyContent: 'center',
//     gap: 10,
//   },
//   mapPlaceholderText: { fontSize: 12, color: C.textSub, textAlign: 'center' },
//   pharmacyItem: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 12,
//     paddingVertical: 12,
//     borderBottomWidth: 1,
//     borderBottomColor: C.borderLight,
//   },
//   pharmacyIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.softGreen + '20', alignItems: 'center', justifyContent: 'center' },
//   pharmacyName: { fontSize: 14, fontWeight: '700', color: C.text },
//   pharmacyAddr: { fontSize: 11, color: C.textSub, marginTop: 2 },
//   refillDialogStyle: { backgroundColor: C.surface, borderRadius: 24, marginHorizontal: 16 },
//   refillMedName: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 },
//   refillLabel: { fontSize: 13, color: C.textSub, marginBottom: 8 },
//   refillInput: {
//     backgroundColor: C.creamLight,
//     borderWidth: 1,
//     borderColor: C.border,
//     borderRadius: 14,
//     paddingHorizontal: 16,
//     paddingVertical: 12,
//     fontSize: 18,
//     fontWeight: '700',
//     color: C.text,
//   },
//   refillHint: { fontSize: 11, color: C.textSub, marginTop: 8 },
// });






















// src/screens/StockScreen.tsx
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Platform, Linking, RefreshControl,
  Animated, TextInput, Alert,
} from 'react-native';
import { ActivityIndicator, Portal, Dialog, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import { useMedications } from '../context/MedicationsContext';
import { Medication } from '../types';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme/colors';

const C = COLORS;

let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;

try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} catch (e) {
  console.log('MapView not available');
}

// ========== ФУНКЦІЇ ДЛЯ РОБОТИ З ЗАЛИШКАМИ ==========

function isStockLow(med: Medication): boolean {
  if (med.stock_quantity == null) return false;
  if (med.stock_quantity <= 0) return true;
  return med.stock_quantity <= 3;
}

function getStockColor(med: Medication): string {
  if (med.stock_quantity == null) return C.textSub;
  if (med.stock_quantity <= 0) return C.missed;
  if (med.stock_quantity <= 3) return C.warn;
  return C.taken;
}

function getStockStatus(med: Medication): string {
  if (med.stock_quantity == null) return 'Не відстежується';
  if (med.stock_quantity <= 0) return 'Вичерпано!';
  if (med.stock_quantity <= 3) return `Терміново! ${med.stock_quantity} ${med.stock_unit}`;
  if (med.stock_quantity <= 10) return `Скоро: ${med.stock_quantity} ${med.stock_unit}`;
  return `${med.stock_quantity} ${med.stock_unit}`;
}

const MED_COLORS = [C.softGreen, C.midGreen, C.darkGreen2, '#4CAF50', '#66BB6A', '#81C784'];

function getMedColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return MED_COLORS[Math.abs(h) % MED_COLORS.length];
}

// ========== КОМПОНЕНТ КАРТКИ ==========

function StockCard({ med, onPress, onRefill }: { med: Medication; onPress: () => void; onRefill: () => void }) {
  const color = getMedColor(med.id);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const stockColor = getStockColor(med);
  const stockStatus = getStockStatus(med);
  const isLow = isStockLow(med);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
    >
      <Animated.View style={[styles.stockCard, { transform: [{ scale: scaleAnim }] }]}>
        <View style={[styles.stockBar, { backgroundColor: stockColor }]} />
        <View style={styles.stockBody}>
          <View style={[styles.stockAvatar, { backgroundColor: color + '22' }]}>
            <Icon name="pill" size={24} color={color} />
          </View>
          <View style={styles.stockInfo}>
            <View style={styles.stockNameRow}>
              <Text style={styles.stockName} numberOfLines={1}>{med.name}</Text>
              {isLow && (
                <View style={styles.lowBadge}>
                  <Icon name="alert" size={10} color={C.white} />
                  <Text style={styles.lowBadgeText}>Мало</Text>
                </View>
              )}
            </View>
            {med.dosage ? <Text style={styles.stockDosage}>{med.dosage}</Text> : null}
            <View style={styles.stockMeta}>
              <Icon name="package-variant" size={14} color={stockColor} />
              <Text style={[styles.stockQty, { color: stockColor }]}>{stockStatus}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.refillBtn} onPress={e => { e.stopPropagation(); onRefill(); }}>
            <Icon name="plus-circle" size={28} color={C.darkGreen} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ========== КОМПОНЕНТ КАРТИ ==========

function PharmacyMap({ userLocation, pharmacies, onOpenInMaps }: any) {
  if (!MapView || !Marker) {
    return (
      <View style={styles.mapPlaceholder}>
        <Icon name="map" size={40} color={C.textSub} />
        <Text style={styles.mapPlaceholderText}>Карта доступна тільки в development build</Text>
      </View>
    );
  }

  return (
    <MapView
      style={styles.map}
      provider={PROVIDER_GOOGLE}
      initialRegion={{
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
    >
      <Marker coordinate={userLocation} title="Ви тут" pinColor={C.softGreen} />
      {pharmacies.map((ph: any) => (
        <Marker
          key={ph.id}
          coordinate={{ latitude: ph.latitude, longitude: ph.longitude }}
          title={ph.name}
          description={ph.vicinity}
          pinColor="#52B788"
          onCalloutPress={() => onOpenInMaps(ph)}
        />
      ))}
    </MapView>
  );
}

// ========== ГОЛОВНИЙ КОМПОНЕНТ ==========

export default function StockScreen({ navigation }: any) {
  const { medications, refetch } = useMedications();
  const [refreshing, setRefreshing] = useState(false);
  const [pharmacyDialog, setPharmacyDialog] = useState(false);
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pharmacyLoading, setPharmacyLoading] = useState(false);
  const [pharmacyError, setPharmacyError] = useState<string | null>(null);
  const [refillDialog, setRefillDialog] = useState<{ visible: boolean; med?: Medication }>({ visible: false });
  const [refillQty, setRefillQty] = useState('');
  const [refillLoading, setRefillLoading] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const allMeds = Array.isArray(medications) ? medications : [];
  const safeMeds = allMeds.filter((med: Medication) => {
    if (!med.end_date) return true;
    const end = new Date(med.end_date);
    end.setHours(23, 59, 59, 999);
    return end >= todayStart;
  });

  const lowStockMeds = safeMeds.filter((med: Medication) => med.stock_quantity != null && med.stock_quantity <= 3);
  const mediumStockMeds = safeMeds.filter((med: Medication) => med.stock_quantity != null && med.stock_quantity > 3 && med.stock_quantity <= 10);
  const goodStockMeds = safeMeds.filter((med: Medication) => med.stock_quantity != null && med.stock_quantity > 10);
  const untrackedMeds = safeMeds.filter((med: Medication) => med.stock_quantity == null);

  const openRefill = (med: Medication) => {
    setRefillQty(String(med.stock_quantity ?? 0));
    setRefillDialog({ visible: true, med });
  };

  const handleRefill = async () => {
    const qty = parseFloat(refillQty);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Помилка', 'Введіть коректну кількість (≥ 0)');
      return;
    }
    setRefillLoading(true);
    try {
      const { error } = await supabase
        .from('medications')
        .update({ stock_quantity: qty })
        .eq('id', refillDialog.med!.id);
      if (error) throw error;
      await refetch();
      setRefillDialog({ visible: false });
      setRefillQty('');
      Alert.alert('Успішно', 'Залишок оновлено');
    } catch (e: any) {
      Alert.alert('Помилка', e?.message || 'Не вдалося оновити залишок');
    } finally {
      setRefillLoading(false);
    }
  };

  // ========== ВИПРАВЛЕНИЙ ПОШУК АПТЕК (РАДІУС 5 КМ) ==========
  const findPharmacies = async () => {
    setPharmacyDialog(true);
    setPharmacyLoading(true);
    setPharmacyError(null);
    setPharmacies([]);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPharmacyError('Доступ до геолокації відхилено');
        setPharmacyLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      setUserLocation({ latitude, longitude });

      // Пошук через Overpass API (OpenStreetMap) — точний пошук у радіусі 5 км
      const overpassQuery = `
        [out:json][timeout:15];
        (
          node["amenity"="pharmacy"](around:5000,${latitude},${longitude});
          way["amenity"="pharmacy"](around:5000,${latitude},${longitude});
        );
        out center 15;
      `;

      const overpassUrl = 'https://overpass-api.de/api/interpreter';
      const resp = await fetch(overpassUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();

      if (data?.elements?.length > 0) {
        const results = data.elements.map((el: any, idx: number) => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          const tags = el.tags || {};

          const name =
            tags['name:uk'] ||
            tags.name ||
            tags['name:ru'] ||
            'Аптека';

          const street = tags['addr:street'] || '';
          const house = tags['addr:housenumber'] || '';
          const city = tags['addr:city'] || '';
          const vicinity = [street, house, city].filter(Boolean).join(', ') || 'Адреса невідома';

          return {
            id: `ph_${el.id ?? idx}`,
            name,
            latitude: lat,
            longitude: lon,
            vicinity,
            phone: tags.phone || tags['contact:phone'] || null,
            opening_hours: tags.opening_hours || null,
          };
        }).filter((ph: any) => ph.latitude && ph.longitude);

        if (results.length > 0) {
          setPharmacies(results);
        } else {
          setPharmacyError('Аптеки поруч не знайдено (радіус 5 км)');
        }
      } else {
        setPharmacyError('Аптеки поруч не знайдено (радіус 5 км)');
      }
    } catch (e) {
      console.error('Pharmacy search error:', e);
      setPharmacyError('Помилка пошуку аптек. Перевірте інтернет-з\'єднання.');
    } finally {
      setPharmacyLoading(false);
    }
  };

  const openInMaps = (ph: any) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${ph.name}@${ph.latitude},${ph.longitude}`,
      android: `geo:${ph.latitude},${ph.longitude}?q=${ph.latitude},${ph.longitude}(${encodeURIComponent(ph.name)})`,
      default: `https://www.google.com/maps/search/?api=1&query=${ph.latitude},${ph.longitude}`,
    });
    Linking.openURL(url!);
  };

  const hasAnyStockTracking = lowStockMeds.length > 0 || mediumStockMeds.length > 0 || goodStockMeds.length > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Залишки ліків</Text>
        <Text style={styles.headerSub}>Контроль запасів та аптеки поруч</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.softGreen} />}
      >
        <TouchableOpacity style={styles.pharmacyBtn} onPress={findPharmacies} activeOpacity={0.87}>
          <View style={styles.pharmacyBtnLeft}>
            <Icon name="map-marker-radius" size={24} color={C.cream} />
            <View>
              <Text style={styles.pharmacyBtnTitle}>Найближчі аптеки</Text>
              <Text style={styles.pharmacyBtnSub}>Знайти де купити ліки (до 5 км)</Text>
            </View>
          </View>
          <Icon name="chevron-right" size={24} color={C.softGreen} />
        </TouchableOpacity>

        {lowStockMeds.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: C.missedBg }]}>
                <Icon name="alert-circle" size={18} color={C.missed} />
              </View>
              <Text style={styles.sectionTitle}>Терміново поповнити!</Text>
              <View style={[styles.badge, { backgroundColor: C.missed }]}>
                <Text style={styles.badgeText}>{lowStockMeds.length}</Text>
              </View>
            </View>
            {lowStockMeds.map((med: Medication) => (
              <StockCard
                key={med.id}
                med={med}
                onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
                onRefill={() => openRefill(med)}
              />
            ))}
          </View>
        )}

        {mediumStockMeds.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: C.warnBg }]}>
                <Icon name="alert" size={18} color={C.warn} />
              </View>
              <Text style={styles.sectionTitle}>Скоро закінчиться</Text>
              <View style={[styles.badge, { backgroundColor: C.warn }]}>
                <Text style={styles.badgeText}>{mediumStockMeds.length}</Text>
              </View>
            </View>
            {mediumStockMeds.map((med: Medication) => (
              <StockCard
                key={med.id}
                med={med}
                onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
                onRefill={() => openRefill(med)}
              />
            ))}
          </View>
        )}

        {goodStockMeds.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: C.takenBg }]}>
                <Icon name="check-circle" size={18} color={C.taken} />
              </View>
              <Text style={styles.sectionTitle}>Достатньо запасів</Text>
              <View style={[styles.badge, { backgroundColor: C.taken }]}>
                <Text style={styles.badgeText}>{goodStockMeds.length}</Text>
              </View>
            </View>
            {goodStockMeds.map((med: Medication) => (
              <StockCard
                key={med.id}
                med={med}
                onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
                onRefill={() => openRefill(med)}
              />
            ))}
          </View>
        )}

        {untrackedMeds.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: C.borderLight }]}>
                <Icon name="package-variant-closed" size={18} color={C.textSub} />
              </View>
              <Text style={styles.sectionTitle}>Без відстеження</Text>
              <View style={[styles.badge, { backgroundColor: C.textSub }]}>
                <Text style={styles.badgeText}>{untrackedMeds.length}</Text>
              </View>
            </View>
            {untrackedMeds.map((med: Medication) => (
              <TouchableOpacity
                key={med.id}
                style={styles.untrackedCard}
                onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
              >
                <Icon name="pill" size={20} color={C.textSub} />
                <Text style={styles.untrackedName}>{med.name}</Text>
                <Icon name="chevron-right" size={18} color={C.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!hasAnyStockTracking && untrackedMeds.length === 0 && safeMeds.length > 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Icon name="archive-arrow-down-outline" size={44} color={C.softGreen} />
            </View>
            <Text style={styles.emptyStateTitle}>Немає даних про залишки</Text>
            <Text style={styles.emptyStateText}>
              Увімкніть відстеження залишків при додаванні або редагуванні ліків.
            </Text>
          </View>
        )}

        {safeMeds.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Icon name="pill-off" size={44} color={C.softGreen} />
            </View>
            <Text style={styles.emptyStateTitle}>Немає ліків</Text>
            <Text style={styles.emptyStateText}>
              Додайте перший препарат, щоб почати відстеження.
            </Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => navigation.navigate('AddEditMedication')}>
              <Icon name="plus" size={18} color={C.white} />
              <Text style={styles.emptyAddBtnText}>Додати ліки</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ===== ДІАЛОГ АПТЕК ===== */}
      <Portal>
        <Dialog visible={pharmacyDialog} onDismiss={() => setPharmacyDialog(false)} style={styles.pharmacyDialog}>
          <Dialog.Title style={styles.dialogTitle}>Найближчі аптеки</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            {pharmacyLoading ? (
              <View style={styles.pharmacyLoader}>
                <ActivityIndicator size="large" color={C.softGreen} />
                <Text style={styles.loaderText}>Пошук аптек поруч (радіус 5 км)...</Text>
              </View>
            ) : pharmacyError ? (
              <View style={styles.pharmacyError}>
                <Icon name="map-marker-off" size={48} color={C.borderLight} />
                <Text style={styles.pharmacyErrorText}>{pharmacyError}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={findPharmacies}>
                  <Text style={styles.retryBtnText}>Спробувати ще</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {userLocation && pharmacies.length > 0 && (
                  <PharmacyMap
                    userLocation={userLocation}
                    pharmacies={pharmacies}
                    onOpenInMaps={openInMaps}
                  />
                )}
                {pharmacies.map((ph: any) => (
                  <TouchableOpacity key={ph.id} style={styles.pharmacyItem} onPress={() => openInMaps(ph)}>
                    <View style={styles.pharmacyIcon}>
                      <Icon name="store" size={22} color={C.darkGreen} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pharmacyName}>{ph.name}</Text>
                      <Text style={styles.pharmacyAddr}>{ph.vicinity}</Text>
                      {ph.opening_hours ? (
                        <Text style={styles.pharmacyHours}>
                          <Icon name="clock-outline" size={10} color={C.textSub} /> {ph.opening_hours}
                        </Text>
                      ) : null}
                      {ph.phone ? (
                        <Text style={styles.pharmacyPhone}>
                          <Icon name="phone-outline" size={10} color={C.softGreen} /> {ph.phone}
                        </Text>
                      ) : null}
                    </View>
                    <Icon name="directions" size={24} color={C.softGreen} />
                  </TouchableOpacity>
                ))}
                {pharmacies.length > 0 && (
                  <Text style={styles.osmCredit}>© OpenStreetMap contributors</Text>
                )}
              </ScrollView>
            )}
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setPharmacyDialog(false)} textColor={C.darkGreen}>Закрити</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* ===== ДІАЛОГ ПОПОВНЕННЯ ===== */}
      <Portal>
        <Dialog visible={refillDialog.visible} onDismiss={() => setRefillDialog({ visible: false })} style={styles.refillDialogStyle}>
          <Dialog.Title style={styles.dialogTitle}>Поповнити залишок</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.refillMedName}>{refillDialog.med?.name}</Text>
            <Text style={styles.refillLabel}>
              Нова кількість ({refillDialog.med?.stock_unit || 'одиниць'})
            </Text>
            <TextInput
              style={styles.refillInput}
              value={refillQty}
              onChangeText={setRefillQty}
              keyboardType="numeric"
              placeholder="Введіть кількість"
              placeholderTextColor={C.textTertiary}
              autoFocus
            />
            <Text style={styles.refillHint}>
              Поточний залишок: {refillDialog.med?.stock_quantity ?? 0} {refillDialog.med?.stock_unit ?? ''}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRefillDialog({ visible: false })} textColor={C.textSub}>Скасувати</Button>
            <Button onPress={handleRefill} textColor={C.darkGreen} loading={refillLoading} disabled={refillLoading}>Зберегти</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.creamLight },
  scrollContent: { paddingBottom: 40 },
  header: {
    backgroundColor: C.darkGreen,
    paddingTop: Platform.OS === 'ios' ? 60 : 46,
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: C.cream },
  headerSub: { fontSize: 13, color: 'rgba(243,232,211,0.65)', marginTop: 3 },
  pharmacyBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: C.darkGreen,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  pharmacyBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pharmacyBtnTitle: { fontSize: 16, fontWeight: '700', color: C.cream },
  pharmacyBtnSub: { fontSize: 12, color: 'rgba(243,232,211,0.65)', marginTop: 2 },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  stockCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  stockBar: { width: 5 },
  stockBody: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  stockAvatar: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stockInfo: { flex: 1 },
  stockNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  stockName: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  stockDosage: { fontSize: 12, color: C.textSub, marginTop: 2 },
  stockMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  stockQty: { fontSize: 13, fontWeight: '600' },
  lowBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.missed, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 2 },
  lowBadgeText: { fontSize: 9, fontWeight: '700', color: C.white },
  refillBtn: { padding: 6 },
  untrackedCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  untrackedName: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 52,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: C.softGreen + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: C.softGreen + '30',
  },
  emptyStateTitle: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  emptyStateText: { fontSize: 14, color: C.textSub, textAlign: 'center', paddingHorizontal: 20, lineHeight: 21 },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.darkGreen,
    paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 18, marginTop: 6,
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  emptyAddBtnText: { color: C.cream, fontWeight: '700', fontSize: 15 },
  pharmacyDialog: { backgroundColor: C.surface, borderRadius: 28, maxHeight: '85%', marginHorizontal: 12 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  dialogScrollArea: { maxHeight: 520 },
  pharmacyLoader: { alignItems: 'center', paddingVertical: 40, gap: 14 },
  loaderText: { color: C.textSub, fontSize: 14 },
  pharmacyError: { alignItems: 'center', paddingVertical: 36, gap: 12 },
  pharmacyErrorText: { color: C.textSub, fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: C.darkGreen, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText: { color: C.cream, fontWeight: '700' },
  map: { width: '100%', height: 220, borderRadius: 16, marginBottom: 14 },
  mapPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    marginBottom: 14,
    backgroundColor: C.creamLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mapPlaceholderText: { fontSize: 12, color: C.textSub, textAlign: 'center' },
  pharmacyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  pharmacyIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.softGreen + '20', alignItems: 'center', justifyContent: 'center' },
  pharmacyName: { fontSize: 14, fontWeight: '700', color: C.text },
  pharmacyAddr: { fontSize: 11, color: C.textSub, marginTop: 2 },
  pharmacyHours: { fontSize: 10, color: C.textSub, marginTop: 2 },
  pharmacyPhone: { fontSize: 10, color: C.softGreen, marginTop: 2 },
  osmCredit: { fontSize: 10, color: C.textTertiary, textAlign: 'center', paddingVertical: 12 },
  refillDialogStyle: { backgroundColor: C.surface, borderRadius: 24, marginHorizontal: 16 },
  refillMedName: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 },
  refillLabel: { fontSize: 13, color: C.textSub, marginBottom: 8 },
  refillInput: {
    backgroundColor: C.creamLight,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  refillHint: { fontSize: 11, color: C.textSub, marginTop: 8 },
});