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
    const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
    const relPath = `charts/${tradeId}_${i}.${ext}`;
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
