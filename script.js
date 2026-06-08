// DOM elements
const video = document.getElementById('cameraFeed');
const scanPage1Btn = document.getElementById('scanPage1Btn');
const scanPage2Btn = document.getElementById('scanPage2Btn');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const statusToast = document.getElementById('statusToast');
const qualityToast = document.getElementById('qualityToast');
const resultPanel = document.getElementById('resultPanel');
const resultContent = document.getElementById('resultContent');
const closeResultBtn = document.getElementById('closeResultBtn');

let stream = null;
let page1Image = null;
let page2Image = null;
let currentPage = 1;  // 1 or 2

// Helper to show temporary toasts
let statusTimeout, qualityTimeout;
function showStatus(msg, isError = false) {
    if (statusTimeout) clearTimeout(statusTimeout);
    statusToast.style.opacity = '1';
    statusToast.innerText = msg;
    statusToast.style.background = isError ? 'rgba(200,50,50,0.9)' : 'rgba(0,0,0,0.8)';
    statusTimeout = setTimeout(() => { statusToast.style.opacity = '0'; }, 2000);
}
function showQuality(msg) {
    if (qualityTimeout) clearTimeout(qualityTimeout);
    qualityToast.innerText = msg;
    qualityToast.style.opacity = '1';
    qualityTimeout = setTimeout(() => { qualityToast.style.opacity = '0'; }, 2000);
}

// ---------- Camera Setup (full screen) ----------
async function setupCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" } // rear camera
        });
        video.srcObject = stream;
        await video.play();
        showStatus("📷 Camera ready. Position exam page.");
    } catch (err) {
        showStatus("❌ Camera error: " + err.message, true);
        console.error(err);
    }
}

// ---------- Quality Check (sharpness + brightness) ----------
function checkImageQuality(imageDataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const w = canvas.width, h = canvas.height;
            
            // Sharpness (Laplacian variance)
            let sum = 0, sumSq = 0;
            for (let y = 1; y < h-1; y++) {
                for (let x = 1; x < w-1; x++) {
                    let idx = (y*w + x)*4;
                    let gray = 0.299*data[idx] + 0.587*data[idx+1] + 0.114*data[idx+2];
                    let top = (y-1)*w + x;
                    let bottom = (y+1)*w + x;
                    let left = y*w + (x-1);
                    let right = y*w + (x+1);
                    let gTop = 0.299*data[top*4] + 0.587*data[top*4+1] + 0.114*data[top*4+2];
                    let gBottom = 0.299*data[bottom*4] + 0.587*data[bottom*4+1] + 0.114*data[bottom*4+2];
                    let gLeft = 0.299*data[left*4] + 0.587*data[left*4+1] + 0.114*data[left*4+2];
                    let gRight = 0.299*data[right*4] + 0.587*data[right*4+1] + 0.114*data[right*4+2];
                    let lap = Math.abs(4*gray - gTop - gBottom - gLeft - gRight);
                    sum += lap;
                    sumSq += lap*lap;
                }
            }
            let variance = (sumSq/(w*h)) - Math.pow(sum/(w*h), 2);
            let isSharp = variance > 30;
            
            // Brightness
            let totalLum = 0;
            for (let i=0; i<data.length; i+=4) {
                totalLum += 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2];
            }
            let avgLum = totalLum/(w*h);
            let isBright = avgLum > 70;
            
            let isGood = true, reason = "";
            if (!isSharp) { isGood = false; reason += "Blurry • "; }
            if (!isBright) { isGood = false; reason += "Too dark • "; }
            if (isGood) reason = "✅ Good quality";
            resolve({ isGood, reason });
        };
        img.src = imageDataUrl;
    });
}

// ---------- Capture Full Frame + Enhancement ----------
async function captureFullFrame() {
    if (!video.videoWidth) return null;
    
    // Capture current video frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Enhance: contrast + brightness + sharpen
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
        const contrast = 1.4;
        const brightness = 10;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 + brightness));
            data[i+1] = Math.min(255, Math.max(0, (data[i+1] - 128) * contrast + 128 + brightness));
            data[i+2] = Math.min(255, Math.max(0, (data[i+2] - 128) * contrast + 128 + brightness));
        }
        ctx.putImageData(imageData, 0, 0);
        
        // Sharpen kernel
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
        resolve(sharpenCanvas.toDataURL('image/jpeg', 0.85));
    });
}

// ---------- Capture Page Flow ----------
async function capturePage() {
    showStatus(`📸 Capturing Page ${currentPage}...`);
    const capturedDataUrl = await captureFullFrame();
    if (!capturedDataUrl) {
        showStatus("❌ Capture failed. Try again.", true);
        return;
    }
    
    const quality = await checkImageQuality(capturedDataUrl);
    showQuality(quality.reason);
    if (!quality.isGood) {
        showStatus(`⚠️ Page ${currentPage} rejected. ${quality.reason}`, true);
        return;
    }
    
    if (currentPage === 1) {
        page1Image = capturedDataUrl;
        scanPage1Btn.disabled = true;
        scanPage1Btn.style.opacity = '0.5';
        scanPage2Btn.disabled = false;
        scanPage2Btn.style.opacity = '1';
        currentPage = 2;
        showStatus("✅ Page 1 captured! Now scan Page 2.");
    } else {
        page2Image = capturedDataUrl;
        scanPage2Btn.disabled = true;
        scanPage2Btn.style.opacity = '0.5';
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        showStatus("✅ Page 2 captured! Ready to extract.");
    }
}

// ---------- Send to Gemini API ----------
async function sendToGemini() {
    if (!page1Image || !page2Image) {
        showStatus("❌ Both pages required.", true);
        return;
    }
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    showStatus("🤖 Sending to Gemini AI...");
    
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page1: page1Image, page2: page2Image })
        });
        const data = await response.json();
        if (response.ok) {
            resultContent.innerText = data.extractedText;
            resultPanel.classList.add('show');
            showStatus("✅ Extraction complete!");
        } else {
            showStatus("❌ Gemini error: " + (data.error || "Unknown"), true);
            resultContent.innerText = "Error: " + (data.error || "Unknown");
            resultPanel.classList.add('show');
        }
    } catch (err) {
        showStatus("❌ Network error: " + err.message, true);
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
    resultPanel.classList.remove('show');
    showStatus("⟳ Reset. Ready for fresh scan.");
}

// Event listeners
scanPage1Btn.onclick = capturePage;
scanPage2Btn.onclick = capturePage;
submitBtn.onclick = sendToGemini;
resetBtn.onclick = resetApp;
closeResultBtn.onclick = () => resultPanel.classList.remove('show');

// Start camera
setupCamera();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});
