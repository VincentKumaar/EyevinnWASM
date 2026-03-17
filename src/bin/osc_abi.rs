use std::io::{self, Read, Write};

use base64::Engine;
use serde::Deserialize;
use serde_json::json;

#[path = "../image_ops.rs"]
mod image_ops;

use image_ops::{pixelate_to_png, PixelateOptions};

const DEFAULT_PIXEL_SIZE: u32 = 8;
const DEFAULT_COLOR_LEVELS: u8 = 4;

#[derive(Debug, Deserialize)]
struct OscRequest {
    action: Option<String>,
    image_base64: Option<String>,
    pixel_size: Option<u32>,
    color_levels: Option<u8>,
}

fn main() {
    let mut input = Vec::new();
    if let Err(err) = io::stdin().read_to_end(&mut input) {
        let _ = io::stdout().write_all(error_json(&format!("stdin read failed: {err}")).as_bytes());
        return;
    }

    let response = handle_request(&input);
    if let Err(err) = io::stdout().write_all(&response) {
        let _ = writeln!(io::stderr(), "stdout write failed: {err}");
    }
}

fn handle_request(body: &[u8]) -> Vec<u8> {
    if body.is_empty() {
        return json!({ "status": "ok", "mode": "osc-wasi-stdin" })
            .to_string()
            .into_bytes();
    }

    if looks_like_json(body) {
        return handle_json(body);
    }

    let options = PixelateOptions {
        pixel_size: DEFAULT_PIXEL_SIZE,
        color_levels: DEFAULT_COLOR_LEVELS,
    };

    process_image(body, options)
}

fn handle_json(body: &[u8]) -> Vec<u8> {
    let payload: OscRequest = match serde_json::from_slice(body) {
        Ok(payload) => payload,
        Err(err) => return error_json(&format!("invalid JSON body: {err}")).into_bytes(),
    };

    if payload.action.as_deref() == Some("health") {
        return json!({ "status": "ok", "mode": "osc-wasi-stdin" })
            .to_string()
            .into_bytes();
    }

    let options = match build_options(payload.pixel_size, payload.color_levels) {
        Ok(options) => options,
        Err(err) => return error_json(&err).into_bytes(),
    };

    let encoded_image = match payload.image_base64 {
        Some(value) => value,
        None => {
            return error_json(
                "JSON mode requires image_base64 or action=health. For raw upload, send image bytes directly.",
            )
            .into_bytes()
        }
    };

    let image_bytes = match base64::engine::general_purpose::STANDARD.decode(encoded_image.as_bytes()) {
        Ok(image) => image,
        Err(err) => return error_json(&format!("image_base64 decode failed: {err}")).into_bytes(),
    };

    process_image(&image_bytes, options)
}

fn process_image(image_bytes: &[u8], options: PixelateOptions) -> Vec<u8> {
    match pixelate_to_png(image_bytes, options) {
        Ok(png) => json!({
            "status": "ok",
            "image_base64": base64::engine::general_purpose::STANDARD.encode(png)
        })
        .to_string()
        .into_bytes(),
        Err(err) => error_json(&format!("image processing failed: {err}")).into_bytes(),
    }
}

fn build_options(pixel_size: Option<u32>, color_levels: Option<u8>) -> Result<PixelateOptions, String> {
    let pixel_size = pixel_size.unwrap_or(DEFAULT_PIXEL_SIZE);
    let color_levels = color_levels.unwrap_or(DEFAULT_COLOR_LEVELS);

    if !(2..=64).contains(&pixel_size) {
        return Err("pixel_size must be between 2 and 64".to_string());
    }

    if !(2..=8).contains(&color_levels) {
        return Err("color_levels must be between 2 and 8".to_string());
    }

    Ok(PixelateOptions {
        pixel_size,
        color_levels,
    })
}

fn looks_like_json(body: &[u8]) -> bool {
    body.iter()
        .find(|byte| !byte.is_ascii_whitespace())
        .is_some_and(|byte| *byte == b'{')
}

fn error_json(message: &str) -> String {
    json!({ "error": message }).to_string()
}
