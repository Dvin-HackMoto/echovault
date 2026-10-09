// StaleNotice component
//
// One line for screens showing cached data: tells the patient it may not be current.

import { StyleSheet, Text } from 'react-native';

import { Cached } from '../cache';

// TODO(MOB-3): take sizes and colors from theme.ts once it exists.
const styles = StyleSheet.create({
  notice: { color: '#1A1A1A', backgroundColor: '#FFF4CC', fontSize: 20, padding: 12, borderRadius: 10 },
});

const savedAt = (cachedAt: string) =>
  new Date(cachedAt).toLocaleString('en-US', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

/** Renders nothing for fresh data, so screens can always include it. */
export function StaleNotice({ from }: { from: Pick<Cached<unknown>, 'stale' | 'cachedAt'> | null }) {
  if (!from?.stale) return null;
  return <Text style={styles.notice}>This may not be up to date. Last updated {savedAt(from.cachedAt)}.</Text>;
}
