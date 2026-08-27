import WidgetKit
import SwiftUI

// RN側(src/utils/widgetSync.ts)が既にt()で翻訳済みの文字列を書き込むため、
// Widget側では翻訳を持たず、受け取った文字列をそのまま表示する。
struct MonthlyStats: Codable {
    let title: String
    let winRate: String
    let winRateLabel: String
    let totalPips: String
    let pipsLabel: String
    let isPositive: Int

    static let placeholder = MonthlyStats(
        title: "FX",
        winRate: "--%",
        winRateLabel: "Win Rate",
        totalPips: "--",
        pipsLabel: "pips",
        isPositive: 1
    )
}

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

struct FXWidgetEntryView: View {
    var entry: Provider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.stats.title)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))

            Spacer(minLength: 4)

            Text(entry.stats.winRate)
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
            Text(entry.stats.winRateLabel)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))

            Spacer(minLength: 8)

            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(entry.stats.totalPips)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(entry.stats.isPositive == 1 ? Color(red: 0.18, green: 0.83, blue: 0.63) : Color(red: 0.96, green: 0.44, blue: 0.44))
                Text(entry.stats.pipsLabel)
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) {
            Color("$widgetBackground")
        }
    }
}

@main
struct FXWidget: Widget {
    let kind: String = "FXWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            FXWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("今月の成績")
        .description("今月の勝率と合計pipsをホーム画面に表示します。")
        .supportedFamilies([.systemSmall])
    }
}
