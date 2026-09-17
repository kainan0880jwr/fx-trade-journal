import * as Sentry from '@sentry/react-native';
import { create } from 'zustand';
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  type PurchasesOfferings,
  type PurchasesError,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';

const RC_API_KEY = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_RC_IOS_KEY ?? ''
  : process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '';

// RevenueCatダッシュボード（Entitlements）に実際に設定されている識別子と完全一致させること。
// REST API Identifier（entlxxxx…）ではなく、Identifier欄の文字列を使う。
// 過去に'premium'という前提でハードコードされていたが、実際の設定は'FXトレード日記 Pro'で
// 一致しておらず、購入が成功してもhasPremium()が常にfalseを返す状態になっていた
// （2026-08-21、RevenueCatダッシュボードを直接確認して発覚・修正）。
//
// 日本語の表示名一致に依存する単一障害点だったため、ASCIIの新ID 'premium' を
// RevenueCatダッシュボード側にも併設し、新旧どちらのIDでも有効判定できるようにする。
// 'premium'をダッシュボードに追加し、既存ユーザーの復元でも正しく検知できることを
// 確認できたら、ENTITLEMENT_IDS からレガシー表示名を削除してよい。
export const ENTITLEMENT_ID = 'premium';
const LEGACY_ENTITLEMENT_ID = 'FXトレード日記 Pro';
export const ENTITLEMENT_IDS = [ENTITLEMENT_ID, LEGACY_ENTITLEMENT_ID];

// プレースホルダー（appl_xxxx.../goog_xxxx...）を含む未設定キーを弾く
const isPlaceholderKey = (key: string) => !key || /xxxx/i.test(key);

// 'success'      = 購入成功・プレミアム有効化まで完了
// 'pending'      = 承認待ち（Ask to Buy等）。エンタイトルメントは未確定
// 'no_entitlement' = 決済自体は成功したがエンタイトルメントが付与されていない（RevenueCat設定不備等）
// 'cancelled'    = ユーザーによるキャンセル
// 'error'        = 通信・SDKエラー
export type PurchaseResult = 'success' | 'pending' | 'no_entitlement' | 'cancelled' | 'error';
// 'success'        = 復元成功（プレミアム有効）
// 'no_entitlement' = 復元処理は成功したが有効なエンタイトルメントがない（未購入・期限切れ等）
// 'error'          = 通信・SDKエラー
export type RestoreResult = 'success' | 'no_entitlement' | 'error';

interface PurchaseStore {
  isPremium: boolean;
  isInitialized: boolean;
  // configure()が成功したかどうか。falseのままgetOfferings等を呼んでも常に失敗するため、
  // 呼び出し側でリトライ導線を出し分けるために公開する
  isConfigured: boolean;

  initialize: () => void;
  checkPremium: () => Promise<void>;
  getOfferings: () => Promise<PurchasesOfferings | null>;
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseResult>;
  restore: () => Promise<RestoreResult>;
}

function hasPremium(info: CustomerInfo): boolean {
  return ENTITLEMENT_IDS.some((id) => !!info.entitlements.active[id]);
}

/**
 * 直近の購入・復元の失敗コード。ペイウォール側が計測タグに載せるために読む。
 * 値は RevenueCat の PURCHASES_ERROR_CODE（有限の enum）なのでタグに安全。
 */
let lastPurchaseErrorCode: string | null = null;
export function getLastPurchaseErrorCode(): string | null {
  return lastPurchaseErrorCode;
}

/**
 * 「決済は通ったのに PRO にならない」を観測できるようにする。
 *
 * この状態は**お金を払ったのに使えない**という最悪の体験で、しかも 2026-09-17 まで
 * Sentry に一切残っていなかった。原因の切り分けに要るのは「どの entitlement が
 * active だったか」— 空なら本当に購入履歴が無く、何か入っていれば
 * `ENTITLEMENT_IDS` との不一致（ダッシュボードでの改名など）を疑える。
 *
 * **entitlement の ID は個人情報ではなく低カーディナリティ**なのでタグに載せてよい。
 * 購入者の識別子やレシートは載せない。
 */
function reportNoEntitlement(source: 'purchase' | 'restore', info: CustomerInfo): void {
  try {
    const active = Object.keys(info.entitlements.active);
    Sentry.captureMessage('purchase:no_entitlement', {
      level: 'error',
      tags: {
        area: 'purchase',
        purchase_source: source,
        active_entitlements: active.length === 0 ? 'none' : active.join(','),
      },
    });
  } catch { /* 計装の失敗は無視 */ }
}

// StrictModeの二重マウントやuseEffectの多重発火でも configure/リスナー登録が
// 一度しか実行されないようにするモジュールレベルのガード。
// configure()自体が失敗した場合は再試行できるようfalseに戻す。
let hasStartedInit = false;

