FROM rust:1.84-bookworm AS builder

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN rustup target add wasm32-wasip1
RUN curl -fsSL https://developer.fermyon.com/downloads/install.sh | bash \
    && mv /root/.spin/bin/spin /usr/local/bin/spin

COPY Cargo.toml ./
COPY src ./src
COPY web ./web

RUN cargo build --target wasm32-wasip1 --release

FROM debian:bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://developer.fermyon.com/downloads/install.sh | bash \
    && mv /root/.spin/bin/spin /usr/local/bin/spin

COPY spin.toml ./
RUN mkdir -p target/wasm32-wasip1/release
COPY --from=builder /app/target/wasm32-wasip1/release/pixel_art_generator.wasm ./target/wasm32-wasip1/release/pixel_art_generator.wasm

EXPOSE 8080

CMD ["spin", "up", "--listen", "0.0.0.0:8080"]
