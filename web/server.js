const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const PORT = Number(process.env.PORT || 8080);
const OSC_WASM_API_URL = process.env.PIXEL_API_URL || "https://9a3839875b.apps.osaas.io";
const ROOT = __dirname;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = requestUrl.pathname;

  if (pathname === "/health") {
    sendJson(res, 200, {
      status: "ok",
      app: "pixel-art-ui",
      pixel_api_url: OSC_WASM_API_URL,
    });
    return;
  }

  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    sendText(res, 404, "Not found");
    return;
  }

  fs.readFile(filePath, "utf8", (error, contents) => {
    if (error) {
      sendText(res, 500, "Failed to read asset");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "text/plain; charset=utf-8";

    if (path.basename(filePath) === "index.html") {
      const rendered = contents.replaceAll("__PIXEL_API_URL__", OSC_WASM_API_URL);
      res.writeHead(200, { "content-type": contentType });
      res.end(rendered);
      return;
    }

    res.writeHead(200, { "content-type": contentType });
    res.end(contents);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`UI server listening on http://0.0.0.0:${PORT}`);
  console.log(`Using OSC WASM API: ${OSC_WASM_API_URL}`);
});

function resolveStaticPath(pathname) {
  if (pathname === "/" || pathname === "/index.html") {
    return path.join(ROOT, "index.html");
  }

  if (pathname === "/styles.css") {
    return path.join(ROOT, "styles.css");
  }

  if (pathname === "/app.js") {
    return path.join(ROOT, "app.js");
  }

  return null;
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}
