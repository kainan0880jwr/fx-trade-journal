import * as Notifications from 'expo-notifications';
import { getRecordStreak } from '../db/queries';

const ID_DAILY   = 'daily-reminder';
const ID_WEEKLY  = 'weekly-summary';

export function isNotificationsAvailable(): boolean {
  return true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
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
