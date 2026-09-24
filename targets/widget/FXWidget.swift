import WidgetKit
import SwiftUI
import AppIntents

// RN側(src/utils/widgetSync.ts)が既にt()で翻訳済みの文字列を書き込むため、
// Widget側では翻訳を持たず、受け取った文字列をそのまま表示する。
// （ウィジェットギャラリーに出る名前と説明だけはRNから渡せないため、
//   *.lproj/Localizable.strings で11言語に対応している）
/// 今日 / 今週 / 今月の1期間ぶん。RN 側 `widgetPayload.ts` の `WidgetPeriod` と対。
///
/// **`ExtensionStorage.set` の値は文字列か数値しか受け付けない**（入れ子不可）ため、
/// RN 側はこの配列を JSON 文字列にして `periodsJson` に載せる。ここで二段階にデコードする。
struct WidgetPeriod: Codable {
    let key: String            // "day" | "week" | "month"
    let label: String
    let winRate: String
    let pips: String
    let pf: String
    let count: String
    let isPositive: Int
    let hasData: Int
    let goalTotal: Int
    let goalDone: Int
    let goalProgress: Double
}

struct MonthlyStats: Codable {
    let title: String
    let winRate: String
    let winRateLabel: String
    let totalPips: String
    let pipsLabel: String
    let isPositive: Int

    // 中サイズ / ロック画面で使う追加項目。
    // 旧バージョンのアプリが書いた古いペイロードを読む可能性があるため、
    // すべてオプショナルにしてデコード失敗でウィジェットが落ちないようにする。
    let profitFactor: String?
    let profitFactorLabel: String?
    let tradeCount: String?
    let tradeCountLabel: String?
    let streak: String?
    let streakSuffix: String?
    let winRateValue: Double?
    let hasData: Int?

    // 今日 / 今週 / 今月（1.3.5〜）。古いアプリが書いた古いペイロードでも
    // デコードが落ちないよう、ここもすべてオプショナルにする。
    let periodsJson: String?
    /// **いつ時点の集計か。** 日付が変わってもアプリを開くまでペイロードは
    /// 更新されないので、これと現在日時を突き合わせて陳腐化を判定する。
    /// これが無いと「今日 +12.4 pips」と昨日の数字を出し続ける。
    let computedDay: String?
    let computedWeek: String?
    let computedMonth: String?

    static let placeholder = MonthlyStats(
        title: "FX",
        winRate: "--%",
        winRateLabel: "Win Rate",
        totalPips: "--",
        pipsLabel: "pips",
        isPositive: 1,
        profitFactor: "--",
        profitFactorLabel: "PF",
        tradeCount: "--",
        tradeCountLabel: "-",
        streak: "0",
        streakSuffix: "",
        winRateValue: 0,
        hasData: 0,
        periodsJson: nil,
        computedDay: nil,
        computedWeek: nil,
        computedMonth: nil
    )

    var periods: [WidgetPeriod] {
        guard let json = periodsJson, let data = json.data(using: .utf8),
              let list = try? JSONDecoder().decode([WidgetPeriod].self, from: data)
        else { return [] }
        return list
    }
}

// MARK: - 日付（陳腐化の判定に使う）

private let gregorian = Calendar(identifier: .gregorian)

