const imageInput = document.getElementById("imageInput");
const pixelSizeInput = document.getElementById("pixelSize");
const colorLevelsInput = document.getElementById("colorLevels");
const pixelSizeValue = document.getElementById("pixelSizeValue");
const colorLevelsValue = document.getElementById("colorLevelsValue");
const generateBtn = document.getElementById("generateBtn");
const downloadBtn = document.getElementById("downloadBtn");
const errorMessage = document.getElementById("errorMessage");
const originalState = document.getElementById("originalState");
const resultState = document.getElementById("resultState");
const originalPreview = document.getElementById("originalPreview");
const resultPreview = document.getElementById("resultPreview");
const healthStatus = document.getElementById("healthStatus");
const healthText = healthStatus.querySelector(".status-text");

const RAW_API_BASE = (window.PIXEL_API_URL || "").trim();
const API_BASE = RAW_API_BASE.startsWith("__PIXEL_API_URL__")
  ? ""
  : RAW_API_BASE.replace(/\/+$/, "");
const IS_OSC_ABI_MODE = API_BASE.length > 0;

let selectedFile = null;
let originalPreviewUrl = "";
let resultPreviewUrl = "";

pixelSizeInput.addEventListener("input", () => {
  pixelSizeValue.textContent = pixelSizeInput.value;
});

colorLevelsInput.addEventListener("input", () => {
  colorLevelsValue.textContent = colorLevelsInput.value;
});

imageInput.addEventListener("change", () => {
  clearError();
  hideResult();

  const [file] = imageInput.files || [];
  if (!file) {
    resetOriginal();
    selectedFile = null;
    return;
  }

  if (!file.type.startsWith("image/")) {
    showError("Please choose a valid image file.");
    imageInput.value = "";
    resetOriginal();
    selectedFile = null;
    return;
  }

  selectedFile = file;
  if (originalPreviewUrl) {
    URL.revokeObjectURL(originalPreviewUrl);
  }

  originalPreviewUrl = URL.createObjectURL(file);
  originalPreview.src = originalPreviewUrl;
  originalPreview.classList.remove("hidden");
  originalState.classList.add("hidden");
});

generateBtn.addEventListener("click", async () => {
  clearError();

  if (!selectedFile) {
    showError("Upload an image before generating pixel art.");
    return;
  }

  setLoading(true);

  try {
    const blob = IS_OSC_ABI_MODE
      ? await generateViaOscAbi(selectedFile)
      : await generateViaLocalApi(selectedFile);

    if (!blob || blob.size === 0) {
      throw new Error("Backend returned an empty image.");
    }

    if (resultPreviewUrl) {
      URL.revokeObjectURL(resultPreviewUrl);
    }

    resultPreviewUrl = URL.createObjectURL(blob);
    resultPreview.src = resultPreviewUrl;
    resultPreview.classList.remove("hidden");
    resultState.classList.add("hidden");

    downloadBtn.href = resultPreviewUrl;
    downloadBtn.classList.remove("hidden");
  } catch (error) {
    hideResult();
    showError(error instanceof Error ? error.message : "Something went wrong.");
  } finally {
    setLoading(false);
  }
});

async function generateViaLocalApi(file) {
  const params = new URLSearchParams({
    pixel_size: pixelSizeInput.value,
    color_levels: colorLevelsInput.value,
  });

  const response = await fetch(`/pixelate?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return response.blob();
}

async function generateViaOscAbi(file) {
  const imageBase64 = await fileToBase64(file);
  const payload = {
    image_base64: imageBase64,
    pixel_size: Number(pixelSizeInput.value),
    color_levels: Number(colorLevelsInput.value),
  };

  const response = await fetch(`${API_BASE}/`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  const bodyText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error("OSC endpoint returned non-JSON response.");
  }

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (!parsed.image_base64) {
    throw new Error("OSC response did not include image_base64.");
  }

  const outputBytes = base64ToUint8Array(parsed.image_base64);
  return new Blob([outputBytes], { type: "image/png" });
}

async function updateHealthStatus() {
  try {
    if (IS_OSC_ABI_MODE) {
      const response = await fetch(`${API_BASE}/`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "health" }),
      });

      if (!response.ok) {
        throw new Error();
      }

      const text = await response.text();
      const payload = JSON.parse(text);
      if (payload.status !== "ok") {
        throw new Error();
      }
    } else {
      const response = await fetch("/health", { method: "GET" });
      if (!response.ok) {
        throw new Error();
      }
    }

    healthStatus.classList.remove("error");
    healthStatus.classList.add("ok");
    healthText.textContent = IS_OSC_ABI_MODE
      ? "OSC backend is healthy"
      : "Backend is healthy";
  } catch {
    healthStatus.classList.remove("ok");
    healthStatus.classList.add("error");
    healthText.textContent = "Backend unavailable";
  }
}

function setLoading(isLoading) {
  generateBtn.disabled = isLoading;
  generateBtn.textContent = isLoading ? "Generating..." : "Generate Pixel Art";
  if (isLoading) {
    resultState.textContent = "Processing image...";
    resultState.classList.remove("hidden");
    resultState.classList.remove("empty");
    resultPreview.classList.add("hidden");
    downloadBtn.classList.add("hidden");
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
}

function clearError() {
  errorMessage.textContent = "";
  errorMessage.classList.add("hidden");
}

function resetOriginal() {
  if (originalPreviewUrl) {
    URL.revokeObjectURL(originalPreviewUrl);
    originalPreviewUrl = "";
  }

  originalPreview.removeAttribute("src");
  originalPreview.classList.add("hidden");
  originalState.classList.remove("hidden");
  originalState.textContent = "No image selected yet.";
}

function hideResult() {
  if (resultPreviewUrl) {
    URL.revokeObjectURL(resultPreviewUrl);
    resultPreviewUrl = "";
  }

  resultPreview.removeAttribute("src");
  resultPreview.classList.add("hidden");
  resultState.classList.remove("hidden");
  resultState.classList.add("empty");
  resultState.textContent = "Upload an image and click generate.";
  downloadBtn.classList.add("hidden");
  downloadBtn.removeAttribute("href");
}

function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const commaIndex = dataUrl.indexOf(",");
      if (commaIndex === -1) {
        reject(new Error("Could not read selected image."));
        return;
      }
      resolve(dataUrl.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(new Error("Could not read selected image."));
    reader.readAsDataURL(file);
  });
}

async function extractError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    if (payload?.error) {
      return payload.error;
    }
    if (payload?.message) {
      return payload.message;
    }
  }

  const text = await response.text();
  return text || `Request failed with status ${response.status}`;
}

updateHealthStatus();
