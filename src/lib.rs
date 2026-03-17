mod image_ops;

use anyhow::{Context, Result};
use image_ops::{pixelate_to_png, PixelateOptions};
use serde::Deserialize;
use serde_json::json;
use spin_sdk::http::{HeaderValue, Method, Request, Response};
use spin_sdk::{http, http_component};
use url::Url;

const DEFAULT_PIXEL_SIZE: u32 = 8;
const DEFAULT_COLOR_LEVELS: u8 = 4;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const INDEX_HTML: &str = include_str!("../web/index.html");
const STYLES_CSS: &str = include_str!("../web/styles.css");
const APP_JS: &str = include_str!("../web/app.js");

#[derive(Debug, Deserialize)]
struct PixelateUrlRequest {
    image_url: String,
    pixel_size: Option<u32>,
    color_levels: Option<u8>,
}

#[http_component]
async fn handle(req: Request) -> Result<Response> {
    if req.method() == &Method::Get && req.path() == "/health" {
        return Ok(json_response(200, json!({ "status": "ok" })));
    }

    if req.method() == &Method::Post && req.path() == "/pixelate" {
        return handle_pixelate(req).await;
    }

    if req.method() == &Method::Get {
        if let Some(response) = serve_static(req.path()) {
            return Ok(response);
        }
    }

    Ok(json_response(
        404,
        json!({ "error": "route not found" }),
    ))
}

async fn handle_pixelate(req: Request) -> Result<Response> {
    let body = req.body();
    if body.is_empty() {
        return Ok(json_response(
            400,
            json!({ "error": "request body is empty" }),
        ));
    }

    if body.len() > MAX_IMAGE_BYTES {
        return Ok(json_response(
            413,
            json!({ "error": "image is too large (max 10MB)" }),
        ));
    }

    let query_options = match parse_options_from_query(req.query()) {
        Ok(options) => options,
        Err(err) => return Ok(json_response(400, json!({ "error": err.to_string() }))),
    };
    let content_type = header_string(req.header("content-type"));

    let image_bytes = if content_type.contains("application/json") || looks_like_json(body) {
        let payload: PixelateUrlRequest = match serde_json::from_slice(body) {
            Ok(data) => data,
            Err(err) => {
                return Ok(json_response(
                    400,
                    json!({ "error": format!("invalid JSON body: {err}") }),
                ));
            }
        };

        if let Err(err) = validate_image_url(&payload.image_url) {
            return Ok(json_response(400, json!({ "error": err })));
        }

        let options = match build_options(payload.pixel_size, payload.color_levels) {
            Ok(options) => options,
            Err(err) => return Ok(json_response(400, json!({ "error": err.to_string() }))),
        };
        return process_url_image(&payload.image_url, options).await;
    } else {
        body.to_vec()
    };

    let options = match build_options(query_options.pixel_size, query_options.color_levels) {
        Ok(options) => options,
        Err(err) => return Ok(json_response(400, json!({ "error": err.to_string() }))),
    };
    process_image_bytes(image_bytes, options)
}

async fn process_url_image(url: &str, options: PixelateOptions) -> Result<Response> {
    let outbound_request = Request::get(url).build();
    let outbound_response: Response = match http::send(outbound_request).await {
        Ok(response) => response,
        Err(err) => {
            return Ok(json_response(
                502,
                json!({ "error": format!("failed to fetch image URL: {err}") }),
            ));
        }
    };

    let image_bytes = outbound_response.body().to_vec();
    if image_bytes.is_empty() {
        return Ok(json_response(
            400,
            json!({ "error": "downloaded image from URL is empty" }),
        ));
    }

    if image_bytes.len() > MAX_IMAGE_BYTES {
        return Ok(json_response(
            413,
            json!({ "error": "downloaded image is too large (max 10MB)" }),
        ));
    }

    process_image_bytes(image_bytes, options)
}

fn process_image_bytes(image_bytes: Vec<u8>, options: PixelateOptions) -> Result<Response> {
    match pixelate_to_png(&image_bytes, options) {
        Ok(png) => Ok(Response::builder()
            .status(200)
            .header("content-type", "image/png")
            .body(png)
            .build()),
        Err(err) => Ok(json_response(
            400,
            json!({ "error": format!("image processing failed: {err}") }),
        )),
    }
}

fn json_response(status: u16, body: serde_json::Value) -> Response {
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(body.to_string())
        .build()
}

fn serve_static(path: &str) -> Option<Response> {
    let (content_type, body) = match path {
        "/" | "/index.html" => ("text/html; charset=utf-8", INDEX_HTML.as_bytes().to_vec()),
        "/styles.css" => ("text/css; charset=utf-8", STYLES_CSS.as_bytes().to_vec()),
        "/app.js" => ("application/javascript; charset=utf-8", APP_JS.as_bytes().to_vec()),
        _ => return None,
    };

    Some(
        Response::builder()
            .status(200)
            .header("content-type", content_type)
            .body(body)
            .build(),
    )
}

fn looks_like_json(body: &[u8]) -> bool {
    body.iter()
        .find(|byte| !byte.is_ascii_whitespace())
        .is_some_and(|byte| *byte == b'{')
}

fn header_string(header_value: Option<&HeaderValue>) -> String {
    header_value
        .and_then(HeaderValue::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn validate_image_url(image_url: &str) -> std::result::Result<(), String> {
    let parsed = Url::parse(image_url).map_err(|_| "image_url must be a valid URL".to_string())?;
    match parsed.scheme() {
        "http" | "https" => Ok(()),
        _ => Err("image_url must use http:// or https://".to_string()),
    }
}

fn parse_options_from_query(query: &str) -> Result<RawOptions> {
    let mut options = RawOptions {
        pixel_size: None,
        color_levels: None,
    };

    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        match key.as_ref() {
            "pixel_size" => {
                let parsed = value.parse::<u32>().with_context(|| {
                    format!("invalid pixel_size value '{value}': expected a positive integer")
                })?;
                options.pixel_size = Some(parsed);
            }
            "color_levels" => {
                let parsed = value.parse::<u8>().with_context(|| {
                    format!("invalid color_levels value '{value}': expected an integer")
                })?;
                options.color_levels = Some(parsed);
            }
            _ => {}
        }
    }

    Ok(options)
}

fn build_options(pixel_size: Option<u32>, color_levels: Option<u8>) -> Result<PixelateOptions> {
    let pixel_size = pixel_size.unwrap_or(DEFAULT_PIXEL_SIZE);
    let color_levels = color_levels.unwrap_or(DEFAULT_COLOR_LEVELS);

    if !(2..=64).contains(&pixel_size) {
        anyhow::bail!("pixel_size must be between 2 and 64")
    }

    if !(2..=8).contains(&color_levels) {
        anyhow::bail!("color_levels must be between 2 and 8")
    }

    Ok(PixelateOptions {
        pixel_size,
        color_levels,
    })
}

struct RawOptions {
    pixel_size: Option<u32>,
    color_levels: Option<u8>,
}
