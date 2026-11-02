import React, { useState, useMemo, useCallback } from 'react';
import {
	View, Text, ScrollView, TouchableOpacity,
	StyleSheet, Dimensions, RefreshControl, StatusBar, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
	format, startOfMonth, endOfMonth, eachDayOfInterval,
	isSameDay, isToday, isBefore, startOfDay, addMonths, subMonths, getDay, isAfter,
} from 'date-fns';
import { uk } from 'date-fns/locale';
import { useMedications } from '../context/MedicationsContext';
import { getDosesForDay } from '../services/scheduleGenerator';
import { COLORS } from '../theme/colors';

const C = COLORS;
const { width } = Dimensions.get('window');
const DAY_SIZE = Math.floor((width - 88) / 7);
const CELL_MARGIN = 2;

type DayStatus = 'full' | 'partial' | 'missed' | 'none' | 'future';

interface DayInfo {
	date: Date;
	status: DayStatus;
	total: number;
	taken: number;
	missed: number;
}

interface DoseWithStatus {
	medName: string;
	dosage: string | null;
	taken: boolean;
	missed: boolean;
	scheduledTime: Date;
}

const capitalize = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1) : str;

function DayCell({ info, isSelected, onPress }: { info: DayInfo; isSelected: boolean; onPress: () => void }) {
	const { date, status, total, taken } = info;
	const today = isToday(date);

	let bg = 'transparent';
	let dotColor = 'transparent';
	let statusText = '';

	if (status === 'full') { bg = C.takenBg; dotColor = C.taken; statusText = '✓'; }
	if (status === 'partial') { bg = C.partialBg; dotColor = C.partial; statusText = `${taken}/${total}`; }
	if (status === 'missed') { bg = C.missedBg; dotColor = C.missed; statusText = '✗'; }

	return (
		<TouchableOpacity
			style={[styles.cell, { backgroundColor: isSelected ? C.darkGreen : bg }, today && !isSelected && styles.todayCell]}
			onPress={onPress}
			activeOpacity={0.7}
		>
			<Text style={[
				styles.dayNum,
				isSelected && { color: C.cream, fontWeight: '800' },
				today && !isSelected && { color: C.darkGreen, fontWeight: '800' },
				status === 'future' && { color: C.textTertiary },
			]}>
				{format(date, 'd')}
			</Text>
			{status !== 'future' && status !== 'none' && total > 0 && (
				<View style={[styles.dayDot, { backgroundColor: isSelected ? C.softGreen : dotColor }]} />
			)}
			{status === 'partial' && !isSelected && (
				<Text style={styles.partialText}>{statusText}</Text>
			)}
		</TouchableOpacity>
	);
}

