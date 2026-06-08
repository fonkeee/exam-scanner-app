// DOM elements
const video = document.getElementById('cameraFeed');
const scanPage1Btn = document.getElementById('scanPage1Btn');
const scanPage2Btn = document.getElementById('scanPage2Btn');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const statusMsg = document.getElementById('statusMsg');
const resultModal = document.getElementById('resultModal');
const resultText = document.getElementById('resultText');
const closeModalBtn = document.getElementById('closeModalBtn');

let stream = null;
let page1Image = null;
let page2Image = null;
let currentPage = 1;  // 1 or 2

// Simple status update
function setStatus(msg, isError = false) {
    statusMsg.innerText = msg;
    statusMsg.style.background = isError ? 'rgba(200,50,50,0.9)' : 'rgba(0,0,0,0.7)';
    // Auto-clear after 2 seconds for non-errors? Optional
    if (!isError) {
        setTimeout(() => {
            if (statusMsg.innerText === msg) statusMsg.innerText = "📷 Ready";
        }, 2000);
    }
}

// ---------- Camera Setup (simple, reliable) ----------
async function setupCamera() {
    setStatus("Requesting camera...");
    try {
        const constraints = { video: { facingMode: "environment" } };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        console.log("Camera ready:", settings.width, "x", settings.height);
        setStatus("✅ Camera ready");
    } catch (err) {
        console.error("Camera error:", err);
        setStatus("❌ Camera error: " + err.message, true);
    }
}

// ---------- Capture Full Frame (no quality check, just capture & enhance) ----------
async function captureFullFrame() {
    if (!video.videoWidth || !video.videoHeight) {
        setStatus("Camera not ready", true);
        return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Simple enhancement: contrast + brightness + sharpen (optional but helps OCR)
    const enhanced = await enhanceImage(canvas);
    return enhanced;
}

function enhanceImage(sourceCanvas) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = sourceCanvas.width;
        canvas.height = sourceCanvas.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(sourceCanvas, 0, 0);
        
        // Contrast & brightness
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const contrast = 1.3;
        const brightness = 10;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 + brightness));
            data[i+1] = Math.min(255, Math.max(0, (data[i+1] - 128) * contrast + 128 + brightness));
            data[i+2] = Math.min(255, Math.max(0, (data[i+2] - 128) * contrast + 128 + brightness));
        }
        ctx.putImageData(imageData, 0, 0);
        
        // Sharpen kernel (light)
        const sharpenCanvas = document.createElement('canvas');
        sharpenCanvas.width = canvas.width;
        sharpenCanvas.height = canvas.height;
        const sCtx = sharpenCanvas.getContext('2d');
        sCtx.drawImage(canvas, 0, 0);
        const src = sCtx.getImageData(0, 0, canvas.width, canvas.height);
        const dst = sCtx.createImageData(canvas.width, canvas.height);
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        for (let y = 1; y < canvas.height-1; y++) {
            for (let x = 1; x < canvas.width-1; x++) {
                let r = 0, g = 0, b = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y+ky)*canvas.width + (x+kx)) * 4;
                        const w = kernel[(ky+1)*3 + (kx+1)];
                        r += src.data[idx] * w;
                        g += src.data[idx+1] * w;
                        b += src.data[idx+2] * w;
                    }
                }
                const didx = (y*canvas.width + x)*4;
                dst.data[didx] = r;
                dst.data[didx+1] = g;
                dst.data[didx+2] = b;
                dst.data[didx+3] = src.data[(y*canvas.width + x)*4 + 3];
            }
        }
        sCtx.putImageData(dst, 0, 0);
        resolve(sharpenCanvas.toDataURL('image/jpeg', 0.9));
    });
}

// ---------- Capture Page ----------
async function capturePage() {
    if (!stream) {
        setStatus("Camera not started. Refresh and allow permissions.", true);
        return;
    }
    setStatus(`Capturing Page ${currentPage}...`);
    const captured = await captureFullFrame();
    if (!captured) {
        setStatus("Capture failed. Try again.", true);
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
    } else {
        page2Image = captured;
        scanPage2Btn.disabled = true;
        scanPage2Btn.style.opacity = '0.5';
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        setStatus("✅ Page 2 captured. Ready to extract.");
    }
}

// ---------- Send to Gemini ----------
async function sendToGemini() {
    if (!page1Image || !page2Image) {
        setStatus("Both pages required.", true);
        return;
    }
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    setStatus("Sending to Gemini AI...");
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page1: page1Image, page2: page2Image })
        });
        const data = await response.json();
        if (response.ok) {
            resultText.innerText = data.extractedText;
            resultModal.classList.remove('hidden');
            setStatus("✅ Extraction complete!");
        } else {
            setStatus("❌ Gemini error: " + (data.error || "Unknown"), true);
            resultText.innerText = "Error: " + (data.error || "Unknown");
            resultModal.classList.remove('hidden');
        }
    } catch (err) {
        setStatus("❌ Network error: " + err.message, true);
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
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
}

// Event listeners
scanPage1Btn.onclick = capturePage;
scanPage2Btn.onclick = capturePage;
submitBtn.onclick = sendToGemini;
resetBtn.onclick = resetApp;
closeModalBtn.onclick = () => resultModal.classList.add('hidden');

// Start camera when page loads
window.addEventListener('load', setupCamera);

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});
