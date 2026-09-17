/**
 * retentionEvents
 *
 * App Store ConnectのApple標準アナリティクスは母数（月50〜60DL）がAppleの匿名化閾値に
 * 達しないため、リテンション/コホートデータが「十分なデータがありません」表示のまま
 * になりやすい（output/release_monitoring_20260815.md参照）。閾値到達を待つのではなく、
 * 主要な定着イベントをSentry（既存導入済みSDK、新規依存の追加なし）へ軽量なカスタム
 * イベントとして送信し、Sentry側のイベント検索で自前集計できるようにする。
 * SentryのDSNがプレースホルダー/未設定の場合はSDK内部で無視され、エラーにはならない。
 *
 * 使い方:
 *   - app/_layout.tsx の初期化フローで recordAppOpen() を毎回呼ぶ
 *   - onboarding.tsx の completeOnboarding() で recordOnboardingCompleted() を呼ぶ
 *   - trade/new.tsx の保存成功後に recordFirstTradeSaved() を呼ぶ（内部で初回のみ判定）
 */

import * as Sentry from '@sentry/react-native';
import { getSetting, setSetting } from '../db/queries';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function track(event: string, tags?: Record<string, string>) {
  try {
    Sentry.captureMessage(`retention:${event}`, { level: 'info', tags });
  } catch {
    // 計装はノンクリティカル — エラーは握り潰す
  }
}

/**
 * オンボーディング完了時に呼ぶ。
 *
 * **スキップも「完了」として送る。** 2026-09-17 まで3択を選んだ経路でしか
 * 呼んでおらず、スキップした人が離脱扱いになって分母が狂っていた。
 * どちらだったかは `retention_via` タグで区別する。
 */
export function recordOnboardingCompleted(via: 'choice' | 'skip' = 'choice'): void {
  track('onboarding_completed', { retention_via: via });
}

/**
 * トレード保存成功のたびに呼ぶ。実際に送信されるのは初回のみ（内部で判定）。
 *
 * **CSVインポートからも呼ぶこと。** 2026-09-17 まで手入力フォームからしか
 * 呼んでおらず、**MT4/MT5のCSVを一括で取り込む層がファネルに1人も入っていなかった。**
 * このアプリで最もアクティブな層がまるごと計測外だった（CLAUDE.md 参照）。
 */
export async function recordFirstTradeSaved(via: 'form' | 'import' = 'form'): Promise<void> {
  try {
    const sent = await getSetting('retention_first_trade_sent');
    if (sent === '1') return;
    await setSetting('retention_first_trade_sent', '1');
    track('first_trade_saved', { retention_via: via });
  } catch {
    // 計装はノンクリティカル — エラーは握り潰す
  }
}

/**
 * アプリ起動のたびに呼ぶ。初回起動日時を記録し、D1（翌日以降の再起動）・
 * D7（7日後以降の再起動）を1度ずつだけイベント送信する。
 */
export async function recordAppOpen(): Promise<void> {
  try {
    const firstOpenRaw = await getSetting('retention_first_open_at');
    const now = Date.now();

    if (!firstOpenRaw) {
      await setSetting('retention_first_open_at', String(now));
      track('first_open');
      return;
    }

    const firstOpen = Number(firstOpenRaw);
    if (!Number.isFinite(firstOpen)) return;
    const daysSince = Math.floor((now - firstOpen) / ONE_DAY_MS);

    if (daysSince >= 1) {
      const d1Sent = await getSetting('retention_d1_sent');
      if (d1Sent !== '1') {
        await setSetting('retention_d1_sent', '1');
        track('d1_return');
      }
    }
    if (daysSince >= 7) {
      const d7Sent = await getSetting('retention_d7_sent');
      if (d7Sent !== '1') {
        await setSetting('retention_d7_sent', '1');
        track('d7_return');
      }
    }
  } catch {
    // 計装はノンクリティカル — エラーは握り潰す
  }
}