export default function CalendarScreen() {
	const { medications, doseLogs, refetch } = useMedications();
	const [currentMonth, setCurrentMonth] = useState(new Date());
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [refreshing, setRefreshing] = useState(false);
	const [filter, setFilter] = useState<'all' | 'taken' | 'missed'>('all');

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	}, [refetch]);

	// Обчислення статусів днів у поточному місяці
	const daysData = useMemo(() => {
		const now = new Date();
		const monthStart = startOfMonth(currentMonth);
		const monthEnd = endOfMonth(currentMonth);
		const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

		return daysInMonth.map(date => {
			let total = 0;
			let taken = 0;
			let missed = 0;

			for (const med of medications) {
				const doses = getDosesForDay(med, date, doseLogs);
				for (const dose of doses) {
					total++;
					if (dose.status === 'taken') taken++;
					if (dose.status === 'missed') missed++;
				}
			}

			const isPastDate = isBefore(startOfDay(date), startOfDay(now));
			const isCurrentDay = isToday(date);
			
			let status: DayStatus;
			if (total === 0) {
				status = (!isPastDate && !isCurrentDay) ? 'future' : 'none';
			} else if (!isPastDate && !isCurrentDay) {
				status = 'future';
			} else if (taken === total) {
				status = 'full';
			} else if (taken > 0) {
				status = 'partial';
			} else {
				status = 'missed';
			}

			return { date, status, total, taken, missed };
		});
	}, [currentMonth, medications, doseLogs]);

	const selectedDayData = useMemo(() => {
		return daysData.find(d => isSameDay(d.date, selectedDate));
	}, [daysData, selectedDate]);

	// Всі дози для вибраного дня (з назвами препаратів)
	const allDoses = useMemo((): DoseWithStatus[] => {
		const result: DoseWithStatus[] = [];
		for (const med of medications) {
			const doses = getDosesForDay(med, selectedDate, doseLogs);
			for (const dose of doses) {
				result.push({
					medName: med.name,
					dosage: med.dosage || null,
					taken: dose.status === 'taken',
					missed: dose.status === 'missed',
					scheduledTime: dose.scheduledTime,
				});
			}
		}
		return result.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
	}, [medications, doseLogs, selectedDate]);

	const filteredDoses = useMemo(() => {
		if (filter === 'taken') return allDoses.filter(d => d.taken);
		if (filter === 'missed') return allDoses.filter(d => d.missed);
		return allDoses;
	}, [allDoses, filter]);

	const filterStats = useMemo(() => {
		const taken = allDoses.filter(d => d.taken).length;
		const missed = allDoses.filter(d => d.missed).length;
		return { taken, missed, total: allDoses.length };
	}, [allDoses]);

	const gridDays = useMemo(() => {
		const firstDayIndex = getDay(startOfMonth(currentMonth));
		const empties = Array(firstDayIndex).fill(null);
		return [...empties, ...daysData];
	}, [daysData, currentMonth]);

	const weekDays = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

	return (
		<View style={styles.container}>
			{/* <StatusBar barStyle="light-content" backgroundColor={C.darkGreen} /> */}
			<StatusBar barStyle="light-content" />
			<View style={styles.header}>
				<Text style={styles.headerTitle}>Календар</Text>
				<Text style={styles.headerSub}>Історія прийомів</Text>
			</View>

			<ScrollView
				showsVerticalScrollIndicator={false}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.softGreen} colors={[C.softGreen]} />}
				contentContainerStyle={styles.scrollContent}
			>
				<View style={styles.calendarWrapper}>
					<View style={styles.calendarCard}>
						<View style={styles.monthNav}>
							<TouchableOpacity style={styles.navBtn} onPress={() => setCurrentMonth(subMonths(currentMonth, 1))}>
								<Icon name="chevron-left" size={20} color={C.darkGreen} />
							</TouchableOpacity>
							<Text style={styles.monthTitle}>{capitalize(format(currentMonth, 'LLLL yyyy', { locale: uk }))}</Text>
							<TouchableOpacity style={styles.navBtn} onPress={() => setCurrentMonth(addMonths(currentMonth, 1))}>
								<Icon name="chevron-right" size={20} color={C.darkGreen} />
							</TouchableOpacity>
						</View>

						<View style={styles.weekDaysRow}>
							{weekDays.map(d => <Text key={d} style={styles.weekDayLabel}>{d}</Text>)}
						</View>

						<View style={styles.calendarGrid}>
							{gridDays.map((item, index) => item === null
								? <View key={`e-${index}`} style={styles.cellPlaceholder} />
								: <DayCell
										key={item.date.toISOString()}
										info={item}
										isSelected={isSameDay(item.date, selectedDate)}
										onPress={() => setSelectedDate(item.date)}
									/>
							)}
						</View>

						<View style={styles.legend}>
							{[
								{ color: C.taken, label: 'Всі прийнято' },
								{ color: C.partial, label: 'Частково' },
								{ color: C.missed, label: 'Пропущено' },
							].map(l => (
								<View key={l.label} style={styles.legendItem}>
									<View style={[styles.legendDot, { backgroundColor: l.color }]} />
									<Text style={styles.legendText}>{l.label}</Text>
								</View>
							))}
						</View>
					</View>
				</View>

				<View style={styles.dayDetailsCard}>
					<View style={styles.dayDetailsHeader}>
						<View>
							<Text style={styles.dayDetailsTitle}>{capitalize(format(selectedDate, 'EEEE', { locale: uk }))}</Text>
							<Text style={styles.dayDetailsSubtitle}>{capitalize(format(selectedDate, 'd MMMM yyyy', { locale: uk }))}</Text>
						</View>
						{isToday(selectedDate) && (
							<View style={styles.todayBadge}>
								<Text style={styles.todayBadgeText}>Сьогодні</Text>
							</View>
						)}
					</View>

					{selectedDayData && (
						<View style={styles.daySummary}>
							<TouchableOpacity 
								style={[styles.summaryItem, filter === 'all' && styles.summaryItemActive]}
								onPress={() => setFilter('all')}
							>
								<Text style={[styles.summaryText, filter === 'all' && styles.summaryTextActive]}>
									Всі: {filterStats.total}
								</Text>
							</TouchableOpacity>
							
							<TouchableOpacity 
								style={[styles.summaryItem, filter === 'taken' && styles.summaryItemTaken]}
								onPress={() => setFilter('taken')}
							>
								<Text style={[styles.summaryText, filter === 'taken' && styles.summaryTextWhite]}>
									Прийнято: {filterStats.taken}
								</Text>
							</TouchableOpacity>
							
							<TouchableOpacity 
								style={[styles.summaryItem, filter === 'missed' && styles.summaryItemMissed]}
								onPress={() => setFilter('missed')}
							>
								<Text style={[styles.summaryText, filter === 'missed' && styles.summaryTextWhite]}>
									Пропущено: {filterStats.missed}
								</Text>
							</TouchableOpacity>
						</View>
					)}

					{filteredDoses.length === 0 ? (
						<View style={styles.emptyDoses}>
							<Icon name="pill" size={40} color={C.borderLight} />
							<Text style={styles.emptyDosesText}>
								{filter === 'all' && 'Немає запланованих прийомів'}
								{filter === 'taken' && 'Немає прийнятих доз'}
								{filter === 'missed' && 'Немає пропущених доз'}
							</Text>
						</View>
					) : (
						filteredDoses.map((item, index) => (
							<View key={index} style={[styles.doseItem, item.taken && styles.doseItemTaken, item.missed && styles.doseItemMissed]}>
								<View style={styles.doseItemHeader}>
									<View style={styles.doseInfo}>
										<Text style={styles.doseName}>{item.medName}</Text>
										{item.dosage && <Text style={styles.doseDosage}>{item.dosage}</Text>}
									</View>
									<View style={styles.doseTimeBadge}>
										<Icon name="clock-outline" size={13} color={C.darkGreen} />
										<Text style={styles.doseTimeText}>{format(item.scheduledTime, 'HH:mm')}</Text>
									</View>
								</View>
								<View style={styles.doseStatus}>
									{item.taken && (
										<View style={[styles.statusBadge, { backgroundColor: C.takenBg }]}>
											<Text style={[styles.statusText, { color: C.taken }]}>Прийнято</Text>
										</View>
									)}
									{item.missed && (
										<View style={[styles.statusBadge, { backgroundColor: C.missedBg }]}>
											<Text style={[styles.statusText, { color: C.missed }]}>Пропущено</Text>
										</View>
									)}
								</View>
							</View>
						))
					)}
				</View>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: C.creamLight },
	scrollContent: { paddingBottom: 40 },
	header: {
		backgroundColor: C.darkGreen,
		paddingTop: Platform.OS === 'ios' ? 60 : 46,
		paddingHorizontal: 20, paddingBottom: 20,
		borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
	},
	headerTitle: { fontSize: 26, fontWeight: '800', color: C.cream, letterSpacing: -0.5 },
	headerSub: { fontSize: 13, color: 'rgba(243,232,211,0.65)', marginTop: 3 },
	calendarWrapper: { marginTop: 12 },
	calendarCard: {
		backgroundColor: C.surface,
		marginHorizontal: 16,
		marginBottom: 12,
		borderRadius: 24,
		padding: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.12,
		shadowRadius: 12,
		elevation: 8,
	},
	monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
	navBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.creamLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
	monthTitle: { fontSize: 16, fontWeight: '700', color: C.text },
	weekDaysRow: { flexDirection: 'row', marginBottom: 8, paddingHorizontal: CELL_MARGIN },
	weekDayLabel: { width: DAY_SIZE, textAlign: 'center', fontSize: 11, fontWeight: '700', color: C.textSub, marginHorizontal: CELL_MARGIN },
	calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
	cellPlaceholder: { width: DAY_SIZE, height: DAY_SIZE, marginHorizontal: CELL_MARGIN, marginVertical: CELL_MARGIN },
	cell: { width: DAY_SIZE, height: DAY_SIZE, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginHorizontal: CELL_MARGIN, marginVertical: CELL_MARGIN },
	todayCell: { borderWidth: 2, borderColor: C.darkGreen },
	dayNum: { fontSize: 14, fontWeight: '600', color: C.text },
	dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
	partialText: { fontSize: 8, fontWeight: '600', color: C.textSub, marginTop: 2 },
	legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.borderLight },
	legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
	legendDot: { width: 8, height: 8, borderRadius: 4 },
	legendText: { fontSize: 11, color: C.textSub },
	dayDetailsCard: { marginHorizontal: 16, marginBottom: 8 },
	dayDetailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
	dayDetailsTitle: { fontSize: 20, fontWeight: '700', color: C.text },
	dayDetailsSubtitle: { fontSize: 13, color: C.textSub, marginTop: 2 },
	todayBadge: { backgroundColor: C.darkGreen + '15', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
	todayBadgeText: { fontSize: 12, fontWeight: '700', color: C.darkGreen },
	daySummary: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		backgroundColor: C.creamLight,
		borderRadius: 16,
		padding: 10,
		marginBottom: 16,
		gap: 10,
	},
	summaryItem: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 8,
		paddingHorizontal: 4,
		borderRadius: 12,
		backgroundColor: C.surface,
		minHeight: 40,
	},
	summaryItemActive: { backgroundColor: C.darkGreen + '15', borderWidth: 1, borderColor: C.darkGreen },
	summaryItemTaken: { backgroundColor: C.taken, borderWidth: 1, borderColor: C.taken },
	summaryItemMissed: { backgroundColor: C.missed, borderWidth: 1, borderColor: C.missed },
	summaryText: { fontSize: 12, fontWeight: '600', color: C.text },
	summaryTextActive: { color: C.darkGreen, fontWeight: '700' },
	summaryTextWhite: { color: C.white, fontWeight: '700' },
	emptyDoses: { backgroundColor: C.surface, borderRadius: 20, padding: 36, alignItems: 'center', gap: 10 },
	emptyDosesText: { fontSize: 14, color: C.textSub, textAlign: 'center' },
	doseItem: { backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.borderLight, shadowColor: C.darkGreen, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
	doseItemTaken: { borderColor: C.taken + '44', backgroundColor: C.takenBg + '60' },
	doseItemMissed: { borderColor: C.missed + '44', backgroundColor: C.missedBg + '60' },
	doseItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
	doseInfo: { flex: 1 },
	doseName: { fontSize: 16, fontWeight: '700', color: C.text },
	doseDosage: { fontSize: 12, color: C.textSub, marginTop: 2 },
	doseTimeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.softGreen + '20', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, gap: 4 },
	doseTimeText: { fontSize: 13, fontWeight: '700', color: C.darkGreen },
	doseStatus: { flexDirection: 'row' },
	statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 },
	statusText: { fontSize: 13, fontWeight: '700' },
});