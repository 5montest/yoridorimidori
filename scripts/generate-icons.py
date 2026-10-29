#!/usr/bin/env python3
"""寄鳥美鳥地 (yoridorimidori) アイコン / スプラッシュ画像ジェネレータ（オオハシ版）.

アプリの主役であるオオハシ（トゥーカン）の形状は scripts/generate-toucan-svg.py が
単一のソース。本スクリプトはその形状を読み込み、深緑背景・方位リングと合成して
ランチャー用の各サイズを生成する。

実行:
    python scripts/generate-toucan-svg.py   # 先に形状（toucanPaths.ts）を生成
    python scripts/generate-icons.py

生成物 (mobile/assets/):
    icon.png                     1024x1024  RGB   深緑背景 + オオハシ + 薄い方位リング
    android-icon-foreground.png  1024x1024  RGBA  透過 / オオハシのみ（セーフゾーン内）
    android-icon-background.png  1024x1024  RGB   深緑グラデーション
    android-icon-monochrome.png  1024x1024  RGBA  透過 / オオハシ形状の白一色
    splash-icon.png              1024x1024  RGBA  透過 / オオハシ + 方位リング
    favicon.png                  48x48      RGB   深緑背景 + オオハシ（リングなし）
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "mobile" / "assets"
TOUCAN_SCRIPT = ROOT / "scripts" / "generate-toucan-svg.py"

# ---------------------------------------------------------------- palette --
GREEN_TOP = (0x2E, 0x8B, 0x6B)  # #2E8B6B 背景グラデーション上端
GREEN_BOTTOM = (0x18, 0x58, 0x43)  # 背景グラデーション下端
DEEP_GREEN = (0x1F, 0x6F, 0x54)  # #1F6F54 基調の深緑
CREAM = (0xF7, 0xF3, 0xE8)  # #F7F3E8 方位リング
WHITE_HEX = "#FFFFFF"  # テーマアイコン用

SS = 4  # スーパーサンプリング倍率

# 図形の配置（1024 基準）
RING_RADIUS = 400.0
RING_STROKE = 4.0
NORTH_BASE = 407.0
NORTH_TIP = 445.0
NORTH_HALF = 13.0

BIRD_ICON_H = 740.0  # icon / splash
BIRD_SAFE_H = 620.0  # foreground / monochrome（中央 66% セーフゾーン内）
BIRD_FAVICON_H = 43.0  # 48px favicon


# ----------------------------------------------------------- toucan source --
def _load_toucan():
    """scripts/generate-toucan-svg.py をモジュールとして読み込む。"""
    spec = importlib.util.spec_from_file_location("generate_toucan_svg", TOUCAN_SCRIPT)
    if spec is None or spec.loader is None:  # pragma: no cover
        raise ImportError(f"cannot load {TOUCAN_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


toucan = _load_toucan()


# --------------------------------------------------------------- drawing --
def vertical_gradient(w: int, h: int, top, bottom) -> Image.Image:
    """縦方向のごく緩いグラデーション（smoothstep）。"""
    strip = Image.new("RGB", (1, h))
    px = strip.load()
    for y in range(h):
        t = y / max(1, h - 1)
        t = t * t * (3.0 - 2.0 * t)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return strip.resize((w, h), Image.BILINEAR)


def gradient_bg(size: int) -> Image.Image:
    return vertical_gradient(size, size, GREEN_TOP, GREEN_BOTTOM).convert("RGBA")


def ring_layer(
    size: int,
    color,
    *,
    stroke: float,
    radius: float,
    alpha: float,
    north_alpha: float,
) -> Image.Image:
    """細い方位リング + 北マーカーを重ねた透明レイヤー。"""
    canvas = size * SS
    c = canvas / 2.0

    ring = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    r = radius * SS
    d.ellipse(
        [c - r, c - r, c + r, c + r],
        outline=color + (255,),
        width=max(1, round(stroke * SS)),
    )
    ring = ring.resize((size, size), Image.LANCZOS)
    ring.putalpha(ring.getchannel("A").point(lambda a: round(a * alpha)))

    north = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    dn = ImageDraw.Draw(north)
    dn.polygon(
        [
            (c, c - NORTH_TIP * SS),
            (c - NORTH_HALF * SS, c - NORTH_BASE * SS),
            (c + NORTH_HALF * SS, c - NORTH_BASE * SS),
        ],
        fill=color + (255,),
    )
    north = north.resize((size, size), Image.LANCZOS)
    north.putalpha(north.getchannel("A").point(lambda a: round(a * north_alpha)))
    return Image.alpha_composite(ring, north)


def _paste(base: Image.Image, layer: Image.Image) -> Image.Image:
    return Image.alpha_composite(base, layer)


def _bird(size: int, height: float, *, ss: int = SS, fill_override=None) -> Image.Image:
    return toucan.render_bird(size, height, ss=ss, fill_override=fill_override)


# ---------------------------------------------------------------- assets --
def make_background(size: int = 1024) -> Image.Image:
    """Adaptive Icon 背景: 深緑のごく緩いグラデーション。"""
    return gradient_bg(size).convert("RGB")


def make_icon(size: int = 1024) -> Image.Image:
    """アプリ全体のアイコン: 深緑背景 + オオハシ + 薄い方位リング。"""
    img = gradient_bg(size)
    img = _paste(
        img,
        ring_layer(
            size,
            CREAM,
            stroke=RING_STROKE,
            radius=RING_RADIUS,
            alpha=0.14,
            north_alpha=0.44,
        ),
    )
    img = _paste(img, _bird(size, BIRD_ICON_H))
    return img.convert("RGB")


def make_foreground(size: int = 1024) -> Image.Image:
    """Adaptive Icon 前景: 透過 / オオハシのみ / 中央 66% セーフゾーン内。"""
    return _bird(size, BIRD_SAFE_H)


def make_monochrome(size: int = 1024) -> Image.Image:
    """テーマアイコン用: 透過 / オオハシ形状の白一色。"""
    return _bird(size, BIRD_SAFE_H, fill_override=WHITE_HEX)


def make_splash(size: int = 1024) -> Image.Image:
    """スプラッシュ: 透過 / オオハシ + 方位リング（背景は app.json 既定に任せる）。"""
    layer = ring_layer(
        size,
        DEEP_GREEN,
        stroke=RING_STROKE,
        radius=RING_RADIUS,
        alpha=0.30,
        north_alpha=0.60,
    )
    return _paste(layer, _bird(size, BIRD_ICON_H))


def make_favicon(size: int = 48) -> Image.Image:
    """Web 用の小型アイコン: 深緑背景 + オオハシ（リングなし）。"""
    img = gradient_bg(size)
    img = _paste(img, _bird(size, BIRD_FAVICON_H, ss=16))
    return img.convert("RGB")


# ------------------------------------------------------------------ main --
def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    outputs = [
        ("icon.png", make_icon(1024), "RGB"),
        ("android-icon-foreground.png", make_foreground(1024), "RGBA"),
        ("android-icon-background.png", make_background(1024), "RGB"),
        ("android-icon-monochrome.png", make_monochrome(1024), "RGBA"),
        ("splash-icon.png", make_splash(1024), "RGBA"),
        ("favicon.png", make_favicon(48), "RGB"),
    ]

    for name, img, mode in outputs:
        path = ASSETS / name
        img.convert(mode).save(path, format="PNG", optimize=True)
        print(f"generated {path.relative_to(ROOT)}  {img.width}x{img.height} {mode}")


if __name__ == "__main__":
    main()
