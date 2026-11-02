
// src/screens/ReportsScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, RefreshControl,
  Alert, StatusBar, Platform, TouchableOpacity,
} from 'react-native';
import { Text, ActivityIndicator, Snackbar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useMedications } from '../context/MedicationsContext';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { COLORS } from '../theme/colors';

const C = COLORS;

const capitalize = (str: string) => (str ? str.charAt(0).toUpperCase() + str.slice(1) : str);

function getAdherenceColor(pct: number) {
  if (pct >= 80) return C.taken;
  if (pct >= 50) return C.warn;
  return C.missed;
}

function getAdherenceIcon(pct: number) {
  if (pct >= 80) return 'check-circle';
  if (pct >= 50) return 'alert-circle';
  return 'close-circle';
}

const ProgressBar = ({ percentage, color }: { percentage: number; color: string }) => (
  <View style={styles.progressBg}>
    <View style={[styles.progressFill, { width: `${Math.min(percentage, 100)}%`, backgroundColor: color }]} />
  </View>
);

const generateReportHTML = (summary: any, medications: any[]) => {
  if (!summary) return '';
  const now = new Date();
  return `
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>Звіт MediTracker</title>
    <style>
      * { margin:0;padding:0;box-sizing:border-box }
      body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F3E8D3;padding:30px 20px;color:#1A2E1A }
      .container { max-width:800px;margin:0 auto;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 4px 24px rgba(19,50,21,0.1) }
      .header { background:linear-gradient(135deg,#133215 0%,#2D6B30 100%);padding:32px 24px;text-align:center }
      h1 { color:#F3E8D3;font-size:26px;font-weight:800;margin-bottom:6px }
      .subtitle { color:rgba(243,232,211,0.75);font-size:13px }
      .date { color:rgba(243,232,211,0.55);font-size:11px;margin-top:10px }
      .content { padding:24px }
      .section { margin-bottom:28px }
      .section-title { font-size:17px;font-weight:700;color:#133215;margin-bottom:14px;padding-left:12px;border-left:4px solid #92B775 }
      .stats-row { display:flex;gap:12px }
      .stat { flex:1;background:#F3E8D3;padding:16px;border-radius:16px;text-align:center }
      .stat-value { font-size:28px;font-weight:800;color:#133215 }
      .stat-label { font-size:11px;color:#5A7060;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px }
      table { width:100%;border-collapse:collapse;margin-top:8px }
      th,td { padding:12px 14px;text-align:left;border-bottom:1px solid #EDE4D3;font-size:13px }
      th { background:#F3E8D3;font-weight:700;color:#5A7060;font-size:11px;text-transform:uppercase;letter-spacing:0.5px }
      .ok { color:#52B788;font-weight:700 }
      .warn { color:#C97B1A;font-weight:700 }
      .bad { color:#D64045;font-weight:700 }
      .med-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px }
      .med-card { background:#F3E8D3;padding:14px;border-radius:14px }
      .med-name { font-weight:700;font-size:14px;margin-bottom:4px;color:#133215 }
      .med-detail { font-size:11px;color:#5A7060;line-height:1.5 }
      .footer { background:#F3E8D3;padding:16px;text-align:center;font-size:11px;color:#8FA88A }
    </style></head><body>
    <div class="container">
      <div class="header">
        <h1>📊 Звіт про прийом ліків</h1>
        <div class="subtitle">Аналітика дотримання лікування</div>
        <div class="date">Створено: ${format(now, 'dd MMMM yyyy, HH:mm', { locale: uk })}</div>
      </div>
      <div class="content">
        <div class="section">
          <div class="section-title">Підсумок за сьогодні</div>
          <div class="stats-row">
            <div class="stat"><div class="stat-value">${summary.todayTaken}</div><div class="stat-label">Прийнято</div></div>
            <div class="stat"><div class="stat-value">${summary.todayScheduled}</div><div class="stat-label">Заплановано</div></div>
            <div class="stat"><div class="stat-value">${summary.todayMissed ?? 0}</div><div class="stat-label">Пропущено</div></div>
            <div class="stat"><div class="stat-value">${Math.round(summary.todayPercentage)}%</div><div class="stat-label">Дотримання</div></div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">Загальна статистика (30 днів)</div>
          <div class="stats-row">
            <div class="stat"><div class="stat-value">${summary.totalTaken}</div><div class="stat-label">Всього прийнято</div></div>
            <div class="stat"><div class="stat-value">${Math.round(summary.overallAdherence ?? 0)}%</div><div class="stat-label">Дотримання</div></div>
            <div class="stat"><div class="stat-value">${summary.currentStreak}</div><div class="stat-label">Поточна серія</div></div>
            <div class="stat"><div class="stat-value">${summary.bestStreak}</div><div class="stat-label">Найкраща серія</div></div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">Останні 7 днів</div>
          <table>
            <thead><tr><th>Дата</th><th>Прийнято</th><th>Пропущено</th><th>Дотримання</th></tr></thead>
            <tbody>${summary.weeklyData.map((d: any) => {
              const cls = d.percentage >= 80 ? 'ok' : d.percentage >= 50 ? 'warn' : 'bad';
              return `<tr>
                <td style="font-weight:500">${capitalize(format(d.date, 'EEEE, d MMM', { locale: uk }))}</td>
                <td>${d.taken}/${d.scheduled}</td>
                <td>${d.missed}</td>
                <td class="${cls}">${Math.round(d.percentage)}%</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
        <div class="section">
          <div class="section-title">Активні ліки (${medications.length})</div>
          <div class="med-grid">${medications.map((m: any) => `
            <div class="med-card">
              <div class="med-name">💊 ${m.name}</div>
              <div class="med-detail">
                Дозування: ${m.dosage || 'Не вказано'}<br>
                Початок: ${format(new Date(m.start_date), 'dd MMM yyyy', { locale: uk })}<br>
                ${m.stock_quantity != null ? `Залишок: ${m.stock_quantity} ${m.stock_unit ?? ''}` : ''}
              </div>
            </div>`).join('')}
          </div>
        </div>
      </div>
      <div class="footer"><p>Звіт згенеровано в MediTracker · © ${now.getFullYear()}</p></div>
    </div></body></html>`;
};

export default function ReportsScreen({ navigation }: any) {
  const { medications, adherenceSummary: summary, refetch, isLoading } = useMedications();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const exportToPDF = async () => {
    if (!summary) {
      Alert.alert('Помилка', 'Немає даних для експорту');
      return;
    }
    setExporting(true);
    try {
      const html = generateReportHTML(summary, medications);
      if (!html) throw new Error('Cannot generate');
      const { uri } = await Print.printToFileAsync({ html });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Помилка', 'Спільний доступ недоступний');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Експорт звіту MediTracker',
      });
      setSnackbar({ visible: true, message: 'PDF звіт успішно експортовано' });
    } catch (e) {
      console.error(e);
      Alert.alert('Помилка', 'Не вдалося створити PDF');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading && !summary) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.softGreen} />
        <Text style={styles.centerText}>Завантаження...</Text>
      </View>
    );
  }

  // Порожній стан - ідентичний головному екрану (з контуром)
  if (medications.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Статистика</Text>
          <Text style={styles.headerSub}>Дотримання режиму лікування</Text>
        </View>
        
        <ScrollView 
          contentContainerStyle={styles.scrollContentEmpty}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Icon name="chart-line" size={44} color={C.softGreen} />
            </View>
            <Text style={styles.emptyStateTitle}>Немає даних</Text>
            <Text style={styles.emptyStateText}>
              Додайте ліки, щоб бачити статистику
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  const pct = summary?.todayPercentage ?? 0;
  const adherenceColor = getAdherenceColor(pct);
  const overallPct = summary?.overallAdherence ?? 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Статистика</Text>
        <Text style={styles.headerSub}>Дотримання режиму лікування</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.softGreen}
            colors={[C.softGreen]}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {summary && (
          <>
            {/* Today card */}
            <View style={styles.todayCard}>
              <View style={styles.todayHeader}>
                <Text style={styles.todayTitle}>
                  {capitalize(format(new Date(), 'EEEE', { locale: uk }))}
                </Text>
                <View style={styles.todayBadge}>
                  <Icon name="calendar-today" size={13} color={C.darkGreen} />
                  <Text style={styles.todayBadgeText}>
                    {format(new Date(), 'd MMMM', { locale: uk })}
                  </Text>
                </View>
              </View>

              <View style={styles.todayStats}>
                {[
                  { value: summary.todayTaken, label: 'Прийнято', color: C.taken },
                  { value: summary.todayScheduled, label: 'Заплановано', color: C.darkGreen },
                  { value: summary.todayMissed ?? 0, label: 'Пропущено', color: C.missed },
                  { value: `${Math.round(pct)}%`, label: 'Дотримання', color: adherenceColor },
                ].map((s, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <View style={styles.divider} />}
                    <View style={styles.todayStat}>
                      <Text style={[styles.todayStatVal, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.todayStatLabel}>{s.label}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>

              <ProgressBar percentage={pct} color={adherenceColor} />
            </View>

            {/* 30-day summary */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>За 30 днів</Text>
              <View style={styles.statsGrid}>
                {[
                  {
                    icon: 'chart-arc',
                    value: `${Math.round(overallPct)}%`,
                    label: 'Дотримання',
                    color: getAdherenceColor(overallPct),
                    bg: getAdherenceColor(overallPct) + '22',
                  },
                  {
                    icon: 'check-all',
                    value: summary.totalTaken,
                    label: 'Всього прийнято',
                    color: C.taken,
                    bg: C.takenBg,
                  },
                  {
                    icon: 'close-circle-outline',
                    value: summary.totalMissed ?? 0,
                    label: 'Всього пропущено',
                    color: C.missed,
                    bg: C.missedBg,
                  },
                ].map((s, i) => (
                  <View key={i} style={styles.statItem}>
                    <View style={[styles.statIconWrap, { backgroundColor: s.bg }]}>
                      <Icon name={s.icon} size={20} color={s.color} />
                    </View>
                    <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Streaks */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Серії прийомів</Text>
              <View style={styles.statsGrid}>
                {[
                  {
                    icon: 'fire',
                    value: `${summary.currentStreak} дн.`,
                    label: 'Поточна серія',
                    color: C.warn,
                    bg: C.warnBg,
                  },
                  {
                    icon: 'trophy',
                    value: `${summary.bestStreak} дн.`,
                    label: 'Найкраща серія',
                    color: '#C97B1A',
                    bg: '#C97B1A22',
                  },
                  {
                    icon: 'pill-multiple',
                    value: summary.activeMedications ?? medications.length,
                    label: 'Активних ліків',
                    color: C.softGreen,
                    bg: C.softGreen + '22',
                  },
                ].map((s, i) => (
                  <View key={i} style={styles.statItem}>
                    <View style={[styles.statIconWrap, { backgroundColor: s.bg }]}>
                      <Icon name={s.icon} size={20} color={s.color} />
                    </View>
                    <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Weekly breakdown */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Останні 7 днів</Text>
              {summary.weeklyData.map((day: any, i: number) => {
                const color = getAdherenceColor(day.percentage);
                const isLast = i === summary.weeklyData.length - 1;
                return (
                  <View key={i} style={[styles.weekRow, isLast && { borderBottomWidth: 0 }]}>
                    <View style={styles.weekInfo}>
                      <Text style={styles.weekDay}>
                        {capitalize(format(day.date, 'EEEE', { locale: uk }))}
                      </Text>
                      <Text style={styles.weekDate}>{format(day.date, 'd MMM', { locale: uk })}</Text>
                    </View>
                    <View style={styles.weekRight}>
                      <View style={styles.weekDoses}>
                        <Icon name="pill" size={13} color={C.textSub} />
                        <Text style={styles.weekDosesText}>{day.taken}/{day.scheduled}</Text>
                      </View>
                      {day.missed > 0 && (
                        <View style={[styles.weekDoses, { backgroundColor: C.missedBg }]}>
                          <Icon name="close" size={12} color={C.missed} />
                          <Text style={[styles.weekDosesText, { color: C.missed }]}>{day.missed}</Text>
                        </View>
                      )}
                      <View style={styles.weekPct}>
                        <Icon name={getAdherenceIcon(day.percentage)} size={15} color={color} />
                        <Text style={[styles.weekPctText, { color }]}>{Math.round(day.percentage)}%</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Export PDF button */}
        <TouchableOpacity
          style={[styles.exportBtn, exporting && { opacity: 0.7 }]}
          onPress={exportToPDF}
          disabled={exporting}
          activeOpacity={0.85}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={C.cream} />
          ) : (
            <>
              <Icon name="file-pdf-box" size={22} color={C.cream} />
              <Text style={styles.exportBtnText}>Експортувати у PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
        style={styles.snackbar}
      >
        <View style={styles.snackbarContent}>
          <Icon name="check-circle" size={16} color={C.taken} />
          <Text style={styles.snackbarText}>{snackbar.message}</Text>
        </View>
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.creamLight },
  scrollContent: { 
    paddingHorizontal: 16, 
    paddingBottom: 40,
  },
  scrollContentEmpty: { 
    paddingHorizontal: 16, 
    paddingBottom: 40,
    paddingTop: 50,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.creamLight, padding: 32 },
  centerText: { marginTop: 12, fontSize: 14, color: C.textSub },
  
  // ТОЧНО ТАКИЙ САМИЙ СТИЛЬ ЯК НА ГОЛОВНОМУ ЕКРАНІ (з контуром)
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
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.3,
  },
  emptyStateText: {
    fontSize: 14,
    color: C.textSub,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 21,
  },
  
  header: { 
    backgroundColor: C.darkGreen, 
    paddingTop: Platform.OS === 'ios' ? 60 : 46, 
    paddingHorizontal: 20, 
    paddingBottom: 20, 
    borderBottomLeftRadius: 28, 
    borderBottomRightRadius: 28 
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: C.cream, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: 'rgba(243,232,211,0.65)', marginTop: 3 },
  
  todayCard: { 
    backgroundColor: C.surface, 
    marginHorizontal: 0, 
    marginTop: 16, 
    marginBottom: 10, 
    borderRadius: 24, 
    padding: 20, 
    shadowColor: C.darkGreen, 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.07, 
    shadowRadius: 8, 
    elevation: 2 
  },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  todayTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  todayBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.softGreen + '20', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  todayBadgeText: { fontSize: 12, fontWeight: '700', color: C.darkGreen },
  todayStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 16 },
  todayStat: { alignItems: 'center', flex: 1 },
  todayStatVal: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  todayStatLabel: { fontSize: 10, color: C.textSub, marginTop: 4, textAlign: 'center' },
  divider: { width: 1, height: 38, backgroundColor: C.borderLight },
  progressBg: { height: 6, backgroundColor: C.borderLight, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  card: { 
    backgroundColor: C.surface, 
    marginHorizontal: 0, 
    marginBottom: 10, 
    borderRadius: 24, 
    padding: 20, 
    shadowColor: C.darkGreen, 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.07, 
    shadowRadius: 8, 
    elevation: 2 
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 14 },
  statsGrid: { flexDirection: 'row', gap: 10 },
  statItem: { flex: 1, alignItems: 'center', backgroundColor: C.creamLight, borderRadius: 16, padding: 14 },
  statIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 18, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 10, color: C.textSub, marginTop: 4, textAlign: 'center', fontWeight: '600' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  weekInfo: { flex: 1 },
  weekDay: { fontSize: 14, fontWeight: '600', color: C.text },
  weekDate: { fontSize: 11, color: C.textSub, marginTop: 2 },
  weekRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekDoses: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.creamLight, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  weekDosesText: { fontSize: 13, fontWeight: '600', color: C.text },
  weekPct: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 50 },
  weekPctText: { fontSize: 13, fontWeight: '700' },
  exportBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: C.darkGreen, 
    marginHorizontal: 0, 
    marginTop: 8, 
    marginBottom: 20, 
    paddingVertical: 16, 
    borderRadius: 22, 
    gap: 10, 
    shadowColor: C.darkGreen, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.22, 
    shadowRadius: 8, 
    elevation: 6 
  },
  exportBtnText: { color: C.cream, fontSize: 16, fontWeight: '700' },
  snackbar: { backgroundColor: C.text, borderRadius: 12 },
  snackbarContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  snackbarText: { color: '#fff', fontSize: 14 },
});