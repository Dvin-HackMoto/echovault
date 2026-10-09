// wires reminders, cache and queue to the real phone (Expo)
//
// Type-checked against the Expo SDK 57 packages; not yet tried on a device. The logic
// it wires up is tested in src/__tests__/.
//
// The app-wide instance lives in src/offline.ts (hub address from api/client.ts), and
// app/(patient)/_layout.tsx calls prepareNotifications() and offline.reminders.start().
//
// Expo Go on Android (SDK 53+) throws as soon as expo-notifications is loaded, so it is
// loaded only where it works (a development build, or iOS). Without it, reminders still
// show in the in-app ReminderBanner; only the system notifications are missing.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
// Since Expo SDK 54 these functions live in 'expo-file-system/legacy'.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { createCache } from './cache';
import { FileStore, Notifier } from './hub';
import { createHubClient } from './hubClient';
import { createQueue } from './queue';
import { createReminders } from './reminders';

const CHANNEL = 'reminders';

type NotificationsModule = typeof import('expo-notifications');
let notificationsModule: NotificationsModule | null | undefined;

/** expo-notifications, or null where it cannot run (Expo Go on Android). */
function notifications(): NotificationsModule | null {
  if (notificationsModule === undefined) {
    notificationsModule =
      Platform.OS === 'android' && isRunningInExpoGo()
        ? null
        : // eslint-disable-next-line @typescript-eslint/no-require-imports
          (require('expo-notifications') as NotificationsModule);
  }
  return notificationsModule;
}
const PHOTO_DIR = `${FileSystem.documentDirectory}people-photos/`;

/** Ask for permission and set up the Android channel. Call once before `reminders.start()`. */
export async function prepareNotifications(): Promise<boolean> {
  const Notifications = notifications();
  if (!Notifications) return false;
  // Show the system notification even while the app is open.
  Notifications.setNotificationHandler({
    // SDK 53+ splits the old shouldShowAlert into shouldShowBanner / shouldShowList.
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

const notifier: Notifier = {
  async schedule(n) {
    const Notifications = notifications();
    if (!Notifications) return;
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: n.data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL },
    });
  },
  async cancel(id) {
    await notifications()?.cancelScheduledNotificationAsync(id);
  },
  async scheduledIds() {
    const Notifications = notifications();
    if (!Notifications) return [];
    return (await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier);
  },
};

const files: FileStore = {
  async list() {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
    return FileSystem.readDirectoryAsync(PHOTO_DIR);
  },
  async download(url, name) {
    const { status } = await FileSystem.downloadAsync(url, PHOTO_DIR + name);
    if (status !== 200) {
      await FileSystem.deleteAsync(PHOTO_DIR + name, { idempotent: true });
      throw new Error(`Photo download failed (${status})`);
    }
  },
  remove: (name) => FileSystem.deleteAsync(PHOTO_DIR + name, { idempotent: true }),
  uri: (name) => PHOTO_DIR + name,
};

/** `hubAddress` returns the saved hub address, e.g. 'http://192.168.1.10:8000', or null before setup. */
export function createOffline(hubAddress: () => string | null | Promise<string | null>) {
  const hub = createHubClient({ baseUrl: hubAddress });
  const queue = createQueue({ hub, store: AsyncStorage });
  const cache = createCache({ hub, store: AsyncStorage, files, onReachable: () => void queue.flush() });
  const reminders = createReminders({ cache, queue, notifier, store: AsyncStorage });
  return { hub, cache, queue, reminders };
}
