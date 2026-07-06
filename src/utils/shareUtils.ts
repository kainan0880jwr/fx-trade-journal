import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { writeAsStringAsync, cacheDirectory } from 'expo-file-system/legacy';
import { lang } from '../i18n';
import type { DailyStats } from '../types';

export interface ShareStatsOptions {
  stats: DailyStats;
  period: string;       // "2026年6月" or "June 2026"
  yearMonth?: string;   // "2026-06" — ファイル名生成用
  streak?: number;
  includeFinancials?: boolean;
  isPremium?: boolean;
}

function sign(n: number): string {
  return n > 0 ? '+' : '';
}

// ── テキストカード（Unicode ボックス描画）──────────────────────
export function buildShareText(opts: ShareStatsOptions): string {
  const { stats, period, streak = 0, includeFinancials = false } = opts;
  const BORDER_TOP    = '┌──────────────────────────┐';
  const BORDER_BOT    = '└──────────────────────────┘';
  const BORDER_DIV    = '├──────────────────────────┤';
  const pad = (s: string, w: number) => s.padEnd(w, ' ').slice(0, w);

  const row = (icon: string, label: string, value: string) =>
    `│ ${icon} ${pad(label, 12)} ${pad(value, 10)} │`;

  const lines = lang === 'ja'
    ? [
        BORDER_TOP,
        `│    📊 ${pad(period + 'の成績', 19)} │`,
        BORDER_DIV,
        row('✅', '勝率',   `${stats.winRate}%`),
        row('📈', 'pips',   `${sign(stats.totalPips)}${stats.totalPips}`),
        row('📉', 'PF',     `${stats.profitFactor}`),
        row('📋', '取引',   `${stats.totalTrades}回`),
        row('🏆', '勝/負',  `${stats.wins}勝 / ${stats.losses}敗`),
        ...(includeFinancials && stats.totalProfitLoss !== 0
          ? [row('💴', '損益', `${sign(stats.totalProfitLoss)}${stats.totalProfitLoss.toLocaleString()}円`)]
          : []),
        ...(streak >= 2 ? [row('🔥', '連続記録', `${streak}日`)] : []),
        BORDER_DIV,
        '│         📱 FXトレードログ         │',
        BORDER_BOT,
      ]
    : [
        BORDER_TOP,
        `│    📊 ${pad(period + ' Results', 19)} │`,
        BORDER_DIV,
        row('✅', 'Win Rate', `${stats.winRate}%`),
        row('📈', 'Pips',     `${sign(stats.totalPips)}${stats.totalPips}`),
        row('📉', 'PF',       `${stats.profitFactor}`),
        row('📋', 'Trades',   `${stats.totalTrades}`),
        row('🏆', 'W / L',   `${stats.wins}W / ${stats.losses}L`),
        ...(includeFinancials && stats.totalProfitLoss !== 0
          ? [row('💴', 'P&L', `${sign(stats.totalProfitLoss)}${stats.totalProfitLoss.toLocaleString()}¥`)]
          : []),
        ...(streak >= 2 ? [row('🔥', 'Streak', `${streak} days`)] : []),
        BORDER_DIV,
        '│         📱 FX Trade Log           │',
        BORDER_BOT,
      ];

  return lines.join('\n');
}

