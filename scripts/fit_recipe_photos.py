"""Resize generated recipe photos to 1200x900 JPEG."""
from pathlib import Path

from PIL import Image

ASSETS = Path(r"C:\Users\Savkin.M\.cursor\projects\c-Users-Savkin-M-Desktop-CURSOR-DevProjects\assets")
DEST = Path(__file__).resolve().parent.parent / "img" / "recipes"
NAMES = [
    "ham-cheese-sandwich",
    "chicken-burger",
    "ham-pesto-panini",
    "pasta-flotski",
    "tefteli",
    "baked-pink-salmon",
    "duck-veg-stew",
    "duck-plov",
    "trout-veg",
    "veg-ragu-chicken",
    "baked-chicken-potato-garlic",
    "salad-caesar",
    "salad-vinegret",
    "salad-vegetable",
    "salad-greek",
    "salad-korean-carrot",
    "salad-apple",
    "salad-olivier",
    "salad-beet-apple",
    "salad-cabbage",
    "salad-tomato-cheese",
    "salad-cucumber-egg",
    "salad-pear-cheese",
    "salad-beet-nuts",
    "salad-potato",
    "salad-chicken",
    "salad-mimosa",
    "salad-pepper-tomato",
    "salad-pumpkin-apple",
    "salad-zucchini",
    "salad-tvorog",
]
W, H = 1200, 900


def fit(im: Image.Image) -> Image.Image:
    im = im.convert("RGB")
    src_w, src_h = im.size
    scale = max(W / src_w, H / src_h)
    nw, nh = int(src_w * scale), int(src_h * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - W) // 2
    top = (nh - H) // 2
    return im.crop((left, top, left + W, top + H))


missing = []
for name in NAMES:
    src = ASSETS / f"{name}.jpg"
    if not src.exists():
        png = ASSETS / f"{name}.png"
        src = png if png.exists() else src
    if not src.exists():
        missing.append(name)
        continue
    out = DEST / f"{name}.jpg"
    fit(Image.open(src)).save(out, "JPEG", quality=86, optimize=True)
    print("ok", out.name, out.stat().st_size)

if missing:
    raise SystemExit("missing: " + ", ".join(missing))
print("done", len(NAMES))
