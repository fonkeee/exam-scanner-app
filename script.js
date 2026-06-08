// ========== DOM elements ==========
const video = document.getElementById('cameraFeed');
const scanPage1Btn = document.getElementById('scanPage1Btn');
const scanPage2Btn = document.getElementById('scanPage2Btn');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const uploadInput = document.getElementById('uploadInput');
const uploadBtn = document.getElementById('uploadBtn');
const statusMsg = document.getElementById('statusMsg');
const resultModal = document.getElementById('resultModal');
const resultText = document.getElementById('resultText');
const closeModalBtn = document.getElementById('closeModalBtn');

let stream = null;
let page1Image = null;
let page2Image = null;
let currentPage = 1;

// ========== Debug logging ==========
function debugLog(...args) {
    console.log("[DEBUG]", ...args);
}

// ========== Toast system ==========
let toastTimeout = null;
function showToast(message, duration = 3000, isError = false) {
    let toast = document.getElementById('dynamicToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'dynamicToast';
        document.body.appendChild(toast);
    }
    toast.style.backgroundColor = isError ? 'rgba(200,50,50,0.95)' : 'rgba(0,0,0,0.85)';
    toast.innerText = message;
    toast.style.opacity = '1';
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
    }, duration);
}

function setStatus(msg, isError = false) {
    statusMsg.innerText = msg;
    statusMsg.style.background = isError ? 'rgba(200,50,50,0.9)' : 'rgba(0,0,0,0.7)';
    if (!isError) {
        setTimeout(() => {
            if (statusMsg.innerText === msg) statusMsg.innerText = "📷 Ready";
        }, 2000);
    }
}

// ========== Camera Setup ==========
async function setupCamera() {
    setStatus("Requesting camera...");
    try {
        const constraints = { video: { facingMode: "environment" } };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        debugLog("Camera ready:", settings.width, "x", settings.height);
        setStatus("✅ Camera ready");
        showToast("Camera ready. Tap Page 1 to scan.", 2000);
    } catch (err) {
        debugLog("Camera error:", err);
        setStatus("❌ Camera error: " + err.message, true);
        showToast("Camera error: " + err.message, 4000, true);
    }
}

// ========== Resize & Compress Image (to avoid payload too large) ==========
async function resizeAndCompress(imageDataUrl, maxWidth = 1500, quality = 0.85) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Apply enhancement (contrast, sharpen) after resize
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            const contrast = 1.4;
            const brightness = 10;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 + brightness));
                data[i+1] = Math.min(255, Math.max(0, (data[i+1] - 128) * contrast + 128 + brightness));
                data[i+2] = Math.min(255, Math.max(0, (data[i+2] - 128) * contrast + 128 + brightness));
            }
            ctx.putImageData(imageData, 0, 0);
            
            // Simple sharpen
            const sharpenCanvas = document.createElement('canvas');
            sharpenCanvas.width = width;
            sharpenCanvas.height = height;
            const sCtx = sharpenCanvas.getContext('2d');
            sCtx.drawImage(canvas, 0, 0);
            const src = sCtx.getImageData(0, 0, width, height);
            const dst = sCtx.createImageData(width, height);
            const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1];
            for (let y = 1; y < height-1; y++) {
                for (let x = 1; x < width-1; x++) {
                    let r = 0, g = 0, b = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y+ky)*width + (x+kx))*4;
                            const w = kernel[(ky+1)*3 + (kx+1)];
                            r += src.data[idx] * w;
                            g += src.data[idx+1] * w;
                            b += src.data[idx+2] * w;
                        }
                    }
                    const didx = (y*width + x)*4;
                    dst.data[didx] = Math.min(255, Math.max(0, r));
                    dst.data[didx+1] = Math.min(255, Math.max(0, g));
                    dst.data[didx+2] = Math.min(255, Math.max(0, b));
                    dst.data[didx+3] = src.data[(y*width + x)*4 + 3];
                }
            }
            sCtx.putImageData(dst, 0, 0);
            resolve(sharpenCanvas.toDataURL('image/jpeg', quality));
        };
        img.src = imageDataUrl;
    });
}

