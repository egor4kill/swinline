import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def draw_pig(draw, cx, cy, r):
    # Ears
    ear_w = r * 0.45
    ear_h = r * 0.7
    # Left ear
    draw.polygon([
        (cx - r * 0.75, cy - r * 0.3),
        (cx - r * 0.55, cy - r * 0.95),
        (cx - r * 0.1, cy - r * 0.45)
    ], fill=(255, 125, 167), outline=(224, 84, 132))
    draw.polygon([
        (cx - r * 0.65, cy - r * 0.4),
        (cx - r * 0.52, cy - r * 0.8),
        (cx - r * 0.22, cy - r * 0.48)
    ], fill=(255, 184, 204))

    # Right ear
    draw.polygon([
        (cx + r * 0.75, cy - r * 0.3),
        (cx + r * 0.55, cy - r * 0.95),
        (cx + r * 0.1, cy - r * 0.45)
    ], fill=(255, 125, 167), outline=(224, 84, 132))
    draw.polygon([
        (cx + r * 0.65, cy - r * 0.4),
        (cx + r * 0.52, cy - r * 0.8),
        (cx + r * 0.22, cy - r * 0.48)
    ], fill=(255, 184, 204))

    # Head
    draw.ellipse([cx - r, cy - r * 0.85, cx + r, cy + r * 0.85], fill=(255, 182, 201), outline=(232, 133, 160), width=max(2, int(r * 0.04)))

    # Cheeks
    cheek_r = r * 0.16
    draw.ellipse([cx - r * 0.65 - cheek_r, cy + r * 0.08 - cheek_r*0.6, cx - r * 0.65 + cheek_r, cy + r * 0.08 + cheek_r*0.6], fill=(255, 77, 121, 160))
    draw.ellipse([cx + r * 0.65 - cheek_r, cy + r * 0.08 - cheek_r*0.6, cx + r * 0.65 + cheek_r, cy + r * 0.08 + cheek_r*0.6], fill=(255, 77, 121, 160))

    # Eyes
    eye_x = r * 0.38
    eye_y = cy - r * 0.2
    eye_r = r * 0.12
    draw.ellipse([cx - eye_x - eye_r, eye_y - eye_r, cx - eye_x + eye_r, eye_y + eye_r], fill=(15, 17, 24))
    draw.ellipse([cx + eye_x - eye_r, eye_y - eye_r, cx + eye_x + eye_r, eye_y + eye_r], fill=(15, 17, 24))
    # Eye highlights
    hl_r = eye_r * 0.38
    draw.ellipse([cx - eye_x - hl_r*0.5, eye_y - hl_r*1.4, cx - eye_x + hl_r*1.1, eye_y - hl_r*0.2], fill=(255, 255, 255))
    draw.ellipse([cx + eye_x - hl_r*0.5, eye_y - hl_r*1.4, cx + eye_x + hl_r*1.1, eye_y - hl_r*0.2], fill=(255, 255, 255))

    # Eyebrows
    bw = max(2, int(r * 0.06))
    draw.line([(cx - r * 0.5, cy - r * 0.38), (cx - r * 0.24, cy - r * 0.32)], fill=(51, 20, 31), width=bw)
    draw.line([(cx + r * 0.5, cy - r * 0.38), (cx + r * 0.24, cy - r * 0.32)], fill=(51, 20, 31), width=bw)

    # Snout
    snout_w = r * 0.44
    snout_h = r * 0.32
    snout_y = cy + r * 0.22
    draw.ellipse([cx - snout_w, snout_y - snout_h, cx + snout_w, snout_y + snout_h], fill=(255, 125, 167), outline=(224, 84, 132), width=max(1, int(r * 0.03)))

    # Nostrils
    nos_x = r * 0.15
    nos_w = r * 0.07
    nos_h = r * 0.12
    draw.ellipse([cx - nos_x - nos_w, snout_y - nos_h, cx - nos_x + nos_w, snout_y + nos_h], fill=(102, 20, 42))
    draw.ellipse([cx + nos_x - nos_w, snout_y - nos_h, cx + nos_x + nos_w, snout_y + nos_h], fill=(102, 20, 42))

