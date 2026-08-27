/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "FXWidget",
  displayName: "FXトレードログ",
  colors: {
    $widgetBackground: "#0F1221",
    $accent: "#4F7EF7",
  },
  // containerBackground(for: .widget)がiOS17以降のAPIのため、ウィジェット
  // ターゲットのみ17.0にする(本体アプリの対応OSバージョンには影響しない)。
  deploymentTarget: "17.0",
  frameworks: ["SwiftUI", "WidgetKit"],
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
