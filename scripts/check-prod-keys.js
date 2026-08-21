#!/usr/bin/env node
// 本番(production)ビルドでRevenueCat/SentryのAPIキーがプレースホルダーのまま
// 出荷されるのを防ぐガード。EAS Buildの eas-build-pre-install フックから実行される。
// 過去のセキュリティレビュー(output/review/セキュリティレビュー_FXトレードログ_20260704.md)で
// 「ビルドにプレースホルダーのみ存在、実キー混入なし」の実績が確認されているため追加。
// purchaseStore.ts / app/_layout.tsx の isPlaceholderKey/isPlaceholderDsn と同じ判定(/xxxx/i)。

const isPlaceholder = (v) => !v || /xxxx/i.test(v);

const KEYS = [
  'EXPO_PUBLIC_RC_IOS_KEY',
  'EXPO_PUBLIC_RC_ANDROID_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
];

const profile = process.env.EAS_BUILD_PROFILE;
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
