/**
 * 連続記録日数が「知らせる価値のある節目」かどうか。
 *
 * 以前は保存のたびに必ずダイアログを出し、OKを押さないと画面が閉じなかった。
 * クイックモードは2タップで保存できるのが売りなのに、実際は毎回3タップになっていた。
 *
 * 保存できたことは**画面が閉じて一覧に新しい記録が出ること**で伝わる。連続記録の
 * 通知は毎日出す必要がなく、節目に絞るほうがむしろ価値が上がる。
 *
 * 1日目（初めての記録）は別扱いで、呼び出し側が常に知らせる。
 */
const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];

export function isStreakMilestone(streak: number): boolean {
  if (!Number.isFinite(streak) || streak < 2) return false;
  if (MILESTONES.includes(streak)) return true;
  // 365日を超えたら100日ごと。際限なく毎日出さないための区切り。
  return streak > 365 && streak % 100 === 0;
}
