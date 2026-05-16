import React from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { LineChart, ProgressChart } from 'react-native-chart-kit';
import { DailyAdherence } from '../services/adherenceCalculator';
import { format } from 'date-fns';

const screenWidth = Dimensions.get('window').width - 32;

interface AdherenceChartProps {
  weeklyData: DailyAdherence[];
  todayPercentage: number;
}

export default function AdherenceChart({ weeklyData, todayPercentage }: AdherenceChartProps) {
  const chartData = {
    labels: weeklyData.map(d => format(d.date, 'MM/dd')),
    datasets: [{
      data: weeklyData.map(d => d.percentage / 100),
    }],
  };
  
  const progressData = {
    data: [todayPercentage / 100],
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.todayCard}>
        <Text variant="titleMedium">Today's Adherence</Text>
        <View style={styles.progressWrapper}>
          <ProgressChart
            data={progressData}
            width={200}
            height={100}
            strokeWidth={16}
            radius={32}
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
              style: { borderRadius: 16 },
            }}
            hideLegend={true}
          />
          <Text variant="displaySmall" style={styles.percentageText}>
            {Math.round(todayPercentage)}%
          </Text>
        </View>
      </View>
      
      <View style={styles.weeklyCard}>
        <Text variant="titleMedium" style={styles.weeklyTitle}>Last 7 Days</Text>
        <LineChart
          data={chartData}
          width={screenWidth}
          height={220}
          chartConfig={{
            backgroundColor: '#ffffff',
            backgroundGradientFrom: '#ffffff',
            backgroundGradientTo: '#ffffff',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            style: { borderRadius: 16 },
            propsForDots: {
              r: '6',
              strokeWidth: '2',
              stroke: '#2196f3',
            },
          }}
          bezier
          style={styles.chart}
          formatYLabel={(value) => `${Math.round(parseFloat(value) * 100)}%`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  todayCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  progressWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  percentageText: {
    position: 'absolute',
    fontSize: 28,
    fontWeight: 'bold',
  },
  weeklyCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 16,
  },
  weeklyTitle: {
    marginBottom: 12,
  },
  chart: {
    marginLeft: -16,
    borderRadius: 16,
  },
});