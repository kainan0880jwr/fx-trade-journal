import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  copyAsync,
  deleteAsync,
} from 'expo-file-system/legacy';

const CHARTS_DIR = `${documentDirectory}charts/`;

async function ensureChartsDir(): Promise<void> {
  const info = await getInfoAsync(CHARTS_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(CHARTS_DIR, { intermediates: true });
  }
}

// documentDirectory はアプリ再インストール・OSアップデートのたびにコンテナIDが変わり無効になるため、
// DBには相対パス（例: charts/xxx.jpg）のみ保存し、使用時に現在のdocumentDirectoryで解決する。
export function resolveImageUri(uri: string): string {
  if (!uri) return uri;
  if (uri.includes('://')) return uri; // 旧形式（絶対パス）はそのまま扱う。移行はDB側マイグレーションで実施
  return `${documentDirectory}${uri}`;
}

export async function saveTradeImages(tempUris: string[], tradeId: string): Promise<string[]> {
  if (tempUris.length === 0) return [];
  await ensureChartsDir();

  const results: string[] = [];
  for (let i = 0; i < tempUris.length; i++) {
    const uri = tempUris[i];
    if (!uri.includes('://')) {
      results.push(uri); // 既に相対パス（保存済み画像の再利用）
      continue;
    }
    const rawExt = uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
    const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : 'jpg';
    // ファイル名は配列位置ではなく一意な値にする。
    //
    // 以前は `${tradeId}_${i}` で、i はその時点の配列内位置だった。既存の相対パスは
    // 上の分岐で素通しされるため、編集で「1枚目を削除して新しい画像を追加」すると
    // 新画像の保存先が、残したはずの既存画像と同じファイル名になり **上書き破壊** した。
    // copyAsync は既存ファイルを黙って置き換えるため、警告もエラーも出ずに
    // 過去のチャート画像が復旧不能な形で失われていた。
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const relPath = `charts/${tradeId}_${unique}.${ext}`;
    await copyAsync({ from: uri, to: `${documentDirectory}${relPath}` });
    results.push(relPath);
  }
  return results;
}

export async function deleteTradeImages(imageUris: string[]): Promise<void> {
  for (const uri of imageUris) {
    const resolved = resolveImageUri(uri);
    if (!documentDirectory || !resolved.startsWith(documentDirectory)) continue;
    await deleteAsync(resolved, { idempotent: true });
  }
}
