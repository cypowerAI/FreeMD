#!/usr/bin/env python3
"""Generate the FreeMD app icon from a source illustration.

- flood-fills the outer near-white background into transparency (interior
  whites such as teeth and book pages are preserved)
- trims to the artwork, adds a small margin, centres it on a square canvas
- writes build/icon.png (1024x1024 RGBA) and build/icon.icns (PNG-based, for macOS)

Usage: python scripts/gen-icon.py "path/to/source.jpg"
"""
import sys
import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_PNG = ROOT / "build" / "icon.png"
OUT_ICNS = ROOT / "build" / "icon.icns"

SIZE = 1024
MARGIN_RATIO = 0.06  # padding around the artwork, relative to the icon size


def remove_background(img: Image.Image) -> Image.Image:
    """Flood-fill near-white pixels reachable from the border into transparency."""
    rgb = img.convert("RGB")
    marked = rgb.copy()
    marker = (255, 0, 255)
    w, h = rgb.size

    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    seeds += [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)]
    seeds += [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]

    for seed in seeds:
        try:
            ImageDraw.floodfill(marked, seed, marker, thresh=48)
        except Exception:
            pass

    out = rgb.convert("RGBA")
    px = out.load()
    mp = marked.load()
    for y in range(h):
        for x in range(w):
            p = mp[x, y]
            if p[0] > 250 and p[1] < 8 and p[2] > 250:
                px[x, y] = (0, 0, 0, 0)
    return out


def square_icon(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    side = max(w, h)
    margin = int(side * MARGIN_RATIO)
    canvas_side = side + margin * 2
    canvas = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    canvas.paste(img, ((canvas_side - w) // 2, (canvas_side - h) // 2), img)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def write_icns(png_path: Path, icns_path: Path) -> None:
    """Minimal ICNS writer: embeds PNG payloads for every size macOS asks for."""
    base = Image.open(png_path)
    chunks = []
    # icns type -> pixel size
    types = {
        b"ic07": 128,
        b"ic08": 256,
        b"ic09": 512,
        b"ic10": 1024,
        b"ic11": 64,
        b"ic12": 128,
        b"ic13": 256,
        b"ic14": 512,
        b"ic04": 32,
    }
    for code, size in types.items():
        buf = png_path.parent / f".icns-{size}.png"
        base.resize((size, size), Image.LANCZOS).save(buf, format="PNG")
        data = buf.read_bytes()
        chunks.append(code + struct.pack(">I", len(data) + 8) + data)
        buf.unlink()

    body = b"".join(chunks)
    icns_path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: python scripts/gen-icon.py <source image>")
    src = Image.open(sys.argv[1])
    icon = square_icon(remove_background(src))
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    icon.save(OUT_PNG, format="PNG")
    write_icns(OUT_PNG, OUT_ICNS)
    print(f"icon.png  {OUT_PNG}  {icon.size[0]}x{icon.size[1]}")
    print(f"icon.icns {OUT_ICNS}  {OUT_ICNS.stat().st_size} bytes")


if __name__ == "__main__":
    main()