// ── HTMLシェアカード ───────────────────────────────────────────
function buildShareHTML(opts: ShareStatsOptions): string {
  const { stats, period, streak = 0, includeFinancials = false, isPremium = false } = opts;
  const isJa = lang === 'ja';

  const pipsColor = stats.totalPips >= 0 ? '#3ECF8E' : '#FF6B6B';
  const winRateColor = stats.winRate >= 50 ? '#3ECF8E' : '#FF6B6B';

  const rows: { icon: string; label: string; value: string }[] = [
    { icon: '📈', label: isJa ? 'pips'  : 'Pips',       value: `${stats.totalPips > 0 ? '+' : ''}${stats.totalPips}` },
    { icon: '📉', label: 'PF',                            value: String(stats.profitFactor) },
    { icon: '📋', label: isJa ? '取引回数' : 'Trades',   value: isJa ? `${stats.totalTrades}回` : String(stats.totalTrades) },
    { icon: '🏆', label: isJa ? '勝/負' : 'W / L',       value: isJa ? `${stats.wins}勝 / ${stats.losses}敗` : `${stats.wins}W / ${stats.losses}L` },
  ];

  if (includeFinancials && stats.totalProfitLoss !== 0) {
    rows.push({
      icon: '💴',
      label: isJa ? '損益' : 'P&L',
      value: `${stats.totalProfitLoss > 0 ? '+' : ''}${stats.totalProfitLoss.toLocaleString()}${isJa ? '円' : '¥'}`,
    });
  }

  if (streak >= 2) {
    rows.push({
      icon: '🔥',
      label: isJa ? '連続記録' : 'Streak',
      value: isJa ? `${streak}日` : `${streak} days`,
    });
  }

  const rowsHTML = rows.map(r => `
    <div class="stat-row">
      <span class="icon">${r.icon}</span>
      <span class="label">${r.label}</span>
      <span class="value">${r.value}</span>
    </div>`).join('');

  const appName = isJa ? 'FXトレードログ' : 'FX Trade Log';
  const headline = isJa ? `${period}の成績` : `${period} Results`;

  // 無料版ウォーターマーク
  const watermarkHTML = !isPremium ? `
  <div class="watermark-bar">
    <span class="wm-icon">📱</span>
    <span class="wm-text">${isJa ? '無料版 · FXトレードログ' : 'Free · FX Trade Log'}</span>
    <span class="wm-cta">${isJa ? 'PRO版にアップグレード ›' : 'Upgrade to PRO ›'}</span>
  </div>` : `
  <div class="footer">${isJa ? 'FXトレードログ PRO' : 'FX Trade Log PRO'}</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #0D0D0D;
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; font-family: -apple-system, sans-serif;
  padding: 20px;
}
.card {
  background: linear-gradient(145deg, #1A1A2E 0%, #16213E 100%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 28px;
  padding: 36px 32px 20px;
  max-width: 380px; width: 100%;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  overflow: hidden;
}
.logo { font-size: 12px; color: #888; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 20px; }
.period { font-size: 15px; color: rgba(255,255,255,0.55); margin-bottom: 8px; }
.headline { font-size: 24px; font-weight: 800; color: #FFF; margin-bottom: 28px; }
.winrate-block {
  background: rgba(255,255,255,0.05);
  border-radius: 18px; padding: 20px;
  text-align: center; margin-bottom: 20px;
}
.winrate-label { font-size: 12px; color: #888; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
.winrate-value { font-size: 56px; font-weight: 900; color: ${winRateColor}; line-height: 1; }
.winrate-pct { font-size: 28px; font-weight: 800; color: ${winRateColor}; }
.divider { height: 1px; background: rgba(255,255,255,0.08); margin: 16px 0; }
.stat-row {
  display: flex; align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.stat-row:last-child { border-bottom: none; }
.icon { font-size: 18px; margin-right: 12px; width: 26px; text-align: center; }
.label { flex: 1; font-size: 14px; color: rgba(255,255,255,0.55); }
.value { font-size: 15px; font-weight: 700; color: #FFF; }
.pips-value { color: ${pipsColor}; }
/* PRO版フッター */
.footer {
  margin-top: 20px; text-align: center;
  font-size: 11px; color: rgba(255,255,255,0.35);
  letter-spacing: 1.5px; text-transform: uppercase;
}
/* 無料版ウォーターマークバー */
.watermark-bar {
  margin: 20px -32px -20px;
  padding: 12px 20px;
  background: linear-gradient(90deg, #F59E0B 0%, #EF4444 100%);
  display: flex; align-items: center; gap: 8px;
}
.wm-icon { font-size: 16px; }
.wm-text { flex: 1; font-size: 12px; font-weight: 700; color: #FFF; letter-spacing: 0.5px; }
.wm-cta {
  font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.85);
  background: rgba(0,0,0,0.2); border-radius: 20px;
  padding: 3px 10px; white-space: nowrap;
}
</style>
</head>
<body>
<div class="card">
  <div class="logo">📱 ${appName}</div>
  <div class="period">📊 ${period}</div>
  <div class="headline">${headline}</div>

  <div class="winrate-block">
    <div class="winrate-label">${isJa ? '勝率' : 'Win Rate'}</div>
    <div class="winrate-value">${stats.winRate}<span class="winrate-pct">%</span></div>
  </div>

  ${rowsHTML}

  ${watermarkHTML}
</div>
</body>
</html>`;
}

// ── シェア関数 ────────────────────────────────────────────────

/** テキストカードとしてシェア（すべてのアプリに対応） */
export async function shareStats(opts: ShareStatsOptions): Promise<void> {
  const message = buildShareText(opts);
  await Share.share({ message });
}

/** HTMLカードをファイルとしてシェア（Safariで開いてスクショ可能） */
export async function shareStatsAsHTML(opts: ShareStatsOptions): Promise<void> {
  const html = buildShareHTML(opts);
  if (!cacheDirectory) throw new Error('cache_unavailable');

  const fileName = `fx-stats-${opts.yearMonth ?? 'card'}.html`.replace(/[^a-zA-Z0-9.\-]/g, '-');
  const filePath = `${cacheDirectory}${fileName}`;

  await writeAsStringAsync(filePath, html, { encoding: 'utf8' });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    // フォールバック: テキストシェア
    await shareStats(opts);
    return;
  }

  await Sharing.shareAsync(filePath, {
    mimeType: 'text/html',
    dialogTitle: opts.period,
    UTI: 'public.html',
  });
}

// ── 期間ラベル ────────────────────────────────────────────────
export function formatPeriodLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return lang === 'ja'
    ? `${year}年${month}月`
    : new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
