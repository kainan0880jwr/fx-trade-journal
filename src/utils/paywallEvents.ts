/**
 * paywallEvents
 *
 * 収益化ファネルの自前計測。
 *
 * 背景（output/usage_analysis_strategy_20260829.md 参照）:
 * RevenueCatの商品・Entitlement・Offering、有料アプリ契約・銀行口座・納税フォームまで
 * すべて「有効」であることを確認済みで、技術的にも契約的にも購入できる状態にある。
 * それにもかかわらずActive Customers 95人に対しトライアル開始は0件だった。
 * このとき「ペイウォールに到達していないのか」「到達したが押されないのか」を
 * 切り分ける手段が存在せず、価格や訴求の議論がすべて推測になっていた。
 *
 * そこで retentionEvents と同じ方式（Sentryのみ、新規依存の追加なし）で
 * ペイウォール到達までのファネルを計測する。DSNがプレースホルダー/未設定の場合は
 * SDK内部で無視されるため、ローカル開発でもエラーにはならない。
 *
 * 集計方法（Sentry）:
 *   - イベント名で絞る:  message:"paywall:viewed"
 *   - 内訳を見る:        message:"paywall:viewed" paywall_source:"gate"
 *   詳細は低カーディナリティのタグとして持たせ、メッセージ文字列自体は固定にする。
 *   （メッセージに値を埋め込むとSentry側で別Issueに分裂し、合計が見えなくなるため）
 */

import * as Sentry from '@sentry/react-native';

/** ペイウォールへの流入元。低カーディナリティを保つため文字列リテラルで固定する */
export type PaywallSource = 'gate' | 'trade_form_hint' | 'unknown';

/** ペイウォールを開いた原因になった機能。PremiumGateのfeatureKeyと対応する安定キー */
export type PremiumFeatureKey =
  | 'badges' | 'calculator' | 'bookmarks' | 'yearly'
  | 'monthly_weekly' | 'monthly_insights'
  | 'analysis_time' | 'analysis_tags' | 'analysis_rr' | 'analysis_equity' | 'analysis_mental'
  | 'unknown';

function track(event: string, tags?: Record<string, string>) {
  try {
    Sentry.captureMessage(`paywall:${event}`, { level: 'info', tags });
  } catch {
    // 計装はノンクリティカル — エラーは握り潰す
  }
}

/**
 * 未知の値がタグに混入して集計を汚すのを防ぐ。
 * 翻訳文字列がそのまま渡ると言語ごとに別タグ値になってしまうため、
 * 呼び出し側は必ず安定キーを渡すこと（渡らなかった場合は 'unknown' に丸める）。
 */
const KNOWN_FEATURES: ReadonlySet<string> = new Set<PremiumFeatureKey>([
  'badges', 'calculator', 'bookmarks', 'yearly',
  'monthly_weekly', 'monthly_insights',
  'analysis_time', 'analysis_tags', 'analysis_rr', 'analysis_equity', 'analysis_mental',
  'unknown',
]);

export function normalizeFeatureKey(raw: string | undefined): PremiumFeatureKey {
  return raw && KNOWN_FEATURES.has(raw) ? (raw as PremiumFeatureKey) : 'unknown';
}

const KNOWN_SOURCES: ReadonlySet<string> = new Set<PaywallSource>([
  'gate', 'trade_form_hint', 'unknown',
]);

export function normalizeSource(raw: string | undefined): PaywallSource {
  return raw && KNOWN_SOURCES.has(raw) ? (raw as PaywallSource) : 'unknown';
}

/**
 * プレミアム機能のロック画面が実際に表示されたときに1度だけ呼ぶ。
 *
 * PremiumGateはタブ切り替えのたびに再レンダリングされるため、素直に呼ぶと
 * 同一機能で大量のイベントが飛ぶ。「どの機能でロックに当たったユーザーが何人いるか」
 * を知りたいので、機能ごとにアプリ起動中1回だけ送る。
 */
const gateShownThisSession = new Set<PremiumFeatureKey>();

export function recordPremiumGateShown(featureKey: string | undefined): void {
  const key = normalizeFeatureKey(featureKey);
  if (gateShownThisSession.has(key)) return;
  gateShownThisSession.add(key);
  track('gate_shown', { paywall_feature: key });
}

/** ペイウォール画面が開かれたときに呼ぶ */
export function recordPaywallViewed(source: string | undefined, featureKey: string | undefined): void {
  track('viewed', {
    paywall_source: normalizeSource(source),
    paywall_feature: normalizeFeatureKey(featureKey),
  });
}

/**
 * ペイウォールを開いたのに購入パッケージが1件も取得できなかったときに呼ぶ。
 *
 * getOfferings()が空を返す事象（Offering未設定・ストア側の商品未承認・
 * ネットワークタイムアウト）は、ユーザーには「買うボタンが出ない」としてしか
 * 見えず、これまで一切観測できていなかった。トライアル0件の原因候補として
 * 明示的に潰せるようにする。
 */
export function recordPaywallNoPackages(source: string | undefined): void {
  track('no_packages', { paywall_source: normalizeSource(source) });
}

/** 購入ボタンが押されたときに呼ぶ。planは 'annual' | 'monthly' | 'other' */
export function recordPurchaseTapped(plan: string, hasTrial: boolean): void {
  track('purchase_tapped', { paywall_plan: plan, paywall_has_trial: hasTrial ? '1' : '0' });
}

/**
 * 購入処理の結果を呼ぶ。resultはpurchaseStoreの戻り値
 * （'success' | 'cancelled' | 'pending' | 'no_entitlement' | 'error'）。
 * トライアル付きのsuccessは trial_started としても別途送り、
 * RevenueCatのActive Trialsと突き合わせられるようにする。
 */
export function recordPurchaseResult(result: string, plan: string, hasTrial: boolean): void {
  track('purchase_result', { paywall_result: result, paywall_plan: plan });
  if (result === 'success') {
    track(hasTrial ? 'trial_started' : 'purchase_completed', { paywall_plan: plan });
  }
}

/** ペイウォールを購入せずに閉じたときに呼ぶ */
export function recordPaywallDismissed(source: string | undefined, sawPackages: boolean): void {
  track('dismissed', {
    paywall_source: normalizeSource(source),
    paywall_saw_packages: sawPackages ? '1' : '0',
  });
}

/** テスト用。セッション内の重複抑止状態をリセットする */
export function __resetPaywallEventsForTest(): void {
  gateShownThisSession.clear();
}
