import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { AppTheme } from '../context/ThemeContext';

const DAY_LABELS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

function getWeekDates(offset = 0): Date[] {
  const today = new Date();
  const monday = new Date(today);
  const day = today.getDay();
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface Props {
  weekOffset: number;
  setWeekOffset: (fn: (prev: number) => number) => void;
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  theme: AppTheme;
}

export default function WeekDayPicker({ weekOffset, setWeekOffset, selectedDate, onSelectDate, theme }: Props) {
  const weekDates = getWeekDates(weekOffset);
  const todayISO = toISO(new Date());

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={styles.arrow} activeOpacity={0.6}>
          <ChevronLeft color={theme.textMuted} size={18} />
        </TouchableOpacity>

        {weekDates.map((d, i) => {
          const iso = toISO(d);
          const isSelected = iso === selectedDate;
          const isToday = iso === todayISO;

          return (
            <TouchableOpacity
              key={iso}
              style={[
                styles.dayCell,
                isSelected && [styles.dayCellSelected, { borderColor: theme.text }],
              ]}
              onPress={() => onSelectDate(iso)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.dayLabel,
                { color: isSelected ? theme.text : theme.textMuted },
                isToday && !isSelected && { color: theme.accent },
              ]}>
                {DAY_LABELS[i]}
              </Text>
              <Text style={[
                styles.dayNumber,
                { color: isSelected ? theme.text : theme.textMuted },
                isToday && !isSelected && { color: theme.accent },
              ]}>
                {d.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={styles.arrow} activeOpacity={0.6}>
          <ChevronRight color={theme.textMuted} size={18} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayCellSelected: {
    borderWidth: 2,
    borderRadius: 12,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dayNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
});
