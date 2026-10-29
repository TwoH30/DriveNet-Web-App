
from PIL import Image

# Fichier source du logo
logo = Image.open("DriveNet_Icon.png").convert("RGBA")

# Fond transparent
for size in (192, 512):
    # Icônes classiques : logo sur toute la surface
    icon = logo.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(f"icon-{size}.png")

    # Icônes maskable : marge de sécurité de 20 %
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    margin = round(size * 0.20)
    inner_size = size - 2 * margin

    maskable_logo = logo.copy()
    maskable_logo.thumbnail(
        (inner_size, inner_size),
        Image.Resampling.LANCZOS
    )

    x = (size - maskable_logo.width) // 2
    y = (size - maskable_logo.height) // 2
    canvas.alpha_composite(maskable_logo, (x, y))

    canvas.save(f"icon-maskable-{size}.png")

print("Les quatre icônes ont été créées.")
