// ReminderBanner component
//
// Shows the schedule reminder that is due now, with Okay and Later. All the rules
// (what is due, what Okay and Later do, sending offline) live in src/reminders.ts.

import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScheduleOccurrence, parseHubTime } from '../hub';
import { Reminders } from '../reminders';

const CHECK_MS = 30 * 1000;

// TODO(MOB-3, MOB-5): take sizes and colors from theme.ts and use BigButton once they exist.
const styles = StyleSheet.create({
  banner: { backgroundColor: '#FFF4CC', borderColor: '#1A1A1A', borderWidth: 2, borderRadius: 16, padding: 20 },
  title: { color: '#1A1A1A', fontSize: 28, fontWeight: '700' },
  time: { color: '#1A1A1A', fontSize: 24, marginTop: 4 },
  buttons: { flexDirection: 'row', gap: 16, marginTop: 20 },
  button: { flex: 1, minHeight: 72, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  okay: { backgroundColor: '#1A1A1A' },
  later: { backgroundColor: '#FFFFFF', borderColor: '#1A1A1A', borderWidth: 2 },
  okayLabel: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  laterLabel: { color: '#1A1A1A', fontSize: 26, fontWeight: '700' },
});

const startTime = (occurrence: ScheduleOccurrence) =>
  parseHubTime(occurrence.occurrence_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

export function ReminderBanner({ reminders }: { reminders: Reminders }) {
  const [due, setDue] = useState<ScheduleOccurrence | null>(null);

  const check = useCallback(async () => {
    const { reminders: list } = await reminders.due();
    setDue(list[0] ?? null);
  }, [reminders]);

  // Re-check on a timer and whenever the app comes to the front, e.g. after tapping a notification.
  useEffect(() => {
    void check();
    const timer = setInterval(check, CHECK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [check]);

  if (!due) return null;

  const respond = async (action: 'okay' | 'later') => {
    await reminders[action](due);
    await check();
  };

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.title}>{due.title}</Text>
      <Text style={styles.time}>Starts at {startTime(due)}</Text>
      <View style={styles.buttons}>
        <Pressable style={[styles.button, styles.okay]} accessibilityRole="button" onPress={() => respond('okay')}>
          <Text style={styles.okayLabel}>Okay</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.later]} accessibilityRole="button" onPress={() => respond('later')}>
          <Text style={styles.laterLabel}>Later</Text>
        </Pressable>
      </View>
    </View>
  );
}
