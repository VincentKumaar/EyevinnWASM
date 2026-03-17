use std::io::Cursor;

use anyhow::{Context, Result};
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat, RgbaImage};

#[derive(Debug, Clone, Copy)]
pub struct PixelateOptions {
    pub pixel_size: u32,
    pub color_levels: u8,
}

pub fn pixelate_to_png(image_bytes: &[u8], options: PixelateOptions) -> Result<Vec<u8>> {
    let image = image::load_from_memory(image_bytes)
        .context("unsupported or invalid image format (try PNG/JPEG/WebP)")?;

    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        anyhow::bail!("image has invalid dimensions")
    }

    let down_width = (width / options.pixel_size).max(1);
    let down_height = (height / options.pixel_size).max(1);

    let reduced = image.resize_exact(down_width, down_height, FilterType::Triangle);
    let mut upscaled = reduced.resize_exact(width, height, FilterType::Nearest).to_rgba8();

    quantize_colors(&mut upscaled, options.color_levels);

    let mut png_bytes = Vec::new();
    DynamicImage::ImageRgba8(upscaled)
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .context("failed to encode output as PNG")?;

    Ok(png_bytes)
}

fn quantize_colors(image: &mut RgbaImage, levels: u8) {
    let max_index = u16::from(levels - 1);

    // Map each RGB channel onto a small fixed palette for an 8-bit look.
    for pixel in image.pixels_mut() {
        for channel in 0..3 {
            let original = u16::from(pixel[channel]);
            let bucket = ((original * max_index) + 127) / 255;
            pixel[channel] = ((bucket * 255) / max_index) as u8;
        }
    }
}
