import os
import math
import random
from PIL import Image, ImageDraw

def generate_noise_map(width, height, scale, octaves, persistence, lacunarity):
    # Simple fractal noise generator (since we might not have 'noise' package)
    noise_map = [[0.0 for _ in range(width)] for _ in range(height)]
    
    # We will just generate basic static white noise and blur it as a fallback 
    # to avoid external dependencies like 'noise' or 'perlin_noise'
    from PIL import ImageFilter
    img = Image.new('L', (width // 4, height // 4))
    pixels = img.load()
    for y in range(img.height):
        for x in range(img.width):
            pixels[x, y] = random.randint(0, 255)
    
    img = img.resize((width, height), Image.Resampling.BICUBIC)
    img = img.filter(ImageFilter.GaussianBlur(radius=2))
    return img

def create_callisto_textures(width=1024, height=512):
    # Base color for Callisto (dark brownish gray)
    # Generate some noise for bump and albedo
    base_noise = generate_noise_map(width, height, 100, 4, 0.5, 2.0)
    
    albedo = Image.new('RGB', (width, height))
    bump = Image.new('L', (width, height))
    
    albedo_pixels = albedo.load()
    bump_pixels = bump.load()
    noise_pixels = base_noise.load()
    
    for y in range(height):
        for x in range(width):
            n = noise_pixels[x, y] / 255.0
            
            # Albedo: map noise to brownish/grayish tones
            r = int(60 + n * 40)
            g = int(50 + n * 35)
            b = int(40 + n * 30)
            
            # Add some dark craters randomly
            if random.random() < 0.001:
                crater_r = random.randint(2, 8)
                for cy in range(-crater_r, crater_r):
                    for cx in range(-crater_r, crater_r):
                        if cx*cx + cy*cy < crater_r*crater_r:
                            px = (x + cx) % width
                            py = max(0, min(height-1, y + cy))
                            dist = math.sqrt(cx*cx + cy*cy) / crater_r
                            albedo_pixels[px, py] = (int(r*(0.5+0.5*dist)), int(g*(0.5+0.5*dist)), int(b*(0.5+0.5*dist)))
                            # crater bump
                            bump_pixels[px, py] = int(n * 255 * dist)
            
            # Normal bump
            if albedo_pixels[x, y] == (0,0,0): # not touched by crater
                albedo_pixels[x, y] = (r, g, b)
                bump_pixels[x, y] = int(n * 255)

    os.makedirs('public/textures/planets/callisto', exist_ok=True)
    albedo.save('public/textures/planets/callisto/albedo.jpg', 'JPEG', quality=85)
    bump.save('public/textures/planets/callisto/bump.jpg', 'JPEG', quality=85)
    print("Callisto textures generated.")

def create_titan_textures(width=1024, height=512):
    # Titan is just a hazy orange atmosphere
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    
    for y in range(height):
        for x in range(width):
            # Soft gradient/noise
            noise = random.randint(-5, 5)
            r = min(255, max(0, 210 + noise))
            g = min(255, max(0, 150 + noise))
            b = min(255, max(0, 70 + noise))
            pixels[x, y] = (r, g, b)
            
    # Blur heavily to simulate thick atmosphere
    from PIL import ImageFilter
    img = img.filter(ImageFilter.GaussianBlur(radius=5))
    
    os.makedirs('public/textures/planets/titan', exist_ok=True)
    img.save('public/textures/planets/titan/albedo.jpg', 'JPEG', quality=85)
    print("Titan texture generated.")

if __name__ == '__main__':
    create_callisto_textures()
    create_titan_textures()
