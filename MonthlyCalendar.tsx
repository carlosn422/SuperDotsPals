
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MOOD_TINTS } from './LittleSignalsData';

const ink = '#251C45', muted = '#807694', purple = '#6953CA';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function MonthlyCalendar({ date, onDateChange, moods }: { date: Date, onDateChange: (d: Date) => void, moods: { [key: string]: string } }) {
  const month = date.getMonth();
  const year = date.getFullYear();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const daysInMonth = lastDay.getDate();
  const startDay = firstDay.getDay();

  const weeks: Date[][] = [];
  let week: Date[] = [];

  for (let i = 0; i < startDay; i++) {
    week.push(new Date(0));
  }

  for (let i = 1; i <= daysInMonth; i++) {
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    week.push(new Date(year, month, i));
  }
  weeks.push(week);

  const changeMonth = (d: number) => {
    onDateChange(new Date(year, month + d, 1));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => changeMonth(-1)}><Ionicons name="chevron-back" size={24} color={ink} /></TouchableOpacity>
        <Text style={styles.headerText}>{date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}><Ionicons name="chevron-forward" size={24} color={ink} /></TouchableOpacity>
      </View>
      <View style={styles.grid}>
        <View style={styles.week}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
          <View key={day} style={styles.dayHeader}><Text style={styles.dayHeaderText}>{day}</Text></View>
        ))}
        </View>
        {weeks.map((week, i) => (
          <View key={i} style={styles.week}>
            {week.map((day, j) => {
              if (day.getTime() === 0) {
                return <View key={j} style={styles.day} />;
              }
              const dayString = day.toISOString().split('T')[0];
              const mood = moods[dayString];
              const isSelected = startOfDay(day).getTime() === startOfDay(date).getTime();

              return (
                <TouchableOpacity key={j} style={styles.day} onPress={() => onDateChange(day)}>
                  <View style={[styles.dayContent, isSelected && styles.selectedDay]}>
                    <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>{day.getDate()}</Text>
                  </View>
                  {mood && <View style={[styles.dot, { backgroundColor: (MOOD_TINTS as any)[mood]?.color || '#ccc' }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F7F5FB',
    borderRadius: 16,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '800',
    color: ink,
  },
  grid: {},
  week: {
    flexDirection: 'row',
  },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dayContent: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDay: {
    backgroundColor: purple,
  },
  dayText: {
    fontSize: 16,
    color: ink,
  },
  selectedDayText: {
    color: 'white',
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dayHeaderText: {
    fontSize: 10,
    color: muted,
    fontWeight: '700',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
});
