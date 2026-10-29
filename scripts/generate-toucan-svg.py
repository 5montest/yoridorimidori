#!/usr/bin/env python3
"""オオハシ（トゥーカン）SVG パス生成スクリプト.

アプリ「寄鳥美鳥地」の主役であるオオハシを、react-native-svg 用のパスデータとして
生成する。くちばしは画面上方向（0° = 目的地方向）を向いた状態で定義する。

生成物:
    mobile/src/ui/components/toucanPaths.ts   SVG パス定数（viewBox 0 0 100 100）
    docs/assets/toucan-preview.png            目視確認用プレビュー 1024x1024
    docs/assets/toucan-preview-48.png         目視確認用プレビュー 48x48

scripts/generate-icons.py は本スクリプトの形状（TOUCAN_PARTS）を再利用して
ランチャーアイコン等を生成する。

実行:
    python scripts/generate-toucan-svg.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TS_PATH = ROOT / "mobile" / "src" / "ui" / "components" / "toucanPaths.ts"
DOCS_ASSETS = ROOT / "docs" / "assets"

# ---------------------------------------------------------------- palette --
# 背景グラデーションは Pillow 用の RGB タプル。鳥の塗りは必ず #RRGGBB 文字列で持つ
# （タプルをそのまま TS へ出力すると不正な色文字列になるため）。
GREEN_TOP = (0x2E, 0x8B, 0x6B)  # #2E8B6B 背景グラデーション上端
GREEN_BOTTOM = (0x18, 0x58, 0x43)  # 背景グラデーション下端
DEEP_GREEN = (0x1F, 0x6F, 0x54)  # #1F6F54 基調の深緑

CREAM = "#F7F3E8"  # 喉〜胸パッチ
WHITE = "#FFFFFF"

BEAK_YELLOW = "#F5A623"  # くちばし（上側）
BEAK_ORANGE = "#E8892B"  # くちばし（下側・濃）
BEAK_TIP_DARK = "#2B2B2B"  # くちばし先端の暗色斑
BODY_BLACK = "#1C1C1C"  # 頭・体
BODY_CHARCOAL = "#262626"  # 翼（体の面を分ける微差）
EYE_RING_BLUE = "#4FA3D1"  # アイリング
EYE_PUPIL = "#141414"  # 瞳孔
TAIL_RED = "#C0392B"  # 尾の差し色

# ----------------------------------------------------------------- shapes --
# 設計座標: x 右 / y 下。くちばしは上向き（先端 y≈6）。
# 描画順に並べる（後ろにあるものほど先頭）。
# 翼・尾の赤は体の上に、くちばしは頭の下に、喉パッチ・目は頭の上に重なる。


def _circle(cx: float, cy: float, r: float) -> str:
    """円を 4 本の 3 次ベジェで表したパス文字列。"""
    return _ellipse(cx, cy, r, r)


def _ellipse(cx: float, cy: float, rx: float, ry: float) -> str:
    """楕円を 4 本の 3 次ベジェで表したパス文字列。"""
    kx, ky = 0.5523 * rx, 0.5523 * ry
    return (
        f"M {cx} {cy - ry} "
        f"C {cx + kx} {cy - ry} {cx + rx} {cy - ky} {cx + rx} {cy} "
        f"C {cx + rx} {cy + ky} {cx + kx} {cy + ry} {cx} {cy + ry} "
        f"C {cx - kx} {cy + ry} {cx - rx} {cy + ky} {cx - rx} {cy} "
        f"C {cx - rx} {cy - ky} {cx - kx} {cy - ry} {cx} {cy - ry} Z"
    )


_DESIGN_PARTS = [
    # 体（黒）: 小さめ
    {
        "name": "body",
        "fill": BODY_BLACK,
        "d": (
            "M 54 127 "
            "C 74 127 89 143 89 160 "
            "C 89 178 74 193 54 193 "
            "C 34 193 19 178 19 160 "
            "C 19 143 34 127 54 127 Z"
        ),
    },
    # 尾（黒）: 左下へ伸びる短い尾
    {
        "name": "tail",
        "fill": BODY_BLACK,
        "d": (
            "M 46 182 "
            "C 40 196 30 206 16 213 "
            "C 26 217 40 213 50 203 "
            "C 58 195 60 187 58 180 Z"
        ),
    },
    # 尾の赤い差し色
    {
        "name": "tail_red",
        "fill": TAIL_RED,
        "d": (
            "M 28 200 "
            "C 23 206 18 210 16 213 "
            "C 22 215 28 214 33 211 "
            "C 31 207 30 203 28 200 Z"
        ),
    },
    # くちばし本体（黄）: 上向きの大きな三角
    {
        "name": "beak",
        "fill": BEAK_YELLOW,
        "d": (
            "M 20 74 "
            "C 14 46 24 16 46 3 "
            "C 49 5 51 9 52 14 "
            "C 62 36 74 56 80 72 "
            "C 60 80 38 79 20 74 Z"
        ),
    },
    # くちばし下側（濃いオレンジ）: 下嘴側の帯
    {
        "name": "beak_under",
        "fill": BEAK_ORANGE,
        "d": (
            "M 52 14 "
            "C 62 36 74 56 80 72 "
            "C 75 74 70 75.5 66 76 "
            "C 58 55 49 34 42 15 "
            "C 45 13 49 13 52 14 Z"
        ),
    },
    # くちばし先端の暗色斑（先端を覆う小さなキャップ）
    {
        "name": "beak_tip",
        "fill": BEAK_TIP_DARK,
        "d": (
            "M 36 14 "
            "C 38 8 42 4 46 3 "
            "C 49 5 51 9 52 14 "
            "C 53 17 53 20 53 22 "
            "C 48 24 42 21 36 14 Z"
        ),
    },
    # 頭（黒）: くちばしの付け根を覆う
    {
        "name": "head",
        "fill": BODY_BLACK,
        "d": _circle(50, 98, 40),
    },
    # 喉〜胸のクリームパッチ（正面側 = 右）。黒い体の内側に収め、縁を必ず黒で囲む
    {
        "name": "throat",
        "fill": CREAM,
        "d": (
            "M 72 92 "
            "C 78 101 79 112 79 126 "
            "C 79 141 73 153 63 158 "
            "C 56 161 49 158 45 152 "
            "C 52 141 57 128 57 114 "
            "C 57 105 63 98 72 92 Z"
        ),
    },
    # アイリング（青）
    {
        "name": "eye_ring",
        "fill": EYE_RING_BLUE,
        "d": _circle(76, 82, 8),
    },
    # 瞳孔
    {
        "name": "eye_pupil",
        "fill": EYE_PUPIL,
        "d": _circle(76, 82, 3.4),
    },
]

# 正規化後の鳥の高さ（viewBox 100 中）と余白
VIEWBOX = 100.0
MARGIN = 6.0  # 100 中、上下左右に確保する余白


# ------------------------------------------------------- SVG path utils --
_TOKEN_RE = re.compile(r"[MLCQZ]|-?\d+(?:\.\d+)?")


def parse_path(d: str):
    """SVG パス文字列（M/L/C/Q/Z, 絶対座標）をコマンド列に変換する。"""
    tokens = _TOKEN_RE.findall(d)
    cmds = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t == "M":
            cmds.append(("M", (float(tokens[i + 1]), float(tokens[i + 2]))))
            i += 3
        elif t == "L":
            cmds.append(("L", (float(tokens[i + 1]), float(tokens[i + 2]))))
            i += 3
        elif t == "C":
            cmds.append(("C", tuple(float(v) for v in tokens[i + 1 : i + 7])))
            i += 7
        elif t == "Q":
            cmds.append(("Q", tuple(float(v) for v in tokens[i + 1 : i + 5])))
            i += 5
        elif t == "Z":
            cmds.append(("Z", ()))
            i += 1
        else:  # pragma: no cover - 生成データは上記のみ
            raise ValueError(f"unsupported command: {t}")
    return cmds


def _fmt(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def serialize_path(cmds) -> str:
    """コマンド列を SVG パス文字列に戻す。"""
    out = []
    for cmd, vals in cmds:
        out.append(cmd)
        out.extend(_fmt(v) for v in vals)
    return " ".join(out)


def transform_cmds(cmds, scale: float, ox: float, oy: float):
    """コマンド列を一様スケール + 平行移動する。"""
    out = []
    for cmd, vals in cmds:
        moved = []
        for i in range(0, len(vals), 2):
            moved.append(vals[i] * scale + ox)
            moved.append(vals[i + 1] * scale + oy)
        out.append((cmd, tuple(moved)))
    return out


def flatten_cmds(cmds, steps: int = 20):
    """コマンド列を折れ線ポリゴン群に変換する（描画・バウンディングボックス用）。"""
    polys = []
    cur = []
    start = None
    pt = (0.0, 0.0)
    for cmd, vals in cmds:
        if cmd == "M":
            if cur:
                polys.append(cur)
            pt = (vals[0], vals[1])
            start = pt
            cur = [pt]
        elif cmd == "L":
            pt = (vals[0], vals[1])
            cur.append(pt)
        elif cmd == "C":
            p0, p1, p2, p3 = pt, (vals[0], vals[1]), (vals[2], vals[3]), (vals[4], vals[5])
            for k in range(1, steps + 1):
                t = k / steps
                mt = 1.0 - t
                x = mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0]
                y = mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1]
                cur.append((x, y))
            pt = p3
        elif cmd == "Q":
            p0, p1, p2 = pt, (vals[0], vals[1]), (vals[2], vals[3])
            for k in range(1, steps + 1):
                t = k / steps
                mt = 1.0 - t
                x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0]
                y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
                cur.append((x, y))
            pt = p2
        elif cmd == "Z":
            if start is not None:
                cur.append(start)
            if cur:
                polys.append(cur)
                cur = []
    if cur:
        polys.append(cur)
    return polys


def _bbox(polys):
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


# ------------------------------------------------------- 正規化された形状 --
def _build_normalized():
    """設計座標のパーツを viewBox 0 0 100 100 にフィットさせる。"""
    parsed = [{"name": p["name"], "fill": p["fill"], "cmds": parse_path(p["d"])} for p in _DESIGN_PARTS]
    all_polys = [poly for p in parsed for poly in flatten_cmds(p["cmds"])]
    x0, y0, x1, y1 = _bbox(all_polys)
    w, h = x1 - x0, y1 - y0
    scale = (VIEWBOX - 2 * MARGIN) / max(w, h)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    ox = VIEWBOX / 2.0 - cx * scale
    oy = VIEWBOX / 2.0 - cy * scale
    norm = []
    for p in parsed:
        cmds = transform_cmds(p["cmds"], scale, ox, oy)
        norm.append({"name": p["name"], "fill": p["fill"], "d": serialize_path(cmds)})
    return norm


TOUCAN_PARTS = _build_normalized()

# 正規化後のバウンディングボックス（描画時の倍率計算に使う）
_flat = [poly for p in TOUCAN_PARTS for poly in flatten_cmds(parse_path(p["d"]))]
NORM_BBOX = _bbox(_flat)
NORM_W = NORM_BBOX[2] - NORM_BBOX[0]
NORM_H = NORM_BBOX[3] - NORM_BBOX[1]


# ------------------------------------------------------------- rendering --
def _gradient(size: int) -> Image.Image:
    """深緑のごく緩い縦グラデーション背景。"""
    strip = Image.new("RGB", (1, size))
    px = strip.load()
    for y in range(size):
        t = y / max(1, size - 1)
        t = t * t * (3.0 - 2.0 * t)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(GREEN_TOP, GREEN_BOTTOM))
    return strip.resize((size, size), Image.BILINEAR)


def _to_rgb(color) -> tuple[int, int, int]:
    """'#RRGGBB' または (r, g, b) を RGB タプルにする。"""
    if isinstance(color, tuple):
        return color
    return tuple(int(color[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def render_bird(size: int, bird_height: float, ss: int = 4, fill_override=None) -> Image.Image:
    """鳥だけを描いた透過 RGBA レイヤー（size x size, 中央配置）を返す。"""
    canvas = size * ss
    layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    unit = (bird_height / NORM_H) * ss
    cx = (NORM_BBOX[0] + NORM_BBOX[2]) / 2.0
    cy = (NORM_BBOX[1] + NORM_BBOX[3]) / 2.0

    def tp(p):
        return (canvas / 2.0 + (p[0] - cx) * unit, canvas / 2.0 + (p[1] - cy) * unit)

    for part in TOUCAN_PARTS:
        rgb = _to_rgb(fill_override if fill_override is not None else part["fill"])
        for poly in flatten_cmds(parse_path(part["d"])):
            draw.polygon([tp(p) for p in poly], fill=rgb + (255,))

    return layer.resize((size, size), Image.LANCZOS)


def render_preview(size: int, bird_height: float, ss: int = 4) -> Image.Image:
    """深緑背景 + 鳥のプレビュー画像（RGB）。"""
    bg = _gradient(size).convert("RGBA")
    return Image.alpha_composite(bg, render_bird(size, bird_height, ss=ss)).convert("RGB")


# -------------------------------------------------------------- TS output --
_TS_HEADER = """// 生成元: scripts/generate-toucan-svg.py
// アプリ「寄鳥美鳥地」のオオハシ（トゥーカン）SVG パス。
// viewBox: 0 0 100 100 / くちばしは画面上方向（0°）を向いた状態で定義しています。
// 目的地の方位に合わせて、アプリ側でコンテナごと rotate してください。
// 各パスは塗り（fill）のみで、stroke は使用していません。描画順は配列順（後ろ -> 手前）。

