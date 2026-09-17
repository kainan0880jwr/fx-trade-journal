#!/usr/bin/env node
/**
 * OTA（eas update）で配信するバンドルを、**成果物そのもの**を見て検査する。
 *
 * ■ なぜ要るか
 *
 * `check-prod-keys.js` は `eas-build-pre-install` フックからしか呼ばれない。
 * つまり **`eas update` では一度も走らない**（2026-09-17 のセキュリティレビューで発覚）。
 * OTA はこのプロジェクトの主要な配信経路で、9/2〜9/8 だけで9回配信している。
 *
 * 手元の環境変数がプレースホルダーのまま OTA を打つと、そのバンドルが production
 * チャンネルの全インストールに届き、
 *   - RevenueCat が初期化されず、課金済みユーザー全員が無料扱いにロックされる
 *   - 同時に Sentry も初期化されないので、**この事故自体が観測できない**
 * という「静かに全滅」する状態になる。
 *
 * ■ なぜ環境変数ではなくバンドルを見るのか
 *
 * `EXPO_PUBLIC_*` は babel-preset-expo がビルド時にインラインするため、
 * 最終的に配信されるのはバンドル内の文字列。環境変数を見るだけでは、
 * 読み込み順や EAS 側の設定との食い違いを取りこぼす。
 * **攻撃者と同じものを見る**という意味でも成果物側が正しい。
 *
 * ■ 使い方
 *
 *   npx expo export --platform all         # dist/ を作る
 *   node scripts/check-ota-bundle.js dist  # 検査
 *   npx eas-cli update --channel production ...
 *
 * `npm run ota:check` が前の2つをまとめて実行する。
 */

const { readdirSync, statSync, readFileSync } = require('fs');
const { join } = require('path');

const dir = process.argv[2] || 'dist';

function jsFiles(root, out = []) {
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) jsFiles(full, out);
    else if (/\.(js|hbc|bundle)$/.test(name)) out.push(full);
  }
  return out;
}

let files;
try {
  files = jsFiles(dir);
} catch {
  console.error(`[check-ota-bundle] ${dir} が見つかりません。先に npx expo export を実行してください。`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`[check-ota-bundle] ${dir} にJSバンドルがありません。export が失敗している可能性があります。`);
  process.exit(1);
}

// 検査項目。**「無いはずのもの」を探す**方式にしてある（「あるはずのもの」を
// 探す方式だと、キーの形が変わったときに黙って通してしまう）。
const CHECKS = [
  {
    // プレースホルダーのまま出荷 = 課金と監視が同時に死ぬ
    name: 'プレースホルダーのAPIキー',
    re: /(appl|goog)_xxxx|xxxxxxxx/i,
    hint: 'RevenueCat / Sentry のキーがプレースホルダーのままです。環境変数の設定を確認してください。',
  },
  {
    // RevenueCat の Secret Key がクライアントに載ると、第三者が REST API で
    // 購読の参照・付与・削除ができる。ローカル完結の前提が単独で崩れる。
    name: 'RevenueCat の Secret Key',
    re: /\bsk_[A-Za-z0-9]{16,}/,
    hint: 'Secret Key (sk_) がバンドルに含まれています。EXPO_PUBLIC_ に入れてよいのは Public SDK Key だけです。',
  },
  {
    // 撮影モードのデモデータ投入は既存の記録を DELETE する
    name: '撮影モードの有効化',
    re: /EXPO_PUBLIC_SCREENSHOT_MODE["']?\s*[:=]\s*["']1["']/,
    hint: '撮影モードが有効なままです。新しいシェルで環境変数を外してから export し直してください。',
  },
];

const failures = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const c of CHECKS) {
    if (c.re.test(text)) failures.push({ file, check: c });
  }
}

if (failures.length > 0) {
  console.error('[check-ota-bundle] 配信を中止します。バンドルに次の問題があります:');
  for (const f of failures) {
    console.error(`  - ${f.check.name}  (${f.file})`);
    console.error(`    ${f.check.hint}`);
  }
  process.exit(1);
}

console.log(`[check-ota-bundle] OK: ${files.length} 個のバンドルを検査、問題なし`);
process.exit(0);
