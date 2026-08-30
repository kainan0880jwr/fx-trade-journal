# v1.3.1 審査メモ（App Review Information → Notes に貼る）

英語で入力すること。以下をそのままコピーできる。

---

```
This app is a personal trading journal. It records and reviews the user's own
past forex trades.

It does NOT provide investment advice, trading signals or recommendations, and
it does NOT execute, place or route any trade. There is no brokerage
connection and no order functionality of any kind. All statistics shown
(win rate, pips, profit factor, P&L) are calculated only from data the user
enters manually or imports from their own MT4/MT5 CSV export.

NO ACCOUNT OR LOGIN
There is no sign-up, login or user account, so no demo credentials are needed.
All data is stored locally on the device in an encrypted SQLite database.

HOW TO REVIEW THE PAID FEATURES
1. Open the app and complete or skip the onboarding.
2. Tap the "Analysis" tab, then any sub-tab other than "Performance"
   (for example "Time"), OR tap the "Yearly" tab.
3. The paywall appears, showing both monthly and yearly options with price,
   renewal terms, cancellation instructions, and links to the Terms of Use and
   Privacy Policy.
4. "Restore Purchases" is available on the same screen.

WHAT IS FREE / WHAT IS PAID
Free: logging trades, the calendar, the monthly dashboard (win rate, pips,
profit factor, P&L), breakdowns by currency pair and trading style, MT4/MT5
CSV import, Home Screen and Lock Screen widgets, goal setting.
Paid: weekly view, insights, time-of-day and weekday breakdowns, tag analysis,
risk-reward analysis, equity curve, mental tracking, achievement badges, the
yearly tab, and the position size calculator.
There is no limit on the number of trades a free user can record.

WHAT CHANGED IN THIS VERSION
This release is mainly a correctness fix for the numbers the app reports.
- Fixed P&L for JPY-quoted pairs being calculated and stored at 10x the
  correct amount. Existing records are repaired automatically on launch.
- Fixed pips for losing trades entered via quick entry being stored as
  positive. Existing records are repaired automatically.
- Fixed editing a quick entry not saving the P&L or lot size.
- Unified how win rate, pips and profit factor are formatted so the same
  month reads identically on every screen.
- Added goal setting (daily, weekly, monthly, yearly) and achievement badges.

WIDGETS
The Home Screen and Lock Screen widgets read this month's statistics from a
shared App Group container. They do not access the network.

PRIVACY
The app sends no trade data anywhere. Crash reports and a small number of
anonymous product events (for example "paywall shown") go to Sentry; they
contain no trade contents, no amounts, no currency pairs and no user
identifier. Subscription state is handled by RevenueCat. Both are disclosed in
the Privacy Policy.
```

---

## 併せて確認すること

- 輸出コンプライアンス: `app.json` に `ITSAppUsesNonExemptEncryption: false` があるため通常は質問が出ない。出た場合は「いいえ」。
  ただしローカルDBの暗号化に SQLCipher を同梱しているため、この申告が適切かは
  輸出管理の専門家に確認する余地がある（法務レビューでの指摘事項）。
- デモアカウント欄: ログイン機構が無いため空欄でよい。上のメモにその旨を書いてある。
- 連絡先: 審査中に連絡が取れるメールアドレスと電話番号を入れる。
