import WidgetKit
import SwiftUI

// RN側(src/utils/widgetSync.ts)が既にt()で翻訳済みの文字列を書き込むため、
// Widget側では翻訳を持たず、受け取った文字列をそのまま表示する。
// （ウィジェットギャラリーに出る名前と説明だけはRNから渡せないため、
//   *.lproj/Localizable.strings で11言語に対応している）
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
        hasData: 0
    )
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
        let entry = StatsEntry(date: Date(), stats: loadStats())
        // RN側がトレードの追加/編集/削除のたびにExtensionStorage.reloadWidget()を
        // 呼んで明示的に更新をかけるため、ここでの自動リフレッシュポリシーは.neverでよい。
        completion(Timeline(entries: [entry], policy: .never))
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
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
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

@main
struct FXWidget: Widget {
    let kind: String = "FXWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            FXWidgetEntryView(entry: entry)
                // タップで記録画面へ直行させる。調査で最大の脱落点だった
                // 「初回オープン→初回取引保存 43%」に効かせるのが狙い。
                .widgetURL(newTradeURL)
        }
        .configurationDisplayName("今月の成績")
        .description("今月の勝率と合計pipsをホーム画面に表示します。")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular,
        ])
    }
}