private func ymdString(_ date: Date) -> String {
    let c = gregorian.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

private func ymString(_ date: Date) -> String {
    let c = gregorian.dateComponents([.year, .month], from: date)
    return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
}

/// 週の頭（日曜）。
///
/// **`Calendar.current.firstWeekday` を使ってはいけない。** あれはロケール依存で、
/// ドイツ語環境などでは月曜始まりになる。RN 側（`goals.ts` の `weekStart`）は
/// `getDay()` を使っており**常に日曜始まり**なので、合わせないと週の判定が
/// 1日ずれ、「今週」が勝手に古い扱いになる日ができる。
private func weekStartString(_ date: Date) -> String {
    let weekday = gregorian.component(.weekday, from: date)   // 1 = 日曜
    let start = gregorian.date(byAdding: .day, value: -(weekday - 1), to: date) ?? date
    return ymdString(start)
}

/// 画面に出す1期間。陳腐化していれば `stale` が立ち、数値の代わりに「—」を出す。
struct DisplayPeriod {
    let label: String
    let winRate: String
    let pips: String
    let isPositive: Int
    let hasData: Bool
    let goalTotal: Int
    let goalDone: Int
    let goalProgress: Double
    let stale: Bool
}

extension MonthlyStats {
    /// 現在日時と突き合わせて、古くなった期間に印を付けて返す。
    func displayPeriods(at now: Date) -> [DisplayPeriod] {
        periods.map { p in
            let stale: Bool
            switch p.key {
            case "day":   stale = (computedDay ?? "") != ymdString(now)
            case "week":  stale = (computedWeek ?? "") != weekStartString(now)
            default:      stale = (computedMonth ?? "") != ymString(now)
            }
            return DisplayPeriod(
                label: p.label,
                winRate: stale ? "—" : p.winRate,
                pips: stale ? "—" : p.pips,
                isPositive: p.isPositive,
                hasData: !stale && p.hasData == 1,
                goalTotal: stale ? 0 : p.goalTotal,
                goalDone: p.goalDone,
                goalProgress: stale ? 0 : p.goalProgress,
                stale: stale
            )
        }
    }
}

// アプリ本体のURLスキーム(app.jsonのscheme)。ウィジェットのタップ先に使う。
// expo-routerのルート(app/trade/new.tsx)にそのまま対応する。
private let newTradeURL = URL(string: "fx-trade-journal://trade/new")!

struct Provider: TimelineProvider {
    let appGroup = "group.com.fxtradejournal.ios"
    let storageKey = "monthlyStats"

    func placeholder(in context: Context) -> StatsEntry {
        StatsEntry(date: Date(), stats: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (StatsEntry) -> Void) {
        completion(StatsEntry(date: Date(), stats: loadStats()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StatsEntry>) -> Void) {
        let now = Date()
        let entry = StatsEntry(date: now, stats: loadStats())
        // RN側はトレードの追加/編集/削除のたびに ExtensionStorage.reloadWidget() を
        // 呼ぶので、内容の変化はそれで拾える。**しかし日付の変化は拾えない。**
        //
        // 以前は .never だったため、日付が変わってもアプリを開くまで再描画されず、
        // 「今日」の欄に昨日の数字が出たままになっていた（1.3.5 で3期間を出すように
        // したことで表面化する）。日付が変わる瞬間に必ず組み直す。
        // そこで displayPeriods(at:) が古い期間を「—」に倒す。
        let nextMidnight = gregorian.nextDate(
            after: now, matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) ?? now.addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(nextMidnight)))
    }

    func loadStats() -> MonthlyStats {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let data = defaults.data(forKey: storageKey),
            let stats = try? JSONDecoder().decode(MonthlyStats.self, from: data)
        else {
            return .placeholder
        }
        return stats
    }
}

struct StatsEntry: TimelineEntry {
    let date: Date
    let stats: MonthlyStats
}

// pipsのプラス/マイナスで色を変える。全サイズで同じ配色を使う。
private func pipsColor(_ isPositive: Int) -> Color {
    isPositive == 1
        ? Color(red: 0.18, green: 0.83, blue: 0.63)
        : Color(red: 0.96, green: 0.44, blue: 0.44)
}

// MARK: - ホーム画面 小サイズ（従来のレイアウトを踏襲）

struct SmallView: View {
    let stats: MonthlyStats

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(stats.title)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))

            Spacer(minLength: 4)

            Text(stats.winRate)
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
            Text(stats.winRateLabel)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))

            Spacer(minLength: 8)

            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(stats.totalPips)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(pipsColor(stats.isPositive))
                Text(stats.pipsLabel)
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// MARK: - ホーム画面 中サイズ

