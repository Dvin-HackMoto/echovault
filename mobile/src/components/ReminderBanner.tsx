// ReminderBanner component
//
// Shows the schedule reminder that is due now, with Okay and Later. All the rules
// (what is due, what Okay and Later do, sending offline) live in src/reminders.ts.
// Styled with the Kali kit (cream card with the bell, like the design's "Next up").

import { BellRing } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { ScheduleOccurrence, parseHubTime } from '../hub';
import { Reminders } from '../reminders';
import { Btn, Row, Txt } from '../ui/kit';
import { t } from '../ui/labels';
import { useLang } from '../ui/prefs';
import { kc } from '../ui/tokens';

const CHECK_MS = 30 * 1000;

const startTime = (occurrence: ScheduleOccurrence) =>
  parseHubTime(occurrence.occurrence_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

export function ReminderBanner({ reminders }: { reminders: Reminders }) {
  const L = useLang();
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
      <Row>
        <View style={styles.bell}>
          <BellRing size={24} color={kc.navy} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt size={12} weight="black" color={kc.amber} style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {t(L, 'Reminder', 'Paalala')} · {startTime(due)}
          </Txt>
          <Txt size={22} weight="black" color={kc.navy}>
            {due.title}
          </Txt>
        </View>
      </Row>
      <Row gap={10} style={{ marginTop: 14 }}>
        <Btn label={t(L, 'Okay', 'Sige')} variant="navy" onPress={() => respond('okay')} style={{ flex: 1 }} />
        <Btn label={t(L, 'Later', 'Mamaya')} variant="ghost" onPress={() => respond('later')} style={{ flex: 1 }} />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: kc.cream, borderColor: kc.sun, borderWidth: 2, borderRadius: 24, padding: 16, marginBottom: 14 },
  bell: { width: 52, height: 52, borderRadius: 16, backgroundColor: kc.sun, alignItems: 'center', justifyContent: 'center' },
});