def create_favicon(size, filename):
    scale = 4
    dim = size * scale
    img = Image.new('RGBA', (dim, dim), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    pad = int(dim * 0.04)
    radius = int(dim * 0.26)
    draw.rounded_rectangle([pad, pad, dim - pad, dim - pad], radius=radius, fill=(18, 22, 32), outline=(255, 85, 0), width=int(dim * 0.045))

    # Pig in center
    draw_pig(draw, dim // 2, int(dim * 0.52), int(dim * 0.36))

    out = img.resize((size, size), Image.Resampling.LANCZOS)
    out.save(filename, 'PNG')
    print(f"Generated {filename} ({size}x{size})")

def create_og_banner():
    W, H = 1200, 630
    scale = 2
    sw, sh = W * scale, H * scale
    img = Image.new('RGB', (sw, sh), (11, 14, 20))
    draw = ImageDraw.Draw(img)

    # Radial orange glow in top right
    glow_center_x, glow_center_y = int(sw * 0.78), int(sh * 0.35)
    for rad in range(int(sw * 0.65), 0, -20):
        alpha = int(24 * (1 - rad / (sw * 0.65)))
        draw.ellipse([glow_center_x - rad, glow_center_y - rad, glow_center_x + rad, glow_center_y + rad], fill=(11 + int(alpha * 2.2), 14 + int(alpha * 0.8), 20))

    # Subtle grid lines
    grid_color = (20, 26, 38)
    for x in range(0, sw, 80 * scale):
        draw.line([(x, 0), (x, sh)], fill=grid_color, width=1)
    for y in range(0, sh, 80 * scale):
        draw.line([(0, y), (sw, y)], fill=grid_color, width=1)

    font_huge = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 64 * scale)
    font_large = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 36 * scale)
    font_med = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 24 * scale)
    font_small = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 18 * scale)

    # Top Brand Pill
    pill_x = 70 * scale
    pill_y = 65 * scale
    draw.rounded_rectangle([pill_x, pill_y, pill_x + 360 * scale, pill_y + 60 * scale], radius=30 * scale, fill=(24, 30, 44), outline=(255, 85, 0), width=3 * scale)
    draw_pig(draw, pill_x + 35 * scale, pill_y + 30 * scale, 18 * scale)
    draw.text((pill_x + 65 * scale, pill_y + 11 * scale), "SVINLINE", fill=(255, 255, 255), font=font_large)
    draw.text((pill_x + 230 * scale, pill_y + 11 * scale), "BET", fill=(255, 85, 0), font=font_large)

    # Tag next to pill
    draw.rounded_rectangle([pill_x + 380 * scale, pill_y + 10 * scale, pill_x + 720 * scale, pill_y + 50 * scale], radius=20 * scale, fill=(255, 85, 0, 40), outline=(255, 85, 0))
    draw.text((pill_x + 400 * scale, pill_y + 16 * scale), "ОФИЦИАЛЬНАЯ ПЛАТФОРМА", fill=(255, 140, 0), font=font_small)

    # Hero Title
    title_y = 155 * scale
    draw.text((70 * scale, title_y), "SVINLINE", fill=(255, 255, 255), font=font_huge)
    draw.text((70 * scale + 380 * scale, title_y), "ДЕЛАЕТ РАЗНИЦУ", fill=(255, 85, 0), font=font_huge)

    # Subtitle
    sub_y = 245 * scale
    draw.text((70 * scale, sub_y), "Свин-Лига РПЛ • Live-исходы • Хряк-Крэш 24/7 • Корыто Фортуны", fill=(160, 175, 200), font=font_med)

    # Feature Badges
    badges = [
        ("🔥 Свин-Лига РПЛ", (255, 85, 0)),
        ("🚀 Хряк-Крэш 24/7 (Мультиплеер)", (16, 185, 129)),
        ("🎡 Корыто Фортуны", (245, 158, 11)),
        ("🟣 Вход через Twitch", (145, 70, 255))
    ]

    bx = 70 * scale
    by = 330 * scale
    for text, color in badges:
        bbox = font_small.getbbox(text)
        bw = (bbox[2] - bbox[0]) + 40 * scale
        draw.rounded_rectangle([bx, by, bx + bw, by + 48 * scale], radius=12 * scale, fill=(20, 26, 38), outline=color, width=2 * scale)
        draw.text((bx + 20 * scale, by + 12 * scale), text, fill=(255, 255, 255), font=font_small)
        bx += bw + 16 * scale

    # Bottom Bonus Banner
    bonus_y = 425 * scale
    draw.rounded_rectangle([70 * scale, bonus_y, sw - 70 * scale, bonus_y + 130 * scale], radius=20 * scale, fill=(22, 28, 42), outline=(255, 85, 0), width=2 * scale)
    draw.text((105 * scale, bonus_y + 24 * scale), "🎁 СТАРТОВЫЙ БОНУС 10 000 SV₽ КАЖДОМУ ИГРОКУ", fill=(255, 215, 0), font=font_large)
    draw.text((105 * scale, bonus_y + 76 * scale), "Играй онлайн • Побеждай в общих раундах • Забирай иксы в прямом эфире", fill=(180, 195, 220), font=font_small)

    # Big Giant Mascot on right side
    mascot_x = sw - 230 * scale
    mascot_y = 230 * scale
    # Outer glow behind mascot
    draw.ellipse([mascot_x - 170 * scale, mascot_y - 170 * scale, mascot_x + 170 * scale, mascot_y + 170 * scale], fill=(255, 85, 0, 30))
    draw_pig(draw, mascot_x, mascot_y, 135 * scale)

    out = img.resize((W, H), Image.Resampling.LANCZOS)
    out.save("public/og-image.png", "PNG")
    print("Generated public/og-image.png (1200x630)")

if __name__ == '__main__':
    create_favicon(64, 'public/favicon.png')
    create_favicon(32, 'public/favicon-32x32.png')
    create_favicon(180, 'public/apple-touch-icon.png')
    create_og_banner()