export const usePurchaseStore = create<PurchaseStore>((set, get) => ({
  isPremium: false,
  isInitialized: false,
  isConfigured: false,

  initialize: () => {
    if (hasStartedInit) return;
    hasStartedInit = true;

    if (isPlaceholderKey(RC_API_KEY)) {
      // 開発中はキー未設定のため初期化をスキップ。
      //
      // **ただし本番でここに来たら重大事故。** RevenueCat が初期化されないので
      // 課金済みユーザー全員が無料扱いになり、「購入を復元」も効かない。
      // 起こりうるのは `eas update`（OTA）— ビルドと違い `check-prod-keys.js` が
      // 走らないため、手元の .env がプレースホルダーのままでも production
      // チャンネルへ配信できてしまう（`scripts/check-ota-bundle.js` で塞いでいるが、
      // 実行を忘れうるので最後の砦をここに置く）。
      if (!__DEV__) {
        try {
          Sentry.captureMessage('purchase:rc_key_missing', { level: 'fatal' });
        } catch { /* 計装の失敗は無視 */ }
      }
      set({ isInitialized: true });
      return;
    }

    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      Purchases.configure({
        apiKey: RC_API_KEY,
        // **Trusted Entitlements（応答の署名検証）。** 既定は DISABLED で、その場合
        // RevenueCat の応答は TLS で守られるだけ。端末に自分で CA を入れてプロキシを
        // 噛ませれば（脱獄不要・一般的な手口）`entitlements.active` を偽造でき、
        // SDK がそれをキャッシュして以後オフラインでも PRO として動く。
        // 影響は収益のみ（PRO機能は全て端末内の計算で、他人のデータには触れない）だが、
        // **無料で塞げる穴を開けたままにする理由が無い。**
        //
        // まず INFORMATIONAL（検証するが失敗しても通す）で入れて、
        // `customerInfo.entitlements.verification` の分布を観測する。
        // いきなり ENFORCED にすると、検証失敗時に SDK がエラーを返し、
        // purchase/restore が 'error' に落ちて**正規の購入者を締め出しうる**。
        // 分布を見てから上げること。**ダッシュボード側の有効化も別途必要。**
        entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
      });
    } catch (e) {
      // configure失敗は完全に無記録だった。これが起きると getOfferings/purchase/restore が
      // すべて機能せず、課金済みユーザーは「復元」を押しても復旧できないまま
      // 無料ユーザーとして扱われる。収益と評価に直結するため必ず観測する。
      try {
        Sentry.captureException(e, { tags: { area: 'purchase', kind: 'configure_failed' } });
      } catch { /* 計装の失敗は無視 */ }
      hasStartedInit = false; // 一時的なエラーの可能性があるため再初期化できるようにする
      set({ isInitialized: true });
      return;
    }

    set({ isConfigured: true });

    // 起動をブロックしないよう非同期で購入状態を取得
    Purchases.getCustomerInfo()
      .then((info) => set({ isPremium: hasPremium(info), isInitialized: true }))
      .catch((e) => {
        // 起動時オフライン等でここが失敗すると isPremium は false のままになり、
        // 課金済みユーザーが全機能をロックされる。原因が追えるよう記録する。
        try {
          Sentry.captureException(e, { tags: { area: 'purchase', kind: 'customer_info_failed' } });
        } catch { /* 計装の失敗は無視 */ }
        set({ isInitialized: true });
      });

    // 購入状態変更リスナー（他デバイスでの購入・復元を反映）
    Purchases.addCustomerInfoUpdateListener((info) => {
      set({ isPremium: hasPremium(info) });
      // 署名検証の結果を観測する。VERIFIED / FAILED / NOT_REQUESTED の3値で
      // 低カーディナリティ。FAILED が実際に出るかを見てから ENFORCED を検討する。
      try {
        const v = (info as unknown as { entitlements?: { verification?: string } })?.entitlements?.verification;
        if (v) Sentry.setTag('rc_verification', String(v));
      } catch { /* 計装の失敗は無視 */ }
    });
  },

  checkPremium: async () => {
    if (!get().isConfigured) return;
    try {
      const info = await Purchases.getCustomerInfo();
      set({ isPremium: hasPremium(info) });
    } catch {
      // 失敗時は現状維持
    }
  },

  getOfferings: async () => {
    if (!get().isConfigured) return null;
    try {
      return await Purchases.getOfferings();
    } catch {
      return null;
    }
  },

  purchase: async (pkg: PurchasesPackage) => {
    if (!get().isConfigured) return 'error';
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const premium = hasPremium(customerInfo);
      set({ isPremium: premium });
      if (!premium) reportNoEntitlement('purchase', customerInfo);
      return premium ? 'success' : 'no_entitlement';
    } catch (e) {
      const err = e as PurchasesError;
      if (err?.userCancelled === true) return 'cancelled';
      if (err?.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
      // **`error` に潰すと原因が永久に分からない。** RevenueCat のエラーコードは
      // 有限の enum（低カーディナリティ）なのでタグに載せて安全。原因ごとに
      // 打ち手が全く違う — 例えば PURCHASE_NOT_ALLOWED_ERROR はスクリーンタイムで
      // アプリ内課金が禁止されている状態で、何度試しても成功しない。
      lastPurchaseErrorCode = String(err?.code ?? 'unknown');
      try {
        Sentry.captureException(e, { tags: { area: 'purchase', kind: 'purchase_failed', purchase_error_code: lastPurchaseErrorCode } });
      } catch { /* 計装の失敗は無視 */ }
      return 'error';
    }
  },

  restore: async () => {
    if (!get().isConfigured) return 'error';
    try {
      const info = await Purchases.restorePurchases();
      const premium = hasPremium(info);
      set({ isPremium: premium });
      if (!premium) {
        // 「決済は通っているのに PRO にならない」は最悪の体験で、CLAUDE.md も
        // 収益と評価に直結すると書いている。どの entitlement が active だったかを
        // 残す — 空なら本当に購入履歴が無い、何か入っていれば ID の不一致を疑える。
        reportNoEntitlement('restore', info);
      }
      return premium ? 'success' : 'no_entitlement';
    } catch (e) {
      const err = e as PurchasesError;
      lastPurchaseErrorCode = String(err?.code ?? 'unknown');
      try {
        Sentry.captureException(e, { tags: { area: 'purchase', kind: 'restore_failed', purchase_error_code: lastPurchaseErrorCode } });
      } catch { /* 計装の失敗は無視 */ }
      return 'error';
    }
  },
}));
