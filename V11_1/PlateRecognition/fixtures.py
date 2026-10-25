"""Synthetic, non-sensitive fixtures; also printable for the webcam demo."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter


def generate():
    root = Path(__file__).parent / 'fixtures'
    root.mkdir(exist_ok=True)
    image = Image.new('RGB', (1000, 300), 'white')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 140)
    draw.text((500, 150), 'ABC-123', font=font, fill='black', anchor='mm')
    image.save(root / 'ABC-123.png')
    Image.new('RGB', (1000, 300), 'white').save(root / 'no-plate.png')
    image.filter(ImageFilter.GaussianBlur(45)).save(root / 'unreadable.png')


if __name__ == '__main__':
    generate()
