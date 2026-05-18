import os
import math
import random
from PIL import Image, ImageDraw, ImageFilter

def generate_fractal_noise(width, height, octaves=4, base_blur=1.5):
    """Tạo noise phân mảnh (fractal noise) bằng cách xếp chồng các lớp nhiễu được làm mịn."""
    combined_img = Image.new('L', (width, height), 128)
    combined_pixels = combined_img.load()
    
    for octave in range(octaves):
        scale = 2 ** octave
        w = max(4, width // scale)
        h = max(2, height // scale)
        
        octave_img = Image.new('L', (w, h))
        octave_pixels = octave_img.load()
        for y in range(h):
            for x in range(w):
                octave_pixels[x, y] = random.randint(0, 255)
        
        # Phóng to và làm mịn lớp nhiễu này
        octave_img = octave_img.resize((width, height), Image.Resampling.BICUBIC)
        octave_img = octave_img.filter(ImageFilter.GaussianBlur(radius=base_blur * (scale * 0.5)))
        
        # Trộn lớp nhiễu vào hình ảnh tổng hợp với trọng số giảm dần
        weight = 0.5 ** octave
        for y in range(height):
            for x in range(width):
                current = combined_pixels[x, y]
                noise_val = octave_img.getpixel((x, y))
                combined_pixels[x, y] = int(current * (1 - weight) + noise_val * weight)
                
    return combined_img

def draw_crater(draw_albedo, draw_bump, cx, cy, r, is_dark_ejecta=False):
    """Vẽ hố va chạm với cấu trúc địa chất thực tế: lòng sâu, vành cao, và quầng ejecta sáng/tối xung quanh."""
    # 1. Quầng ejecta bắn ra (vùng sáng/tối xung quanh hố va chạm)
    ejecta_r = r * random.uniform(1.8, 3.0)
    for dr in range(int(ejecta_r), r, -1):
        opacity = int(45 * (1.0 - (dr - r) / (ejecta_r - r)))
        color = (30, 25, 20, opacity) if is_dark_ejecta else (230, 220, 210, opacity)
        draw_albedo.ellipse([cx - dr, cy - dr, cx + dr, cy + dr], fill=color)

    # 2. Vành hố va chạm (nổi lên trên bề mặt -> Bump sáng)
    rim_r_outer = r * 1.05
    rim_r_inner = r * 0.95
    draw_bump.ellipse([cx - rim_r_outer, cy - rim_r_outer, cx + rim_r_outer, cy + rim_r_outer], fill=180)
    draw_bump.ellipse([cx - rim_r_inner, cy - rim_r_inner, cx + rim_r_inner, cy + rim_r_inner], fill=128)

    # 3. Lòng chảo hố va chạm (sâu xuống -> Bump tối)
    draw_bump.ellipse([cx - rim_r_inner, cy - rim_r_inner, cx + rim_r_inner, cy + rim_r_inner], fill=70)
    
    # Bóng đổ trong hố va chạm (phần tối ở một bên lòng hố)
    shadow_offset = int(r * 0.2)
    draw_albedo.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(45, 40, 35, 120))
    draw_albedo.ellipse([cx - r + shadow_offset, cy - r + shadow_offset, cx + r + shadow_offset, cy + r + shadow_offset], fill=(95, 90, 85, 40))

def create_phobos_textures(width=1024, height=512):
    print("Generating high-quality Phobos textures...")
    
    # 1. Base noises
    noise_albedo = generate_fractal_noise(width, height, octaves=4, base_blur=1.2)
    noise_bump = generate_fractal_noise(width, height, octaves=4, base_blur=1.0)
    
    # 2. Setup images
    # Phobos: Màu xám nâu tối, chondrite carbon loại C
    albedo = Image.new('RGB', (width, height))
    bump = Image.new('L', (width, height), 128)
    
    albedo_pixels = albedo.load()
    bump_pixels = bump.load()
    
    # Trộn màu cơ bản của Phobos dựa trên noise
    for y in range(height):
        for x in range(width):
            na = noise_albedo.getpixel((x, y)) / 255.0
            nb = noise_bump.getpixel((x, y))
            
            # Tông màu xám nâu nhạt pha sẫm phong hóa không gian (Space Weathering)
            r = int(75 + na * 35)
            g = int(67 + na * 30)
            b = int(58 + na * 26)
            
            albedo_pixels[x, y] = (r, g, b)
            bump_pixels[x, y] = int(nb * 0.45 + 70) # Nén dải bump cơ bản

    # 3. Vẽ các rãnh đứt gãy song song (Parallel grooves / striations) đặc trưng của Phobos
    # Các rãnh này có nguồn gốc từ vụ va chạm tạo ra Stickney crater
    albedo_draw = ImageDraw.Draw(albedo, 'RGBA')
    bump_draw = ImageDraw.Draw(bump)
    
    num_grooves = 35
    for i in range(num_grooves):
        # Đường thẳng cắt xiên nhẹ qua bề mặt bản đồ phẳng
        y_start = random.randint(-100, height + 100)
        slope = random.uniform(-0.15, 0.15)
        width_groove = random.randint(2, 6)
        
        # Vẽ rãnh đứt gãy bằng cách perturb tọa độ theo chiều ngang
        points = []
        for x in range(0, width, 8):
            # Tính y lý thuyết và dịch chuyển nhẹ theo nhiễu cục bộ để tạo độ tự nhiên
            y_ideal = y_start + slope * x
            y_perturbed = y_ideal + math.sin(x * 0.05 + i) * 3.0
            points.append((x, y_perturbed))
            
        # Vẽ lên Albedo (rãnh màu tối sẫm) và Bump (rãnh lõm xuống)
        albedo_draw.line(points, fill=(45, 40, 35, 60), width=width_groove)
        bump_draw.line(points, fill=95, width=width_groove)
        
    # Làm mịn nhẹ các rãnh trên bump để không bị sắc cạnh răng cưa
    bump = bump.filter(ImageFilter.GaussianBlur(radius=1.0))
    albedo_draw = ImageDraw.Draw(albedo, 'RGBA')
    bump_draw = ImageDraw.Draw(bump)

    # 4. Vẽ Stickney crater khổng lồ (rộng 9 km trên tổng số 22 km của Phobos!)
    # Tọa độ trung tâm Stickney (khoảng 30% chiều dài, 50% chiều cao)
    draw_crater(albedo_draw, bump_draw, int(width * 0.35), int(height * 0.5), r=75, is_dark_ejecta=True)
    
    # 5. Vẽ thêm các hố va chạm vừa và nhỏ ngẫu nhiên khác
    for _ in range(25):
        cx = random.randint(0, width)
        cy = random.randint(20, height - 20)
        r = random.randint(8, 24)
        draw_crater(albedo_draw, bump_draw, cx, cy, r, is_dark_ejecta=(random.random() < 0.25))
        
    # Rất nhiều hố va chạm cực nhỏ (micrometeorite craters) tạo độ nhám bề mặt hoàn hảo
    for _ in range(120):
        cx = random.randint(0, width)
        cy = random.randint(10, height - 10)
        r = random.randint(1, 4)
        bump_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=85)
        albedo_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(220, 210, 200, 70))

    # 6. Lưu file chất lượng cao
    os.makedirs('public/textures/planets/phobos', exist_ok=True)
    albedo.save('public/textures/planets/phobos/albedo.jpg', 'JPEG', quality=95)
    bump.save('public/textures/planets/phobos/bump.jpg', 'JPEG', quality=95)
    print("Phobos textures generated successfully.")

