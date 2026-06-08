// DOM elements
const video = document.getElementById('cameraFeed');
const guideCanvas = document.getElementById('guideCanvas');
const scanPage1Btn = document.getElementById('scanPage1Btn');
const scanPage2Btn = document.getElementById('scanPage2Btn');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const statusDiv = document.getElementById('status');
const qualityDiv = document.getElementById('qualityFeedback');
const resultDiv = document.getElementById('result');

let stream = null;
let page1Image = null;
let page2Image = null;
let currentPage = 1;  // 1 or 2

// ---------- Camera Setup ----------
async function setupCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        video.srcObject = stream;
        await video.play();
        statusDiv.innerHTML = "✅ Camera ready. Align your exam page inside the green rectangle.";
        drawGuide(); // draw fixed rectangle guide
    } catch (err) {
        statusDiv.innerHTML = "❌ Camera error: " + err.message;
        console.error(err);
    }
}

// ---------- Draw Fixed Rectangle Guide ----------
function drawGuide() {
    const canvas = guideCanvas;
    const ctx = canvas.getContext('2d');
    
    // Match canvas size to video element
    const resizeObserver = new ResizeObserver(() => {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        redraw();
    });
    resizeObserver.observe(video);
    
    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rectWidth = canvas.width * 0.8;
        const rectHeight = canvas.height * 0.7;
        const x = (canvas.width - rectWidth) / 2;
        const y = (canvas.height - rectHeight) / 2;
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]);
        ctx.strokeRect(x, y, rectWidth, rectHeight);
        
        // Draw corner circles
        ctx.fillStyle = '#ffaa00';
        const corners = [[x, y], [x+rectWidth, y], [x+rectWidth, y+rectHeight], [x, y+rectHeight]];
        corners.forEach(([cx, cy]) => {
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2*Math.PI);
            ctx.fill();
        });
        
        // Store guide coordinates for cropping
        window.guideRect = { x, y, width: rectWidth, height: rectHeight };
    }
    
    video.addEventListener('loadeddata', () => {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        redraw();
    });
    window.addEventListener('resize', () => redraw());
}

// ---------- Quality Check (Sharpness + Brightness) ----------
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
            
            // Sharpness via Laplacian variance
            const laplacian = computeLaplacianVariance(imageData);
            const isSharp = laplacian > 40;
            
            // Brightness
            let totalLuminance = 0;
            for (let i = 0; i < imageData.data.length; i += 4) {
                const r = imageData.data[i];
                const g = imageData.data[i+1];
                const b = imageData.data[i+2];
                const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                totalLuminance += luminance;
            }
            const avgLuminance = totalLuminance / (canvas.width * canvas.height);
            const isBright = avgLuminance > 70;
            
            let reason = "";
            let isGood = true;
            if (!isSharp) { isGood = false; reason += "❌ Blurry image. Hold steady. "; }
            if (!isBright) { isGood = false; reason += "❌ Too dark. Add more light. "; }
            if (isGood) reason = "✅ Quality good!";
            resolve({ isGood, reason });
        };
        img.src = imageDataUrl;
    });
}

function computeLaplacianVariance(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    let sum = 0, sumSq = 0;
    const kernel = [0, -1, 0, -1, 4, -1, 0, -1, 0];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let idx = (y * width + x) * 4;
            let r = data[idx], g = data[idx+1], b = data[idx+2];
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;
            let lap = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    let kidx = (ky+1)*3 + (kx+1);
                    let pidx = ((y+ky)*width + (x+kx)) * 4;
                    let pr = data[pidx], pg = data[pidx+1], pb = data[pidx+2];
                    let pgray = 0.299 * pr + 0.587 * pg + 0.0722 * pb;
                    lap += kernel[kidx] * pgray;
                }
            }
            sum += lap;
            sumSq += lap * lap;
        }
    }
    return (sumSq / (width*height)) - Math.pow(sum/(width*height), 2);
}

// ---------- Crop & Enhance Image (inside guide rectangle) ----------
async function captureAndEnhance() {
    if (!video.videoWidth) return null;
    
    // Get current video frame
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    
    // Calculate crop area relative to video original size
    const videoDisplayWidth = video.clientWidth;
    const videoDisplayHeight = video.clientHeight;
    const rect = window.guideRect;
    if (!rect) return null;
    
    // Map guide rectangle from display size to actual video pixel size
    const scaleX = video.videoWidth / videoDisplayWidth;
    const scaleY = video.videoHeight / videoDisplayHeight;
    const cropX = rect.x * scaleX;
    const cropY = rect.y * scaleY;
    const cropW = rect.width * scaleX;
    const cropH = rect.height * scaleY;
    
    // Crop the image
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    
    // Enhance image: contrast, brightness, sharpen
    const enhancedDataUrl = await enhanceImage(cropCanvas);
    return enhancedDataUrl;
}

