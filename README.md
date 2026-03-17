# Pixel Art Generator (Rust + WASM + Spin)

A small WASM-first web service that pixelates uploaded images and now includes a lightweight browser UI for demos.

## Stack and tradeoffs

- Backend: Rust + `spin-sdk` (WASI HTTP component)
- Image processing: `image` crate (decode, resize, PNG encode)
- Frontend: plain HTML/CSS/JS (no framework, easy to explain)
- API design: keeps existing endpoints (`GET /health`, `POST /pixelate`)

Why this is practical for an intern project:
- One Spin component serves both the API and static UI.
- No auth/database/frontend build pipeline required.
- Easy local demo: run one command, open one URL.

## Project structure

```text
.
├── Cargo.toml
├── spin.toml
├── src
│   ├── lib.rs            # API + static file serving
│   └── image_ops.rs      # pixelation + color quantization
├── web
│   ├── index.html        # UI markup
│   ├── styles.css        # minimal responsive styling
│   └── app.js            # upload, fetch, states, download
├── Dockerfile
└── README.md
```

## API

- `GET /health`
  - Response: `{"status":"ok"}`

- `POST /pixelate`
  - Input options:
    - Raw image binary body (`image/*` or `application/octet-stream`)
    - JSON body with image URL:
      - `{"image_url":"https://...","pixel_size":10,"color_levels":4}`
  - Query/body controls:
    - `pixel_size`: `2..64`
    - `color_levels`: `2..8`
  - Output: PNG bytes (`content-type: image/png`)

## UI features

- Image upload with validation
- Immediate original image preview
- Pixelation slider (`pixel_size`)
- Color depth slider (`color_levels`)
- Generate button with loading state
- Transformed image preview
- Download button for PNG result
- Error message area
- Small backend health indicator (`/health`)

## Run locally with Spin

### Prerequisites

- Rust toolchain
- Spin CLI

Install WASI target (Rust now names classic `wasm32-wasi` as `wasm32-wasip1`):

```bash
rustup target add wasm32-wasip1
```

Build:

```bash
cd /Users/vincentkumar/Documents/GitHub/EyevinnWASM
cargo build --target wasm32-wasip1 --release
```

Run:

```bash
spin up --listen 127.0.0.1:8080
```

Open UI:

```bash
open http://127.0.0.1:8080
```

## Quick test flow

1. Open `http://127.0.0.1:8080`.
2. Confirm health badge shows backend is healthy.
3. Upload any JPG/PNG/WebP image.
4. Move sliders for pixel size and color depth.
5. Click **Generate Pixel Art**.
6. Confirm transformed preview appears.
7. Click **Download PNG**.

## Curl examples

Health:

```bash
curl -i http://127.0.0.1:8080/health
```

Binary upload:

```bash
curl -X POST "http://127.0.0.1:8080/pixelate?pixel_size=12&color_levels=4" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$HOME/some-image.jpg" \
  --output "$HOME/pixelated-upload.png"
```

URL JSON mode:

```bash
curl -X POST http://127.0.0.1:8080/pixelate \
  -H "Content-Type: application/json" \
  -d '{"image_url":"https://upload.wikimedia.org/wikipedia/commons/3/3f/JPEG_example_flower.jpg","pixel_size":10,"color_levels":4}' \
  --output "$HOME/pixelated-from-url.png"
```

## Docker (for OSC-style container run)

```bash
docker build -t pixel-art-generator .
docker run --rm -p 8080:8080 pixel-art-generator
```

Then open `http://127.0.0.1:8080`.

## WASM/Spin-specific notes

- HTTP serving is via Spin's WASI HTTP runtime.
- Outbound URL processing depends on `allowed_outbound_hosts` in `spin.toml`.
- Multipart parsing is intentionally skipped to keep the backend small and robust; UI sends raw image bytes directly.
- For OSC My Apps `type=wasm`, this repository includes a root-level `app.wasm` artifact because that deployment flow currently scans the repo for a `.wasm` file and does not run `spin build`.