struct MediumStatCell: View {
    let value: String
    let label: String
    var color: Color = .white

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(color)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MediumView: View {
    let stats: MonthlyStats

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(stats.title)
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.6))
                Spacer()
                // 連続記録日数は「3日連続」のように数値＋接尾辞で組み立てる
                if let streak = stats.streak, let suffix = stats.streakSuffix,
                   streak != "0", !suffix.isEmpty {
                    Text("\(streak)\(suffix)")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85))
                }
            }

            // 今日 / 今週 / 今月を横に並べる。「まとめて確認したい」への答えがこれ。
            // 3期間が届かない場合（古いペイロード）は従来の4指標にそのまま落とす。
            let periods = stats.displayPeriods(at: Date())
            if periods.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    MediumStatCell(value: stats.winRate, label: stats.winRateLabel)
                    MediumStatCell(
                        value: stats.totalPips,
                        label: stats.pipsLabel,
                        color: pipsColor(stats.isPositive)
                    )
                    MediumStatCell(
                        value: stats.profitFactor ?? "-",
                        label: stats.profitFactorLabel ?? "PF"
                    )
                    MediumStatCell(
                        value: stats.tradeCount ?? "-",
                        label: stats.tradeCountLabel ?? ""
                    )
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(Array(periods.enumerated()), id: \.offset) { _, p in
                        PeriodColumn(period: p)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

/// 中サイズの1列ぶん。目標が設定されていればリングを重ねて「あとどれくらいか」を出す。
struct PeriodColumn: View {
    let period: DisplayPeriod

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(period.label)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.55))
                .lineLimit(1)

            HStack(spacing: 6) {
                Text(period.winRate)
                    .font(.system(size: 19, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)

                // 目標が1つも設定されていなければリングを出さない。
                // 日・週の目標は PRO でしか設定できないので、ここで課金状態を
                // 見なくても自然に線引きが揃う（見ると初期化待ちでちらつく）。
                if period.goalTotal > 0 {
                    Gauge(value: period.goalProgress) { EmptyView() }
                        .gaugeStyle(.accessoryCircularCapacity)
                        .scaleEffect(0.38)
                        .frame(width: 22, height: 22)
                        .tint(.white.opacity(0.9))
                }
            }

            Text(period.pips)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(period.hasData ? pipsColor(period.isPositive) : .white.opacity(0.4))
                .lineLimit(1)

            if period.goalTotal > 0 {
                Text("\(period.goalDone)/\(period.goalTotal)")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - ロック画面

// 円形。勝率をリングで表す。ロック画面は単色レンダリングのため色を指定しない。
struct AccessoryCircularView: View {
    let stats: MonthlyStats

    var body: some View {
        Gauge(value: min(max(stats.winRateValue ?? 0, 0), 1)) {
            Text(stats.winRateLabel)
        } currentValueLabel: {
            Text(stats.winRate)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
        .gaugeStyle(.accessoryCircularCapacity)
    }
}

// 横長。勝率とpipsを1行ずつ。
struct AccessoryRectangularView: View {
    let stats: MonthlyStats

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(stats.title)
                .font(.caption2)
                .widgetAccentable()
            HStack(spacing: 4) {
                Text(stats.winRate).font(.headline)
                Text(stats.winRateLabel).font(.caption2)
            }
            HStack(spacing: 4) {
                Text(stats.totalPips).font(.caption.weight(.semibold))
                Text(stats.pipsLabel).font(.caption2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - サイズごとの振り分け

struct FXWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: Provider.Entry

    var body: some View {
        switch family {
        case .systemMedium:
            MediumView(stats: entry.stats)
                .padding()
                .containerBackground(for: .widget) { Color("$widgetBackground") }
        case .accessoryCircular:
            AccessoryCircularView(stats: entry.stats)
                .containerBackground(for: .widget) { Color.clear }
        case .accessoryRectangular:
            AccessoryRectangularView(stats: entry.stats)
                .containerBackground(for: .widget) { Color.clear }
        default:
            SmallView(stats: entry.stats)
                .padding()
                .containerBackground(for: .widget) { Color("$widgetBackground") }
        }
    }
}


// MARK: - 期間を選べるウィジェット（1.3.5〜）

/// **既存の `FXWidget` を `AppIntentConfiguration` に作り替えていないのは意図的。**
/// 同じ kind で構成方式を変えると、すでにホーム画面に置かれているウィジェットが
/// 消えたり既定値に戻ったりしうる。手元で検証できない以上、既存の配置を壊す賭けは
/// しない。目的も違う（まとめて見る / 1期間を大きく見る）ので、ギャラリーに
/// 2つ並ぶことに意味がある。

enum PeriodOption: String, AppEnum, CaseIterable {
    case day, week, month

    // ここの文字列リテラルがそのまま .strings のキーになる（既存の
    // configurationDisplayName と同じ仕組み）。11言語ぶんを各 .lproj に置く。
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "期間"
    static var caseDisplayRepresentations: [PeriodOption: DisplayRepresentation] = [
        .day: "今日",
        .week: "今週",
        .month: "今月",
    ]
}

struct SelectPeriodIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "表示する期間"
    static var description = IntentDescription("ウィジェットに出す期間を選びます。")

    @Parameter(title: "期間", default: PeriodOption.month)
    var period: PeriodOption
}

struct PeriodEntry: TimelineEntry {
    let date: Date
    let stats: MonthlyStats
    let option: PeriodOption
}

struct PeriodProvider: AppIntentTimelineProvider {
    let appGroup = "group.com.fxtradejournal.ios"
    let storageKey = "monthlyStats"

    func placeholder(in context: Context) -> PeriodEntry {
        PeriodEntry(date: Date(), stats: .placeholder, option: .month)
    }

    func snapshot(for configuration: SelectPeriodIntent, in context: Context) async -> PeriodEntry {
        PeriodEntry(date: Date(), stats: loadStats(), option: configuration.period)
    }

    func timeline(for configuration: SelectPeriodIntent, in context: Context) async -> Timeline<PeriodEntry> {
        let now = Date()
        let entry = PeriodEntry(date: now, stats: loadStats(), option: configuration.period)
        // 日付が変わる瞬間に組み直す。理由は Provider.getTimeline と同じで、
        // これが無いと「今日」の欄に昨日の数字が出たままになる。
        let nextMidnight = gregorian.nextDate(
            after: now, matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) ?? now.addingTimeInterval(3600)
        return Timeline(entries: [entry], policy: .after(nextMidnight))
    }

    private func loadStats() -> MonthlyStats {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let data = defaults.data(forKey: storageKey),
            let stats = try? JSONDecoder().decode(MonthlyStats.self, from: data)
        else { return .placeholder }
        return stats
    }
}

extension MonthlyStats {
    /// 選ばれた期間の表示用データ。3期間が届いていない古いペイロードのときは
    /// 既存フィールド（今月）で組み立てて、ウィジェットが空にならないようにする。
    func displayPeriod(_ option: PeriodOption, at now: Date) -> DisplayPeriod {
        let all = displayPeriods(at: now)
        if let hit = all.first(where: { periodKey($0.label, option: option, all: all) }) { return hit }
        return DisplayPeriod(
            label: title, winRate: winRate, pips: totalPips, isPositive: isPositive,
            hasData: (hasData ?? 0) == 1, goalTotal: 0, goalDone: 0, goalProgress: 0, stale: false
        )
    }

    private func periodKey(_ label: String, option: PeriodOption, all: [DisplayPeriod]) -> Bool {
        // displayPeriods は periods と同じ順（day, week, month）で返す。
        // ラベルは翻訳済みで比較に使えないため、位置で対応づける。
        guard let index = all.firstIndex(where: { $0.label == label }) else { return false }
        switch option {
        case .day: return index == 0
        case .week: return index == 1
        case .month: return index == 2
        }
    }
}

/// 小サイズ。選んだ期間だけを大きく出す。
struct PeriodSmallView: View {
    let period: DisplayPeriod

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(period.label)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))

            Spacer(minLength: 4)

            Text(period.winRate)
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.6)
                .lineLimit(1)

            Text(period.pips)
                .font(.caption.weight(.semibold))
                .foregroundStyle(period.hasData ? pipsColor(period.isPositive) : .white.opacity(0.4))

            if period.goalTotal > 0 {
                HStack(spacing: 5) {
                    Gauge(value: period.goalProgress) { EmptyView() }
                        .gaugeStyle(.accessoryCircularCapacity)
                        .scaleEffect(0.34)
                        .frame(width: 20, height: 20)
                        .tint(.white.opacity(0.9))
                    Text("\(period.goalDone)/\(period.goalTotal)")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct FXPeriodWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: PeriodProvider.Entry

    var body: some View {
        let p = entry.stats.displayPeriod(entry.option, at: Date())
        switch family {
        case .accessoryCircular:
            Gauge(value: min(max(p.goalTotal > 0 ? p.goalProgress : 0, 0), 1)) {
                Text(p.label)
            } currentValueLabel: {
                Text(p.winRate).minimumScaleFactor(0.6).lineLimit(1)
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .containerBackground(for: .widget) { Color.clear }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(p.label).font(.caption2).widgetAccentable()
                Text(p.winRate).font(.headline)
                Text(p.pips).font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .containerBackground(for: .widget) { Color.clear }
        default:
            PeriodSmallView(period: p)
                .padding()
                .containerBackground(for: .widget) { Color("$widgetBackground") }
        }
    }
}

struct FXPeriodWidget: Widget {
    let kind: String = "FXPeriodWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: SelectPeriodIntent.self, provider: PeriodProvider()) { entry in
            FXPeriodWidgetEntryView(entry: entry)
                .widgetURL(newTradeURL)
        }
        .configurationDisplayName("期間を選ぶ")
        .description("今日・今週・今月から選んで成績を表示します。長押し→ウィジェットを編集で切り替えられます。")
        .supportedFamilies([
            .systemSmall,
            .accessoryCircular,
            .accessoryRectangular,
        ])
    }
}

struct FXWidget: Widget {
    let kind: String = "FXWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            FXWidgetEntryView(entry: entry)
                // タップで記録画面へ直行させる。調査で最大の脱落点だった
                // 「初回オープン→初回取引保存 43%」に効かせるのが狙い。
                .widgetURL(newTradeURL)
        }
        .configurationDisplayName("成績サマリー")
        .description("今日・今週・今月の成績をまとめて表示します。")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular,
        ])
    }
}

/// **ウィジェットが2つあるので `@main` は Bundle 側に付ける。**
/// 個々の Widget に付けたままだと、そちらしかギャラリーに出ない
/// （追加したウィジェットが「存在するのに見つからない」形になる）。
@main
struct FXWidgetBundle: WidgetBundle {
    var body: some Widget {
        FXWidget()
        FXPeriodWidget()
    }
}
