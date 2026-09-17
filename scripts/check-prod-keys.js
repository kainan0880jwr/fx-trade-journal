#!/usr/bin/env node
// 本番(production)ビルドでRevenueCat/SentryのAPIキーがプレースホルダーのまま
// 出荷されるのを防ぐガード。EAS Buildの eas-build-pre-install フックから実行される。
// 過去のセキュリティレビュー(output/review/セキュリティレビュー_FXトレードログ_20260704.md)で
// 「ビルドにプレースホルダーのみ存在、実キー混入なし」の実績が確認されているため追加。
// purchaseStore.ts / app/_layout.tsx の isPlaceholderKey/isPlaceholderDsn と同じ判定(/xxxx/i)。
//
// **このスクリプトは eas update（OTA）では走らない。** フックが
// eas-build-pre-install だけなので、ビルドを伴わない配信経路は素通りする。
// OTA 側は scripts/check-ota-bundle.js が成果物を直接検査して塞いでいる。

const isPlaceholder = (v) => !v || /xxxx/i.test(v);

const KEYS = [
  'EXPO_PUBLIC_RC_IOS_KEY',
  'EXPO_PUBLIC_RC_ANDROID_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
];

const profile = process.env.EAS_BUILD_PROFILE;

// スクリーンショット撮影モード(src/utils/screenshotMode.ts)が有効なまま出荷されるのを防ぐ。
// 実装側は __DEV__ でも守っているので production ビルドでは動かないはずだが、
// 「本番に混ざらない歯止め」を実装の1箇所だけに頼らない。デモデータの投入は
// 既存の記録を DELETE するので、万一動くと利用者の記録が消える。
//
// **profile を問わず中止する（2026-09-17 変更）。** 以前は production のときだけ
// 止めていたが、development / preview プロファイルでも撮影モードは動く（__DEV__ が
// true なので）。そのビルドを誰かに渡すと、起動のたびに相手の記録が消える。
// 意図的に撮影用ビルドを作るときだけ SCREENSHOT_BUILD=1 で明示的に許可する。
if (process.env.EXPO_PUBLIC_SCREENSHOT_MODE === '1' && process.env.SCREENSHOT_BUILD !== '1') {
  console.error('[check-prod-keys] EXPO_PUBLIC_SCREENSHOT_MODE=1 のままです。撮影用デモデータが既存の記録を削除するため中止します。');
  console.error('[check-prod-keys] 撮影用ビルドを意図している場合は SCREENSHOT_BUILD=1 を併せて指定してください。');
  process.exit(1);
}

// キーの**種別**を検証する。プレースホルダーかどうかしか見ていなかったため、
// iOS/Android の取り違えや、Secret Key の誤投入を素通りさせていた。
// EXPO_PUBLIC_* はバンドルにインラインされ全ユーザーに配られるので、
// Secret Key (sk_) が入ったらどのプロファイルでも即中止する。
const FORMATS = [
  ['EXPO_PUBLIC_RC_IOS_KEY', /^appl_/, 'RevenueCat の iOS Public SDK Key は appl_ で始まります'],
  ['EXPO_PUBLIC_RC_ANDROID_KEY', /^goog_/, 'RevenueCat の Android Public SDK Key は goog_ で始まります'],
  ['EXPO_PUBLIC_SENTRY_DSN', /^https:\/\//, 'Sentry の DSN は https:// で始まります'],
];

for (const [name, re, hint] of FORMATS) {
  const v = process.env[name];
  if (!v || isPlaceholder(v)) continue; // 未設定は下の missing 判定に任せる
  if (/^sk_/.test(v)) {
    console.error(`[check-prod-keys] ${name} に Secret Key (sk_) が入っています。これはクライアントに配られるため中止します。`);
    process.exit(1);
  }
  if (!re.test(v)) {
    console.error(`[check-prod-keys] ${name} の形式が想定と違います。${hint}`);
    process.exit(1);
  }
}

const missing = KEYS.filter((k) => isPlaceholder(process.env[k]));

if (missing.length === 0) {
  console.log('[check-prod-keys] OK: RevenueCat/Sentryの本番キーが設定されています');
  process.exit(0);
}

const message = `[check-prod-keys] 以下の環境変数が未設定/プレースホルダーのままです: ${missing.join(', ')}`;

if (profile === 'production') {
  console.error(message);
  console.error('[check-prod-keys] productionプロファイルでのビルドを中止します。EASのSecretsに実キーを設定してください。');
  process.exit(1);
}

console.warn(message);
console.warn(`[check-prod-keys] profile="${profile ?? 'unknown'}" のため警告のみ（ビルドは継続します）`);
process.exit(0);
