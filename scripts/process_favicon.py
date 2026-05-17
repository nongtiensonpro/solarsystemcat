import os
import glob
from PIL import Image

def main():
    brain_dir = r"C:\Users\nongt\.gemini\antigravity\brain\f959ad8e-8290-4635-9860-b70b531bdd07"
    pattern = os.path.join(brain_dir, "yellow_cat_space_favicon*.png")
    matching_files = glob.glob(pattern)
    
    if not matching_files:
        print(f"Error: No generated image found in {brain_dir} matching {pattern}")
        return
    
    # Get the latest one if multiple exist
    latest_img_path = max(matching_files, key=os.path.getmtime)
    print(f"Processing image: {latest_img_path}")
    
    try:
        img = Image.open(latest_img_path)
        
        # Ensure public directory exists
        public_dir = r"d:\solarsystemcat\public"
        os.makedirs(public_dir, exist_ok=True)
        
        # Save as PNG
        png_path = os.path.join(public_dir, "favicon.png")
        img_resized_png = img.resize((512, 512), Image.Resampling.LANCZOS)
        img_resized_png.save(png_path, "PNG")
        print(f"Saved favicon.png to {png_path}")
        
        # Save as ICO with multiple sizes (16x16, 32x32, 48x48, 64x64, 128x128)
        ico_path = os.path.join(public_dir, "favicon.ico")
        img.save(
            ico_path, 
            format="ICO", 
            sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128)]
        )
        print(f"Saved favicon.ico to {ico_path}")
        
    except Exception as e:
        print(f"Error processing image: {e}")

if __name__ == "__main__":
    main()
