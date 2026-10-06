"""Green-screen removal + passport crop for staff photos.
Input : D:/Downloads/staff/*.JPG (6192x3480, green backdrop)
Output: photos/<slug>.jpg  (900x1200, 3:4, neutral light background)
        photos-contact.png (review sheet)
"""
import glob, os, re
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

SRC = "D:/Downloads/staff/*.JPG"
OUT = "photos"; os.makedirs(OUT, exist_ok=True)
BG_TOP, BG_BOT = (246, 246, 246), (222, 224, 228)   # soft studio grey gradient

def slug(n): return re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")

def key_green(rgb):
    """soft alpha: 1 = foreground, 0 = green backdrop. HSV hue key + dominance, tolerant to uneven lighting."""
    r, g, b = [rgb[..., i].astype(np.float32) / 255 for i in range(3)]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    v = mx; s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == g, 60 * ((b - r) / d) + 120, np.where(mx == r, 60 * ((g - b) / d) % 360, 60 * ((r - g) / d) + 240))
    # measured backdrop: hue 142-149, sat .35-.63, val .9-1.0, dominance 47-92 (/255)
    green_hue = np.clip(1 - np.abs(h - 145) / 40, 0, 1)             # 1 at 145deg, 0 beyond +-40deg
    sat_w = np.clip((s - 0.14) / (0.30 - 0.14), 0, 1)               # desaturated = foreground
    val_w = np.clip((v - 0.12) / (0.30 - 0.12), 0, 1)               # very dark = foreground (hair)
    hue_bg = green_hue * sat_w * val_w
    dom = (g - np.maximum(r, b)) * 255
    dom_bg = np.clip((dom - 22) / (55 - 22), 0, 1)                   # green dominance key
    bg = np.maximum(hue_bg, dom_bg)
    a = 1.0 - np.clip((bg - 0.30) / (0.80 - 0.30), 0, 1)
    return a

def despill(rgb, a):
    r, g, b = [rgb[..., i].astype(np.float32) for i in range(3)]
    lim = (r + b) / 2 + 8
    g2 = np.where(g > lim, lim, g)
    edge = (a > 0) & (a < 1)
    g = np.where(edge | (a < 0.98), g2, g)
    return np.stack([r, g, b], -1)

def process(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((2400, 2400), Image.LANCZOS)          # work at ~2400 px wide
    orig = np.asarray(im).copy()
    rgb = np.asarray(im).astype(np.float32)
    a = key_green(rgb)   # mask used ONLY to locate head for framing
    # clean mask: blur slightly for soft edges
    a_img = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    a = np.asarray(a_img).astype(np.float32) / 255
    rgb = despill(rgb, a)
    H, W = a.shape
    # --- person geometry from cleaned hard mask ---
    hard_img = Image.fromarray(((a > 0.7) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
    hard = np.asarray(hard_img) > 127
    rows = hard.sum(1)
    ys = np.where(rows > W * 0.015)[0]; top = int(ys[0])
    ph = H - top
    # head width = largest contiguous run at forehead level (12% down the person)
    def run_at(y):
        row = hard[y]; best = (0, 0, 0); start = None
        for x in range(W + 1):
            on = x < W and row[x]
            if on and start is None: start = x
            if not on and start is not None:
                if x - start > best[0]: best = (x - start, start, x)
                start = None
        return best
    widths = [run_at(top + int(ph * f)) for f in (0.10, 0.14, 0.18)]
    hw, hx0, hx1 = max(widths)
    head_w = hw; cx = (hx0 + hx1) / 2
    # passport framing: head height ~ 1.35 x head width; frame = head top - 9% ... chest
    cw = int(head_w * 2.7); ch = int(cw * 4 / 3)
    x0 = int(cx - cw / 2); y0 = int(top - ch * 0.09)
    x0 = max(0, min(x0, W - cw)); y0 = max(0, min(y0, H - ch))
    if y0 + ch > H: ch = H - y0; cw = int(ch * 3 / 4); x0 = int(cx - cw / 2)
    # --- crop only: original pixels, no keying, no background change ---
    img = Image.fromarray(orig[y0:y0 + ch, x0:x0 + cw]).resize((900, 1200), Image.LANCZOS)
    return img

results = []
for p in sorted(glob.glob(SRC)):
    name = os.path.splitext(os.path.basename(p))[0].strip()
    img = process(p); fn = f"{OUT}/{slug(name)}.jpg"; img.save(fn, quality=94)
    results.append((name, img)); print("ok", fn)

sheet = Image.new("RGB", (len(results) * 320, 440), (60, 60, 60)); d = ImageDraw.Draw(sheet)
for i, (n, img) in enumerate(results):
    t = img.copy(); t.thumbnail((300, 400)); sheet.paste(t, (i * 320 + 10, 30)); d.text((i * 320 + 10, 8), n, fill="white")
sheet.save("photos-contact.png")
