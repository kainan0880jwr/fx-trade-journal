import { router } from 'expo-router';

/**
 * モーダル/スタック画面を閉じる。戻り先が無い場合はタブのトップへ置き換える。
 *
 * `router.back()` は戻り先が無いと**例外も警告も出さずに何もしない**。
 * ホーム画面ウィジェットから fx-trade-journal://trade/new を直接開いた場合、
 * その画面がスタックの唯一の要素になり得るため、保存に成功しても画面が閉じず
 * 「保存ボタンが効かない」という見え方になる（実際にv1.3.0で発生した）。
 *
 * `app/_layout.tsx` の `unstable_settings.anchor` で (tabs) を下に積む対策も
 * 入れているが、それはルーター側の解決に依存する。ここでの明示的な
 * フォールバックと二重にすることで、どちらか一方が効かなくても
 * ユーザーが画面に閉じ込められないようにする。
 */
export function closeScreen(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(tabs)');
  }
}
