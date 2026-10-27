import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YourDay from './YourDay';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from './supabase';
import MoodMascot from './MoodMascot';

import { TimelineMood, TimelineReaction } from './FamilyTimeline';

const ink = '#251C45', muted = '#807694', purple = '#6953CA';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

import { useMoodCalendar } from './useMoodCalendar';

export default function MiniMoodCalendar() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { moods, days } = useMoodCalendar();

  const getMoodForDay = (day: Date) => {
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const moodForDay = moods.find((mood: TimelineMood) => {
      const moodDate = new Date(mood.occurred_at);
      return moodDate >= dayStart && moodDate < dayEnd;
    });

    return moodForDay;
  };

  return (
    <>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Your day: mood changes and reactions" onPress={() => setOpen(true)} style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="calendar-outline" size={21} color={purple} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your day</Text>
            <Text style={styles.subtitle}>Mood changes and reactions</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: purple, fontWeight: '600' }}>View all</Text>
            <Ionicons name="chevron-forward" size={18} color={purple} />
          </View>
        </View>
        <View style={styles.calendarContainer}>
          {days.map((day: Date, index: number) => {
            const mood = getMoodForDay(day);
            const isToday = startOfDay(day).getTime() === startOfDay(new Date()).getTime();

            return (
              <TouchableOpacity key={index} style={[styles.dayContainer, isToday && styles.todayContainer]} onPress={() => {
                setSelectedDate(day);
                setOpen(true);
              }}>
                <Text style={[styles.dayText, isToday && styles.todayText]}>{day.toLocaleDateString(undefined, { month: 'short' })}</Text>
                <Text style={[styles.dayNumber, isToday && styles.todayText]}>{day.getDate()}</Text>
                {mood ? (
                  <MoodMascot mood={mood.mood as any} size={30} />
                ) : (
                  <View style={styles.emptyMood} />
                )}
                
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>{open ? <YourDay top={insets.top} bottom={insets.bottom} onClose={() => setOpen(false)} date={selectedDate} /> : null}</Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F7F5FB',
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontWeight: '800',
    color: ink,
    fontSize: 14,
  },
  subtitle: {
    color: muted,
    fontSize: 11,
  },
  calendarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  dayContainer: {
    alignItems: 'center',
    gap: 4,
    padding: 8,
    borderRadius: 12,
  },
  todayContainer: {
    backgroundColor: purple,
  },
  dayText: {
    fontSize: 10,
    color: muted,
    fontWeight: '700',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: ink,
  },
  todayText: {
    color: 'white',
  },
  emptyMood: {
    width: 30,
    height: 30,
  },
  todayLabel: {
    fontSize: 10,
    color: 'white',
    fontWeight: '700',
    position: 'absolute',
    bottom: 4,
  },
});
