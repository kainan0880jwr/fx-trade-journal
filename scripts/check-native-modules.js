#!/usr/bin/env node
/**
 * autolinkingが解決したiOSネイティブモジュールが、実際に Podfile.lock に
 * 入っているかを突き合わせる。
 *
 * ■ なぜ必要か
 *
 * Expoのautolinkingは、podspecが要求する最低iOSバージョンがプロジェクトの
 * deployment target を上回る場合、そのpodを**エラーも警告も出さずに除外する**。
 *
 * v1.3.0で実際に起きた: @bacons/apple-targets の ExtensionStorage.podspec が
 * `s.platform = :ios, '16.4'` を宣言していたのに対しアプリ本体は 15.1 で、
 * 111個のpodが入る中でこれ1つだけが落ちた。さらにJS側は、ネイティブモジュールが
 * 無いと例外を投げず「何もしないダミー関数」にフォールバックする実装だったため、
 * 書き込みも更新通知も成功したふりをして、ホーム画面ウィジェットは出荷から
 * 数週間にわたり一度もデータを受け取らないまま「表示だけはされている」状態だった。
 *
 * ビルドは成功し、entitlementsも正しく、appexも同梱されている。それでも動かない。
 * この差分は目視では絶対に気づけないので機械的に検出する。
 *
 * ■ 使い方
 *   node scripts/check-native-modules.js
 *   （ios/Podfile.lock が必要。prebuild + pod install の後に実行すること）
 *
 * 終了コード 1 で失敗を通知するため、CIやリリース前チェックに組み込める。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOCK = path.join('ios', 'Podfile.lock');

if (!fs.existsSync(LOCK)) {
  console.error(`✖ ${LOCK} がありません。prebuild と pod install を先に実行してください。`);
  process.exit(1);
}

let resolved;
try {
  const out = execFileSync(
    'npx',
    ['expo-modules-autolinking', 'resolve', '-p', 'ios', '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  resolved = JSON.parse(out);
} catch (e) {
  console.error('✖ autolinkingの解決に失敗しました:', e.message);
  process.exit(1);
}

const lock = fs.readFileSync(LOCK, 'utf8');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const modules = resolved.modules ?? [];
const missing = [];

for (const m of modules) {
  for (const pod of m.pods ?? []) {
    const re = new RegExp(`^\\s+- ${escape(pod.podName)} \\(`, 'm');
    if (!re.test(lock)) {
      missing.push({ pkg: m.packageName, pod: pod.podName });
    }
  }
}

console.log(`autolinkingが解決したモジュール: ${modules.length}件`);

if (missing.length === 0) {
  console.log('✅ すべて Podfile.lock に存在します。');
  process.exit(0);
}

console.error('');
console.error('❌ 解決されたのに Podfile.lock に存在しないpodがあります:');
for (const { pkg, pod } of missing) {
  console.error(`   ${pod}  (${pkg})`);
}
console.error('');
console.error('よくある原因: podspecの `s.platform = :ios, ...` が、');
console.error('アプリのdeployment target を上回っている（autolinkingが無言で除外する）。');
console.error('ios/Podfile の platform 行と、該当podspecの s.platform を比較してください。');
process.exit(1);
