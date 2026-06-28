"""Generate PNG app icons (teal card with bar-chart + R coin). Run once; safe to re-run."""
from PIL import Image, ImageDraw, ImageFont

TEAL = (15, 118, 110, 255)
WHITE = (255, 255, 255, 255)


def font(size):
    for name in ("segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make(px):
    s = 512
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s, s], radius=112, fill=TEAL)
    # three bars
    bars = [(150, 250), (256, 190), (362, 300)]
    for x, top in bars:
        d.line([(x, 370), (x, top)], fill=WHITE, width=34)
        d.ellipse([x - 17, 370 - 17, x + 17, 370 + 17], fill=WHITE)
        d.ellipse([x - 17, top - 17, x + 17, top + 17], fill=WHITE)
    # coin
    d.ellipse([304, 112, 420, 228], fill=WHITE)
    f = font(72)
    d.text((362, 170), "R", font=f, fill=TEAL, anchor="mm")
    return img.resize((px, px), Image.LANCZOS)


for px in (192, 512, 180):
    make(px).save(f"icon-{px}.png")
    print(f"wrote icon-{px}.png")
