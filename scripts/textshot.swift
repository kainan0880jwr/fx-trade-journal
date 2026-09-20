// キャプション帯の文字を CoreText で描いて透過PNGにする。
//
// ■ なぜ Python(Pillow) で描かないのか
//
// このマシンの Pillow は **libraqm 無しでビルドされている**（`features.check('raqm')`
// が False）。その状態の Pillow は複雑文字体系のシェーピングを一切しないため、
// ヒンディー語が論理順のまま並ぶ。実際に「दिन」が「दनि」、「दर्ज」の reph が
// 付かない、「प्रॉफिट」の合字が崩れる、という状態になった。
// **字形自体は存在するので、豆腐（.notdef）を探す検査では見つからない。**
// 配信先にインドが含まれている以上、これで出荷はできない。
//
// libraqm を入れる手もあるが、パッケージ導入と Pillow の再ビルドが要る。
// macOS には CoreText があり、Xcode の swiftc も入っているので、
// 追加の依存なしでこちらを使う。
//
// ■ 使い方
//
//   echo '<JSON>' | textshot out.png
//
// JSON: { "lines": [...], "font": "<PostScript名>", "maxWidth": 1064,
//         "start": 76, "min": 44, "gapRatio": 0.42, "color": [r,g,b] }
//
// 標準出力に `<選んだサイズ> <使われたフォント名をカンマ区切り>` を返す。
// 呼び出し側は、要求したフォント以外が混ざっていないかを必ず確かめること
// （CoreText は欠けた文字を黙って別のフォントで補うので、豆腐にはならない
// 代わりに書体が入れ替わる。11言語を目視しない限り気づけない）。
import AppKit
import CoreText

struct Fail: Error { let msg: String }

func die(_ m: String) -> Never {
    FileHandle.standardError.write(("textshot: " + m + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count == 2 else { die("使い方: textshot <出力PNG> （JSONは標準入力）") }
let outPath = args[1]

let inputData = FileHandle.standardInput.readDataToEndOfFile()
guard let obj = try? JSONSerialization.jsonObject(with: inputData) as? [String: Any],
      let lines = obj["lines"] as? [String],
      let fontName = obj["font"] as? String,
      let maxWidth = obj["maxWidth"] as? Double
else { die("JSON を解釈できない") }

let startSize = obj["start"] as? Double ?? 76
let minSize = obj["min"] as? Double ?? 44
let gapRatio = obj["gapRatio"] as? Double ?? 0.42
let rgb = obj["color"] as? [Double] ?? [237, 241, 250]

let color = NSColor(calibratedRed: CGFloat(rgb[0] / 255), green: CGFloat(rgb[1] / 255),
                    blue: CGFloat(rgb[2] / 255), alpha: 1)

func makeLine(_ text: String, _ size: Double) -> CTLine {
    let font = CTFontCreateWithName(fontName as CFString, CGFloat(size), nil)
    let attr = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color])
    return CTLineCreateWithAttributedString(attr)
}

func width(_ line: CTLine) -> Double {
    Double(CTLineGetTypographicBounds(line, nil, nil, nil))
}

// 全行が maxWidth に収まる最大のサイズ。2pt刻みで落としていく（Python 版と同じ刻み）。
var chosen = minSize
var size = startSize
while size >= minSize {
    if lines.allSatisfy({ width(makeLine($0, size)) <= maxWidth }) { chosen = size; break }
    size -= 2
}

let ctLines = lines.map { makeLine($0, chosen) }
var ascent: CGFloat = 0, descent: CGFloat = 0
_ = CTLineGetTypographicBounds(ctLines[0], &ascent, &descent, nil)
let lineH = ascent + descent
let gap = CGFloat(chosen * gapRatio)
let pad: CGFloat = 8

let W = Int(ceil(ctLines.map { CGFloat(width($0)) }.max()! + pad * 2))
let H = Int(ceil(lineH * CGFloat(ctLines.count) + gap * CGFloat(ctLines.count - 1) + pad * 2))

guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
else { die("ビットマップを作れない") }
ctx.setAllowsAntialiasing(true)

// CoreText の原点は左下。上の行から描くので y は上から下へ下げていく。
var y = CGFloat(H) - pad - ascent
var used = Set<String>()
for line in ctLines {
    let w = CGFloat(width(line))
    ctx.textPosition = CGPoint(x: (CGFloat(W) - w) / 2, y: y)
    CTLineDraw(line, ctx)
    // 実際に使われたフォントを集める。要求と違えばフォールバックが起きている。
    for run in (CTLineGetGlyphRuns(line) as! [CTRun]) {
        let attrs = CTRunGetAttributes(run) as! [CFString: Any]
        if let f = attrs[kCTFontAttributeName] {
            used.insert(CTFontCopyPostScriptName(f as! CTFont) as String)
        }
    }
    y -= lineH + gap
}

guard let img = ctx.makeImage(),
      let data = NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:])
else { die("PNG を作れない") }
do { try data.write(to: URL(fileURLWithPath: outPath)) } catch { die("書き出せない: \(error)") }

print("\(Int(chosen)) \(used.sorted().joined(separator: ","))")
