import { Alert, Linking } from 'react-native';
import { t } from '../i18n';

/**
 * 外部URL（Webページ / mailto / ストア）を開く。
 *
 * `Linking.openURL()` は「開けるアプリが無い」「OS側で外部アプリ起動が制限されている」場合に
 * Promise を reject する。呼び出し側で await も catch もしていないと、それが未処理の
 * Promise rejection になり、
 *   - ユーザーにはタップしても何も起きない（無反応）ように見える
 *   - Sentry に "Unable to open URL: ..." としてエラーが積み上がる
 * という二重の問題になる。実際に本番（App Store審査端末）で mailto:・利用規約・
 * 購読管理のすべてが同一セッション内で reject していた。
 *
 * ここで必ず catch し、開けなかった場合は宛先（URL / メールアドレス）を
 * アラートで提示して手動で辿れるようにする。
 *
 * @param url     実際に開くURL
 * @param display アラートに表示する文字列（省略時は url。mailto: の場合はアドレスだけを渡す）
 * @returns       開けたら true、失敗したら false
 */
export async function openExternalUrl(url: string, display?: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(
      t('link_open_failed_title'),
      t('link_open_failed_message').replace('{target}', display ?? url),
    );
    return false;
  }
}
