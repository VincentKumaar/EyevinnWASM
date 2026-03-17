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
    const params = new URLSearchParams({
      pixel_size: pixelSizeInput.value,
      color_levels: colorLevelsInput.value,
    });

    const response = await fetch(`/pixelate?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": selectedFile.type || "application/octet-stream",
      },
      body: selectedFile,
    });

    if (!response.ok) {
      let reason = `Request failed with status ${response.status}`;
      const responseType = response.headers.get("content-type") || "";
      if (responseType.includes("application/json")) {
        const errorPayload = await response.json();
        if (errorPayload && errorPayload.error) {
          reason = errorPayload.error;
        }
      }
      throw new Error(reason);
    }

    const blob = await response.blob();
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

async function updateHealthStatus() {
  try {
    const response = await fetch("/health", { method: "GET" });
    if (!response.ok) {
      throw new Error();
    }
    healthStatus.classList.remove("error");
    healthStatus.classList.add("ok");
    healthText.textContent = "Backend is healthy";
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

updateHealthStatus();