// Capture from camera (with resize)
async function captureFullFrame() {
    if (!video.videoWidth || !video.videoHeight) {
        return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const compressed = await resizeAndCompress(rawDataUrl, 1500, 0.85);
    return compressed;
}

// ========== File upload handler (with resize) ==========
async function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    showToast("Processing uploaded image...", 2000);
    const reader = new FileReader();
    reader.onload = async (e) => {
        const dataUrl = e.target.result;
        const compressed = await resizeAndCompress(dataUrl, 1500, 0.85);
        if (currentPage === 1) {
            page1Image = compressed;
            scanPage1Btn.disabled = true;
            scanPage1Btn.style.opacity = '0.5';
            scanPage2Btn.disabled = false;
            scanPage2Btn.style.opacity = '1';
            currentPage = 2;
            setStatus("✅ Page 1 uploaded. Now upload Page 2.");
            showToast("Page 1 uploaded! Now upload Page 2.", 2000);
        } else if (currentPage === 2) {
            page2Image = compressed;
            scanPage2Btn.disabled = true;
            scanPage2Btn.style.opacity = '0.5';
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            setStatus("✅ Page 2 uploaded. Ready to extract.");
            showToast("Page 2 uploaded! Tap Extract.", 2000);
        }
    };
    reader.readAsDataURL(file);
    uploadInput.value = '';
}

// ========== Capture page (camera) ==========
async function capturePage() {
    if (!stream) {
        setStatus("Camera not started. Refresh and allow permissions.", true);
        showToast("Camera not ready. Please refresh.", 3000, true);
        return;
    }
    setStatus(`Capturing Page ${currentPage}...`);
    const captured = await captureFullFrame();
    if (!captured) {
        setStatus("Capture failed. Try again.", true);
        showToast("Capture failed. Tap again.", 2000, true);
        return;
    }
    if (currentPage === 1) {
        page1Image = captured;
        scanPage1Btn.disabled = true;
        scanPage1Btn.style.opacity = '0.5';
        scanPage2Btn.disabled = false;
        scanPage2Btn.style.opacity = '1';
        currentPage = 2;
        setStatus("✅ Page 1 captured. Now scan Page 2.");
        showToast("Page 1 captured! Now scan Page 2.", 2000);
    } else {
        page2Image = captured;
        scanPage2Btn.disabled = true;
        scanPage2Btn.style.opacity = '0.5';
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        setStatus("✅ Page 2 captured. Ready to extract.");
        showToast("Page 2 captured! Tap Extract.", 2000);
    }
}

// ========== Send to Gemini with better error logging ==========
async function sendToGemini() {
    if (!page1Image || !page2Image) {
        setStatus("Both pages required.", true);
        showToast("Please capture or upload both pages first.", 2500, true);
        return;
    }
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    setStatus("Sending to Gemini AI...");
    showToast("⏳ Waiting for Gemini... (may take 15-30s)", 0);
    const startTime = Date.now();
    let interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const toast = document.getElementById('dynamicToast');
        if (toast && toast.style.opacity !== '0') {
            toast.innerText = `⏳ Gemini processing... ${elapsed}s`;
        }
    }, 1000);
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page1: page1Image, page2: page2Image })
        });
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error("Non-JSON response:", text.substring(0, 200));
            throw new Error(`Server returned ${response.status}: ${text.substring(0, 100)}`);
        }
        const data = await response.json();
        clearInterval(interval);
        if (response.ok) {
            resultText.innerText = data.extractedText;
            resultModal.classList.remove('hidden');
            setStatus("✅ Extraction complete!");
            showToast("✅ Answers extracted! Check the modal.", 3000);
        } else {
            const errorMsg = data.error || "Unknown error";
            setStatus("❌ Gemini error: " + errorMsg, true);
            showToast("❌ " + errorMsg, 8000, true);
        }
    } catch (err) {
        clearInterval(interval);
        console.error("Network error:", err);
        setStatus("❌ Network error: " + err.message, true);
        showToast("Network error: " + err.message, 5000, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        setTimeout(() => {
            const toast = document.getElementById('dynamicToast');
            if (toast && toast.innerText.startsWith('⏳')) {
                toast.style.opacity = '0';
            }
        }, 500);
    }
}

function resetApp() {
    page1Image = null;
    page2Image = null;
    currentPage = 1;
    scanPage1Btn.disabled = false;
    scanPage1Btn.style.opacity = '1';
    scanPage2Btn.disabled = true;
    scanPage2Btn.style.opacity = '0.5';
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    resultModal.classList.add('hidden');
    setStatus("Reset. Ready to scan.");
    showToast("Reset. You can start over.", 1500);
}

// ========== Event listeners ==========
scanPage1Btn.onclick = capturePage;
scanPage2Btn.onclick = capturePage;
submitBtn.onclick = sendToGemini;
resetBtn.onclick = resetApp;
closeModalBtn.onclick = () => resultModal.classList.add('hidden');
uploadInput.onchange = handleUpload;

// Start camera
window.addEventListener('load', setupCamera);
window.addEventListener('beforeunload', () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
});
