#!/usr/bin/env python3
"""Generate the extension toolbar/store icons.

Reproduces the dashboard brand mark: the lucide "Target" glyph (three
concentric circles) in off-white on a near-black rounded tile — the exact
treatment from the app-shell sidebar (bg-foreground #0C0D14 tile, background
#F8F7F4 icon, strokeWidth 2). Rendered once at high resolution and downscaled
with LANCZOS so 16px stays crisp.
Run: python3 scripts/make-icon.py
Outputs public/icons/icon{16,48,128}.png (overwriting the placeholders).
"""
import os
from PIL import Image, ImageDraw

S = 512                       # supersampled master size
BG = (12, 13, 20, 255)        # #0C0D14  --foreground tile
RING = (248, 247, 244, 255)   # #F8F7F4  --background rings
RADIUS = int(S * 0.22)
MARGIN = 4                    # px (at master scale) so the outer stroke isn't clipped

# lucide "target" keeps circles at r=10/6/2 with strokeWidth 2 (24-unit viewBox).
# Scale that ratio up so the OUTER edge of the outer ring (r + stroke/2 = 11 units)
# lands on the tile edge — the glyph fills the box with no padding.
UNIT = (S / 2 - MARGIN) / 11
CX = CY = S / 2
R_OUTER, R_MID, R_INNER = 10 * UNIT, 6 * UNIT, 2 * UNIT
STROKE = int(round(2 * UNIT))


def ring(d: ImageDraw.ImageDraw, r: float) -> None:
    d.ellipse([CX - r, CY - r, CX + r, CY + r], outline=RING, width=STROKE)


def render() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=RADIUS, fill=BG)
    ring(d, R_OUTER)
    ring(d, R_MID)
    # innermost dot: r=2 with strokeWidth 2 reads as a solid centre point
    d.ellipse([CX - R_INNER, CY - R_INNER, CX + R_INNER, CY + R_INNER], fill=RING)
    return img


def main() -> None:
    master = render()
    out = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
    os.makedirs(out, exist_ok=True)
    for size in (16, 48, 128):
        master.resize((size, size), Image.LANCZOS).save(
            os.path.join(out, f"icon{size}.png")
        )
        print(f"wrote icon{size}.png")


if __name__ == "__main__":
    main()
