#!/usr/bin/env python3
"""オオハシの多色透過 PNG（アプリ内表示用）を生成する.

react-native-svg の new-arch codegen が Windows の 260 文字パス制限で失敗する場合の
回避策として、SVG パス（toucanPaths.ts）と同一の形状・配色を持つ透過 PNG を出力する。
形状は scripts/generate-toucan-svg.py が単一ソース（TOUCAN_PARTS / viewBox 0 0 100 100）。

PNG は viewBox と同じレイアウト（鳥はキャンバスの高さ 88%、水平中央）で描画するため、
`<Svg viewBox="0 0 100 100">` を同サイズの `<Image>` に置き換えても見た目が一致する。

生成物:
    mobile/assets/toucan.png                    1024x1024 RGBA 透過（アプリ内表示用）
    docs/assets/toucan-transparent-preview.png  1024x1024 RGBA 透過（目視確認用・同内容）

実行:
    python scripts/generate-toucan-svg.py   # 先に形状（toucanPaths.ts）を確定
    python scripts/generate-toucan-png.py

描画:
    パーツごとに 4x スーパーサンプリングのアルファマスクを作り、縮小後に単色レイヤーを
    合成する。これにより透明背景側の RGB が黒く混ざる「黒フリンジ」を防ぐ（透過 PNG を
    クリーム/白背景に置いてもエッジが汚れない）。
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TOUCAN_SCRIPT = ROOT / "scripts" / "generate-toucan-svg.py"
OUT_APP = ROOT / "mobile" / "assets" / "toucan.png"
OUT_PREVIEW = ROOT / "docs" / "assets" / "toucan-transparent-preview.png"

SIZE = 1024
SS = 4  # スーパーサンプリング倍率
VIEWBOX = 100.0  # toucanPaths.ts の viewBox
MAX_BYTES = 200 * 1024  # 目安（200KB 以下）


def _load_toucan():
    """scripts/generate-toucan-svg.py をモジュールとして読み込む。"""
    spec = importlib.util.spec_from_file_location("generate_toucan_svg", TOUCAN_SCRIPT)
    if spec is None or spec.loader is None:  # pragma: no cover
        raise ImportError(f"cannot load {TOUCAN_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _to_rgb(color: str) -> tuple[int, int, int]:
    return tuple(int(color[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def render_transparent(size: int = SIZE, ss: int = SS) -> Image.Image:
    """オオハシを透過背景で描画した RGBA 画像を返す（viewBox と同じ配置）。"""
    tc = _load_toucan()
    canvas = size * ss
    unit = canvas / VIEWBOX  # 1 viewBox 単位あたりの px（超サンプリング後）
    bx0, by0, bx1, by1 = tc.NORM_BBOX
    cx, cy = (bx0 + bx1) / 2.0, (by0 + by1) / 2.0

    def tp(p):
        return (canvas / 2.0 + (p[0] - cx) * unit, canvas / 2.0 + (p[1] - cy) * unit)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for part in tc.TOUCAN_PARTS:
        # パーツごとのアルファマスク（4x で描いて縮小 = アンチエイリアス）
        mask = Image.new("L", (canvas, canvas), 0)
        draw = ImageDraw.Draw(mask)
        for poly in tc.flatten_cmds(tc.parse_path(part["d"]), steps=24):
            draw.polygon([tp(p) for p in poly], fill=255)
        alpha = mask.resize((size, size), Image.LANCZOS)

        # 縮小後のアルファに単色を載せる（RGB を混ぜないので黒フリンジが出ない）
        layer = Image.new("RGBA", (size, size), _to_rgb(part["fill"]) + (0,))
        layer.putalpha(alpha)
        out = Image.alpha_composite(out, layer)
    return out


def _report(img: Image.Image, path: Path) -> None:
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    print(f"generated {path.relative_to(ROOT)}  {img.width}x{img.height} RGBA "
          f"({path.stat().st_size / 1024:.1f} KB)")


def main() -> None:
    img = render_transparent()
    OUT_APP.parent.mkdir(parents=True, exist_ok=True)
    OUT_PREVIEW.parent.mkdir(parents=True, exist_ok=True)

    img.save(OUT_APP, format="PNG", optimize=True)
    img.save(OUT_PREVIEW, format="PNG", optimize=True)

    _report(img, OUT_APP)
    _report(img, OUT_PREVIEW)

    # 検証（サイズ・透過・色数・サイズ上限）
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    assert img.size == (SIZE, SIZE), img.size
    assert img.mode == "RGBA", img.mode
    assert alpha.getextrema() == (0, 255)
    assert bbox is not None
    print(f"  alpha bbox: {bbox}  (bird {bbox[2]-bbox[0]}x{bbox[3]-bbox[1]}, "
          f"height ratio {(bbox[3]-bbox[1])/SIZE:.3f})")
    print(f"  alpha corners: {[alpha.getpixel(p) for p in [(0, 0), (SIZE-1, 0), (0, SIZE-1), (SIZE-1, SIZE-1)]]}")
    colors = img.getcolors(maxcolors=1 << 22)
    print(f"  distinct colors: {len(colors)}")
    for path in (OUT_APP, OUT_PREVIEW):
        size = path.stat().st_size
        print(f"  {path.name}: {size / 1024:.1f} KB (limit {MAX_BYTES / 1024:.0f} KB)")
        if size > MAX_BYTES:
            raise SystemExit(f"ERROR: {path.name} が {MAX_BYTES/1024:.0f}KB を超えています")


if __name__ == "__main__":
    main()
