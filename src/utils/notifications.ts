import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getRecordStreak, getSetting } from '../db/queries';

const ID_DAILY   = 'daily-reminder';
const ID_WEEKLY  = 'weekly-summary';
const ANDROID_CHANNEL_ID = 'reminders';

// フォアグラウンド時にも通知バナーを表示する（未設定だとアプリ起動中は通知が出ない）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'リマインダー',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

export function isNotificationsAvailable(): boolean {
  return true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await ensureAndroidChannel();
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

/** 毎日の記録リマインダー（既存） */
export async function scheduleReminder(hour: number, minute: number): Promise<boolean> {
  try {
    const streak = await getRecordStreak();
    const body = streak >= 2
      ? `${streak}日連続記録中！今日のトレードを記録しましょう`
      : '今日のトレードを記録しましょう！';

    await Notifications.cancelScheduledNotificationAsync(ID_DAILY).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: ID_DAILY,
      content: { title: 'FXトレード日記', body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        channelId: ANDROID_CHANNEL_ID,
        hour,
        minute,
      },
    });
    return true;
  } catch { return false; }
}

/**
 * 毎週月曜の週次サマリー通知
 * @param hour   通知時刻（時）
 * @param minute 通知時刻（分）
 * @param enable trueで有効化 / falseでキャンセル
 */
export async function scheduleWeeklySummary(
  hour: number,
  minute: number,
  enable: boolean,
): Promise<boolean> {
  try {
    await Notifications.cancelScheduledNotificationAsync(ID_WEEKLY).catch(() => {});
    if (!enable) return true;

    await Notifications.scheduleNotificationAsync({
      identifier: ID_WEEKLY,
      content: {
        title: '📊 先週の成績を振り返ろう',
        body: '月次タブで勝率・pipsをチェック！今週も頑張りましょう 🔥',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        channelId: ANDROID_CHANNEL_ID,
        weekday: 2,   // 月曜日（1=日, 2=月, ..., 7=土）
        hour,
        minute,
      },
    });
    return true;
  } catch { return false; }
}

export async function cancelAllReminders(): Promise<void> {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
}

/**
 * DB上の設定（ON/OFF・時刻）とOS側の実際のスケジュールがずれることがあるため
 * （TestFlightでのビルド更新やOS再起動等でOS側の予約だけ消えることがある）、
 * アプリ起動時に設定に基づいて再スケジュールし、実際に有効な状態へ復元する。
 * 通知権限の再要求は行わない（権限が無ければscheduleNotificationAsync側で黙って失敗する）。
 */
export async function syncScheduledNotifications(): Promise<void> {
  try {
    const [notifEnabled, notifHour, notifMinute, weeklyEnabled, weeklyHour, weeklyMinute] =
      await Promise.all([
        getSetting('notif_enabled'), getSetting('notif_hour'), getSetting('notif_minute'),
        getSetting('weekly_notif_enabled'), getSetting('weekly_notif_hour'), getSetting('weekly_notif_minute'),
      ]);

    if (notifEnabled === '1') {
      await scheduleReminder(
        notifHour ? parseInt(notifHour, 10) : 21,
        notifMinute ? parseInt(notifMinute, 10) : 0,
      );
    }
    if (weeklyEnabled === '1') {
      await scheduleWeeklySummary(
        weeklyHour ? parseInt(weeklyHour, 10) : 8,
        weeklyMinute ? parseInt(weeklyMinute, 10) : 0,
        true,
      );
    }
  } catch {}
}