export const TOUCAN_VIEWBOX = "0 0 100 100";

export const TOUCAN_PATHS: readonly { readonly d: string; readonly fill: string }[] = [
"""


_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def validate_parts() -> None:
    """色が必ず #RRGGBB 文字列であることを検証する（tuple 混入の再発防止）。"""
    for part in TOUCAN_PARTS:
        fill = part["fill"]
        if not isinstance(fill, str) or not _HEX_COLOR_RE.match(fill):
            raise ValueError(
                f"fill は #RRGGBB 文字列である必要があります: {part['name']}={fill!r}"
            )
        if not part["d"].startswith("M "):
            raise ValueError(f"path は M で始まる必要があります: {part['name']}")


def write_ts(path: Path = TS_PATH) -> None:
    validate_parts()
    lines = [_TS_HEADER]
    for part in TOUCAN_PARTS:
        lines.append(f"  // {part['name']}\n")
        lines.append(f'  {{ d: "{part["d"]}", fill: "{part["fill"]}" }},\n')
    lines.append("];\n")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(lines), encoding="utf-8")


# ------------------------------------------------------------------ main --
def main() -> None:
    validate_parts()
    write_ts()
    print(f"generated {TS_PATH.relative_to(ROOT)}")

    # 出力ファイルの色形式チェック（tuple の文字列化などが混入していないか）
    ts_text = TS_PATH.read_text(encoding="utf-8")
    if '"(' in ts_text or "('" in ts_text:
        raise ValueError("toucanPaths.ts に不正な色文字列（tuple）が混入しています")
    if ts_text.count('fill: "#') != len(TOUCAN_PARTS):
        raise ValueError("toucanPaths.ts の fill 数がパーツ数と一致しません")
    print(f"  parts={len(TOUCAN_PARTS)} / all fills are #RRGGBB")

    DOCS_ASSETS.mkdir(parents=True, exist_ok=True)
    preview = render_preview(1024, bird_height=760.0)
    preview_path = DOCS_ASSETS / "toucan-preview.png"
    preview.save(preview_path, format="PNG", optimize=True)
    print(f"generated {preview_path.relative_to(ROOT)}  1024x1024")

    preview48 = render_preview(48, bird_height=42.0, ss=16)
    preview48_path = DOCS_ASSETS / "toucan-preview-48.png"
    preview48.save(preview48_path, format="PNG", optimize=True)
    print(f"generated {preview48_path.relative_to(ROOT)}  48x48")

    # 形状の自動チェック: くちばしが存在し、先端が最上部にあること
    assert any(p["name"] == "beak" for p in TOUCAN_PARTS)
    assert TOUCAN_PARTS[-1]["name"] == "eye_pupil"
    print(f"bird bbox in viewBox: w={NORM_W:.1f} h={NORM_H:.1f}")


if __name__ == "__main__":
    sys.exit(main())