def create_deimos_textures(width=1024, height=512):
    print("Generating high-quality Deimos textures...")
    
    # 1. Base noises
    noise_albedo = generate_fractal_noise(width, height, octaves=4, base_blur=2.5) # Trơn nhẵn hơn
    noise_bump = generate_fractal_noise(width, height, octaves=4, base_blur=2.0)
    
    # 2. Setup images
    # Deimos: Màu hơi đỏ sẫm hơn Phobos một chút, bề mặt cực kỳ nhẵn nhụi do lớp regolith dày che lấp miệng hố
    albedo = Image.new('RGB', (width, height))
    bump = Image.new('L', (width, height), 128)
    
    albedo_pixels = albedo.load()
    bump_pixels = bump.load()
    
    for y in range(height):
        for x in range(width):
            na = noise_albedo.getpixel((x, y)) / 255.0
            nb = noise_bump.getpixel((x, y))
            
            # Tông màu đỏ nâu sẫm, ấm hơn Phobos một chút
            r = int(82 + na * 30)
            g = int(72 + na * 25)
            b = int(63 + na * 22)
            
            albedo_pixels[x, y] = (r, g, b)
            bump_pixels[x, y] = int(nb * 0.25 + 95) # Bump cực kỳ nông để thể hiện bề mặt trơn nhẵn

    # 3. Tạo hình miệng hố
    albedo_draw = ImageDraw.Draw(albedo, 'RGBA')
    bump_draw = ImageDraw.Draw(bump)
    
    # Miệng hố va chạm trên Deimos ít hơn, nhỏ hơn và trơn nhẵn (nông) hơn nhiều so với Phobos
    for _ in range(12):
        cx = random.randint(0, width)
        cy = random.randint(20, height - 20)
        r = random.randint(6, 16)
        
        # Vẽ hố trơn (vành thấp và nhạt màu hơn)
        ejecta_r = r * 2.0
        # Quầng sáng màu phấn xung quanh hố va chạm
        albedo_draw.ellipse([cx - ejecta_r, cy - ejecta_r, cx + ejecta_r, cy + ejecta_r], fill=(225, 215, 205, 35))
        bump_draw.ellipse([cx - r * 1.05, cy - r * 1.05, cx + r * 1.05, cy + r * 1.05], fill=145) # Vành thấp
        bump_draw.ellipse([cx - r * 0.95, cy - r * 0.95, cx + r * 0.95, cy + r * 0.95], fill=110) # Lòng nông
        albedo_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(55, 50, 45, 70))

    # Làm mờ mạnh Bump để tạo hiệu ứng phủ bụi mịn regolith cực dày của Deimos
    bump = bump.filter(ImageFilter.GaussianBlur(radius=2.5))
    
    # 4. Lưu file chất lượng cao
    os.makedirs('public/textures/planets/deimos', exist_ok=True)
    albedo.save('public/textures/planets/deimos/albedo.jpg', 'JPEG', quality=95)
    bump.save('public/textures/planets/deimos/bump.jpg', 'JPEG', quality=95)
    print("Deimos textures generated successfully.")

if __name__ == '__main__':
    create_phobos_textures()
    create_deimos_textures()