function enhanceImage(canvas) {
    return new Promise((resolve) => {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Contrast & Brightness
        const contrast = 1.4;
        const brightness = 10;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 + brightness));
            data[i+1] = Math.min(255, Math.max(0, (data[i+1] - 128) * contrast + 128 + brightness));
            data[i+2] = Math.min(255, Math.max(0, (data[i+2] - 128) * contrast + 128 + brightness));
        }
        ctx.putImageData(imageData, 0, 0);
        
        // Simple sharpen kernel
        const sharpenCanvas = document.createElement('canvas');
        sharpenCanvas.width = canvas.width;
        sharpenCanvas.height = canvas.height;
        const sharpenCtx = sharpenCanvas.getContext('2d');
        sharpenCtx.drawImage(canvas, 0, 0);
        const src = sharpenCtx.getImageData(0, 0, canvas.width, canvas.height);
        const dst = sharpenCtx.createImageData(canvas.width, canvas.height);
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        const side = 3;
        const half = 1;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                let r = 0, g = 0, b = 0;
                for (let ky = 0; ky < side; ky++) {
                    for (let kx = 0; kx < side; kx++) {
                        const px = x + kx - half;
                        const py = y + ky - half;
                        if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
                            const idx = (py * canvas.width + px) * 4;
                            const w = kernel[ky * side + kx];
                            r += src.data[idx] * w;
                            g += src.data[idx+1] * w;
                            b += src.data[idx+2] * w;
                        }
                    }
                }
                const didx = (y * canvas.width + x) * 4;
                dst.data[didx] = r;
                dst.data[didx+1] = g;
                dst.data[didx+2] = b;
                dst.data[didx+3] = src.data[(y * canvas.width + x) * 4 + 3];
            }
        }
        sharpenCtx.putImageData(dst, 0, 0);
        resolve(sharpenCanvas.toDataURL('image/jpeg', 0.9));
    });
}

// ---------- Capture Page Flow ----------
async function capturePage() {
    statusDiv.innerHTML = `📷 Capturing Page ${currentPage}...`;
    const capturedDataUrl = await captureAndEnhance();
    if (!capturedDataUrl) {
        statusDiv.innerHTML = "❌ Failed to capture. Try again.";
        return;
    }
    
    // Quality check
    const quality = await checkImageQuality(capturedDataUrl);
    qualityDiv.innerHTML = quality.reason;
    if (!quality.isGood) {
        statusDiv.innerHTML = `⚠️ Page ${currentPage} rejected. ${quality.reason} Try again.`;
        return;
    }
    
    // Store
    if (currentPage === 1) {
        page1Image = capturedDataUrl;
        scanPage1Btn.disabled = true;
        scanPage1Btn.innerText = '✅ Page 1 Captured';
        scanPage2Btn.disabled = false;
        currentPage = 2;
        statusDiv.innerHTML = "✅ Page 1 captured! Now scan Page 2.";
    } else {
        page2Image = capturedDataUrl;
        scanPage2Btn.disabled = true;
        scanPage2Btn.innerText = '✅ Page 2 Captured';
        submitBtn.disabled = false;
        statusDiv.innerHTML = "✅ Both pages captured! Ready to submit.";
    }
    qualityDiv.innerHTML = "";
}

// ---------- Send to Gemini ----------
async function sendToGemini() {
    if (!page1Image || !page2Image) {
        statusDiv.innerHTML = "❌ Both pages required.";
        return;
    }
    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ Processing...";
    statusDiv.innerHTML = "🤖 Sending to Gemini AI...";
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = "Extracting questions and answers...";
    
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page1: page1Image, page2: page2Image })
        });
        const data = await res.json();
        if (res.ok) {
            resultDiv.innerHTML = `<strong>📝 Extracted Q&A:</strong><br><br>${data.extractedText.replace(/\n/g, '<br>')}`;
            statusDiv.innerHTML = "✅ Extraction complete!";
        } else {
            resultDiv.innerHTML = `<strong>❌ Error:</strong> ${data.error}`;
            statusDiv.innerHTML = "❌ Extraction failed.";
        }
    } catch (err) {
        resultDiv.innerHTML = `<strong>❌ Network error:</strong> ${err.message}`;
        statusDiv.innerHTML = "❌ Could not reach server.";
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "✨ Send to Gemini AI";
    }
}

function resetApp() {
    page1Image = null;
    page2Image = null;
    currentPage = 1;
    scanPage1Btn.disabled = false;
    scanPage1Btn.innerText = "📸 Scan Page 1";
    scanPage2Btn.disabled = true;
    scanPage2Btn.innerText = "📸 Scan Page 2";
    submitBtn.disabled = true;
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
    statusDiv.innerHTML = "🔄 Reset. Position your exam page inside the green rectangle.";
    qualityDiv.innerHTML = "";
}

// Event listeners
scanPage1Btn.onclick = capturePage;
scanPage2Btn.onclick = capturePage;
submitBtn.onclick = sendToGemini;
resetBtn.onclick = resetApp;

// Start camera
setupCamera();
