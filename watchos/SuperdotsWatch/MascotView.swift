import SwiftUI

/// An original set of five distinct geometric characters, not copies of any existing mascot artwork.
struct MascotView: View {
    let dot: Dot
    var size: CGFloat = 88

    var body: some View {
        ZStack {
            switch dot {
            case .bloop:
                Circle().fill(dot.color)
                    .overlay {
                        ForEach(0..<9, id: \.self) { i in
                            Circle().fill(dot.color).frame(width: 14, height: 14)
                                .offset(x: cos(Double(i) * .pi * 2 / 9) * 37,
                                        y: sin(Double(i) * .pi * 2 / 9) * 37)
                        }
                    }
                Circle().fill(.white).frame(width: 43, height: 43).offset(x: -3, y: -5)
                Circle().fill(Color(red: 0.15, green: 0.07, blue: 0.34)).frame(width: 22, height: 22).offset(x: 1, y: -4)
                Circle().fill(.white).frame(width: 7, height: 7).offset(x: 6, y: -11)
            case .poppy:
                ForEach(0..<6, id: \.self) { i in
                    Ellipse().fill(dot.color).frame(width: 38, height: 52)
                        .offset(y: -24).rotationEffect(.degrees(Double(i) * 60))
                }
                Circle().fill(Color(red: 1, green: 0.86, blue: 0.82)).frame(width: 53, height: 53)
                face
                cheeks
            case .mochi:
                UnevenRoundedRectangle(topLeadingRadius: 31, bottomLeadingRadius: 20,
                                       bottomTrailingRadius: 30, topTrailingRadius: 20)
                    .fill(dot.color).rotationEffect(.degrees(-7))
                HStack {
                    Ellipse().fill(Color(red: 0.44, green: 0.69, blue: 0.96)).frame(width: 25, height: 15)
                    Ellipse().fill(Color(red: 0.44, green: 0.69, blue: 0.96)).frame(width: 25, height: 15)
                }.offset(y: 28)
                face
                cheeks
            case .zuzu:
                Starburst(points: 10).fill(dot.color)
                Circle().fill(Color.yellow.opacity(0.6)).frame(width: 52, height: 52)
                face
                cheeks
            case .nori:
                LeafShape().fill(dot.color)
                Ellipse().fill(Color(red: 0.13, green: 0.56, blue: 0.34)).frame(width: 34, height: 17).rotationEffect(.degrees(-32)).offset(x: 23, y: -36)
                HStack(spacing: 14) {
                    Capsule().fill(.white).frame(width: 12, height: 4)
                    Capsule().fill(.white).frame(width: 12, height: 4)
                }.offset(y: 1)
                Path { path in
                    path.move(to: CGPoint(x: 36, y: 59))
                    path.addQuadCurve(to: CGPoint(x: 56, y: 59), control: CGPoint(x: 46, y: 72))
                }.stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .frame(width: 92, height: 92)
                cheeks
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel("\(dot.title) Superdot mascot")
    }

    private var cheeks: some View {
        HStack(spacing: 48) {
            Circle().fill(Color(red: 1, green: 0.60, blue: 0.72).opacity(0.8))
                .frame(width: 12, height: 12)
            Circle().fill(Color(red: 1, green: 0.60, blue: 0.72).opacity(0.8))
                .frame(width: 12, height: 12)
        }.offset(y: 14)
    }

    private var face: some View {
        VStack(spacing: 9) {
            HStack(spacing: 14) {
                Capsule().fill(.white).frame(width: 9, height: 15)
                Capsule().fill(.white).frame(width: 9, height: 15)
            }
            Image(systemName: "mouth.fill").font(.system(size: 15)).foregroundStyle(Color(red: 0.18, green: 0.09, blue: 0.35))
        }
    }
}

struct Starburst: Shape {
    var points: Int
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        var path = Path()
        for i in 0..<(points*2) {
            let angle = Double(i) * Double.pi / Double(points) - Double.pi / 2
            let radius = min(rect.width,rect.height)*(i.isMultiple(of: 2) ? 0.49 : 0.35)
            let p = CGPoint(x: center.x + cos(angle)*radius, y: center.y + sin(angle)*radius)
            if i == 0 {path.move(to: p)} else {path.addLine(to: p)}
        }
        path.closeSubpath()
        return path
    }
}

struct LeafShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addCurve(to: CGPoint(x: rect.midX, y: rect.maxY), control1: CGPoint(x: rect.maxX * 1.28, y: rect.height * 0.36), control2: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addCurve(to: CGPoint(x: rect.midX, y: rect.minY), control1: CGPoint(x: rect.minX, y: rect.maxY), control2: CGPoint(x: rect.minX - rect.width * 0.12, y: rect.height * 0.30))
        return p
    }
}
