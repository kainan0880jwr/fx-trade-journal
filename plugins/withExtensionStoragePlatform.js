const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * @bacons/apple-targets の ExtensionStorage.podspec が要求する最低iOSバージョンを、
 * アプリ本体の最低iOSバージョンまで引き下げる。
 *
 * ■ なぜ必要か
 *
 * 同podspecは `s.platform = :ios, '16.4'` を宣言している。一方このアプリの
 * 最低iOSバージョンは 15.1。Expoのautolinkingは、プロジェクトの最低バージョンを
 * 上回る要求を持つpodを **エラーも警告も出さずに除外する**。
 *
 * その結果 v1.3.0 では次のことが起きた。
 *   - ウィジェットのXcodeターゲット自体は設定プラグインが生成するので正しく作られる
 *   - しかし ExtensionStorage のネイティブモジュールだけがリンクされない
 *   - JS側の @bacons/apple-targets は、ネイティブモジュールが無いと例外を投げず
 *     「何もしないダミー関数」に差し替わる（ExtensionStorage.js を参照）
 *   - よって set() も reloadWidget() も成功したふりをして、App Groupには
 *     何も書かれず、ウィジェットは永久にプレースホルダー（--%）を表示する
 *   - catchにも入らないためSentryにも痕跡が残らない
 *
 * 「ウィジェットは表示されるのにデータだけ来ない」という切り分けにくい壊れ方をする。
 *
 * ■ なぜ引き下げて安全か
 *
 * ExtensionStorageModule.swift が実際に使うのは ExpoModulesCore と WidgetKit だけで、
 * WidgetCenter は iOS 14 から利用できる。iOS 18 の ControlCenter API は
 * `#available(iOS 18.0, *)` で保護されている。つまり 16.4 という宣言に技術的な
 * 根拠はなく、過剰申告である。
 *
 * ■ なぜアプリ側の最低バージョンを上げないのか
 *
 * このpodは**本体アプリ**にリンクされるため、16.4に合わせると本体アプリ自体が
 * iOS 16.4以上必須になる。ウィジェットは元々 iOS 17以上（containerBackgroundのため）
 * なので、それをやると「ウィジェットを使えないが本体は使えていた iOS 15.1〜16.3 の
 * ユーザー」をアプリごと切り捨てることになる。引き下げなら誰も失わない。
 *
 * ■ 失敗時の挙動
 *
 * 想定した記述が見つからない場合は**ビルドを失敗させる**。無言で素通りさせると、
 * パッケージ更新時に同じ「ウィジェットが静かに壊れる」状態へ戻ってしまうため。
 */
const PODSPEC_RELATIVE = path.join(
  'node_modules', '@bacons', 'apple-targets', 'ios', 'ExtensionStorage.podspec'
);

// s.platform = :ios, '16.4'   （空白や引用符の揺れを許容する）
const PLATFORM_RE = /(s\.platform\s*=\s*:ios\s*,\s*)(['"])(\d+(?:\.\d+)?)\2/;

function versionLte(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return true;
}

module.exports = function withExtensionStoragePlatform(config, props = {}) {
  const target = props.deploymentTarget ?? '15.1';

  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podspecPath = path.join(cfg.modRequest.projectRoot, PODSPEC_RELATIVE);

      if (!fs.existsSync(podspecPath)) {
        throw new Error(
          `[withExtensionStoragePlatform] podspecが見つかりません: ${podspecPath}\n` +
          '@bacons/apple-targets の構成が変わった可能性があります。' +
          'このプラグインを外すとウィジェットが無言で動かなくなるため、必ず原因を確認してください。'
        );
      }

      const src = fs.readFileSync(podspecPath, 'utf8');
      const m = src.match(PLATFORM_RE);

      if (!m) {
        throw new Error(
          `[withExtensionStoragePlatform] podspec内に s.platform の宣言が見つかりません: ${podspecPath}\n` +
          'パッケージ更新で書式が変わった可能性があります。このまま進めるとExtensionStorageが' +
          'autolinkingから無言で除外され、ウィジェットがプレースホルダー表示のまま出荷されます。'
        );
      }

      const current = m[3];
      if (versionLte(current, target)) {
        // 既に十分低い（パッケージ側が修正された場合など）。何もしない。
        return cfg;
      }

      const patched = src.replace(PLATFORM_RE, `$1$2${target}$2`);
      fs.writeFileSync(podspecPath, patched, 'utf8');
      console.log(
        `[withExtensionStoragePlatform] ExtensionStorage.podspec の最低iOSを ` +
        `${current} → ${target} に引き下げました`
      );
      return cfg;
    },
  ]);
};
