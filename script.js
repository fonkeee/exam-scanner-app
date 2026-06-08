// DOM elements
const video = document.getElementById('cameraFeed');
const outlineCanvas = document.getElementById('outlineCanvas');
const scanPage1Btn = document.getElementById('scanPage1Btn');
const scanPage2Btn = document.getElementById('scanPage2Btn');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const statusDiv = document.getElementById('status');
const guidanceDiv = document.getElementById('guidanceMsg');
const resultDiv = document.getElementById('result');

let scanner = null;
let page1Image = null;   // will store enhanced image data URL
let page2Image = null;
let currentPage = 1;     // 1 or 2

// ---------- Initialize Professional Scanner with Outline ----------
async function initScanner() {
    try {
        // Create scanner instance with auto-capture and outline drawing
        scanner = window.JsDocumentAutocapture.createScanner({
            videoElement: video,
            autoCapture: true,
            maxCaptures: 2,
            quality: 'high',
            enableOutline: true,          // Enables real-time outline detection
            outlineColor: '#00ff00',      // Green outline
            outlineThickness: 3
        });

        // --- Event: guidance messages ---
        scanner.on('guidance', (code, data) => {
            const guidanceMap = {
                'DOCUMENT_NOT_FOUND': '📄 No document detected. Place your exam page in frame.',
                'MOVE_CLOSER': '🔍 Move CLOSER to the document.',
                'MOVE_FURTHER': '📏 Move FURTHER from the document.',
                'HOLD_STEADY': '🤝 Hold steady... capturing soon.',
                'CAPTURING': '📸 Capturing page...',
                'DOCUMENT_DETECTED': '✅ Document detected! Hold still.'
            };
            const msg = guidanceMap[code] || code;
            guidanceDiv.innerHTML = msg;
            statusDiv.innerHTML = `📷 Page ${currentPage}: ${msg}`;
            
            // Also draw the detected contour if available
            if (data && data.contour && outlineCanvas) {
                drawContour(data.contour);
            } else {
                clearOutline();
            }
        });

        // --- Event: capture (when a page is automatically captured) ---
        scanner.on('capture', async (result) => {
            // result.blob is the enhanced, perspective-corrected image
            const imageUrl = URL.createObjectURL(result.blob);
            const enhancedDataUrl = await blobToDataURL(result.blob);
            
            if (currentPage === 1) {
                page1Image = enhancedDataUrl;
                scanPage1Btn.disabled = true;
                scanPage1Btn.innerText = '✅ Page 1 Captured';
                currentPage = 2;
                statusDiv.innerHTML = '✅ Page 1 captured! Now position Page 2.';
                guidanceDiv.innerHTML = '📄 Great! Now scan the second page.';
                // Re-enable scanner for page 2
                scanner.reset();  // clears internal state but keeps running
            } else if (currentPage === 2) {
                page2Image = enhancedDataUrl;
                scanPage2Btn.disabled = true;
                scanPage2Btn.innerText = '✅ Page 2 Captured';
                submitBtn.disabled = false;
                statusDiv.innerHTML = '✅ Both pages captured! Click "Send to Gemini AI".';
                guidanceDiv.innerHTML = '✨ Ready to extract Q&A.';
                // Stop scanner automatically after second capture
                scanner.stop();
            }
            
            // Clear outline after capture
            clearOutline();
        });

        // --- Event: complete (when maxCaptures is reached) ---
        scanner.on('complete', () => {
            statusDiv.innerHTML += ' 📄 All pages scanned.';
        });

        // --- Event: error ---
        scanner.on('error', (err) => {
            console.error('Scanner error:', err);
            statusDiv.innerHTML = `⚠️ Scanner error: ${err.message || err}`;
        });

        // Start the scanner
        await scanner.start();
        statusDiv.innerHTML = '📷 Scanner ready. Position your exam page – outline will appear.';
        guidanceDiv.innerHTML = 'Place the first page inside the green outline.';
        
        // Enable manual page buttons (in case user wants to force capture)
        scanPage1Btn.disabled = false;
        scanPage1Btn.innerText = '📸 Force Capture Page 1';
        scanPage2Btn.disabled = true;
        
    } catch (error) {
        console.error('Failed to initialize scanner:', error);
        statusDiv.innerHTML = `❌ Camera error: ${error.message}. Please ensure HTTPS and camera permissions.`;
    }
}

// Helper: Draw detected contour on canvas
function drawContour(contourPoints) {
    const canvas = outlineCanvas;
    const ctx = canvas.getContext('2d');
    // Resize canvas to match video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!contourPoints || contourPoints.length < 4) return;
    
    ctx.beginPath();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    
    // Move to first point
    ctx.moveTo(contourPoints[0].x, contourPoints[0].y);
    for (let i = 1; i < contourPoints.length; i++) {
        ctx.lineTo(contourPoints[i].x, contourPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    
    // Also draw corner circles
    ctx.fillStyle = '#ffaa00';
    contourPoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function clearOutline() {
    const canvas = outlineCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Helper: convert Blob to DataURL for sending to API
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ---------- Force Capture (if user wants to manually trigger) ----------
async function forceCapture() {
    if (!scanner) return;
    try {
        const result = await scanner.captureNow();  // manually capture current frame
        // The 'capture' event will be triggered automatically, so no need to duplicate
        statusDiv.innerHTML = `📸 Forced capture for page ${currentPage}.`;
    } catch (err) {
        statusDiv.innerHTML = `⚠️ Could not capture: ${err.message}`;
    }
}

// ---------- Send to Gemini API ----------
async function sendToGemini() {
    if (!page1Image || !page2Image) {
        statusDiv.innerHTML = '❌ Please capture both pages first.';
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ Processing...';
    statusDiv.innerHTML = '🤖 Sending to Gemini AI...';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = 'Extracting questions and answers...';
    
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page1: page1Image,
                page2: page2Image
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            resultDiv.innerHTML = `<strong>📝 Extracted Q&A:</strong><br><br>${data.extractedText.replace(/\n/g, '<br>')}`;
            statusDiv.innerHTML = '✅ Extraction complete!';
        } else {
            resultDiv.innerHTML = `<strong>❌ Error:</strong> ${data.error || 'Unknown error'}`;
            statusDiv.innerHTML = '❌ Failed to extract. Check console.';
        }
    } catch (err) {
        console.error('Send error:', err);
        resultDiv.innerHTML = `<strong>❌ Network error:</strong> ${err.message}`;
        statusDiv.innerHTML = '❌ Could not reach server.';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = '✨ Send to Gemini AI';
    }
}

// ---------- Reset everything ----------
function resetApp() {
    page1Image = null;
    page2Image = null;
    currentPage = 1;
    scanPage1Btn.disabled = false;
    scanPage1Btn.innerText = '📸 Force Capture Page 1';
    scanPage2Btn.disabled = true;
    scanPage2Btn.innerText = '📸 Page 2';
    submitBtn.disabled = true;
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
    statusDiv.innerHTML = '🔄 Reset. Starting scanner again...';
    guidanceDiv.innerHTML = '';
    clearOutline();
    
    // Restart scanner if it was stopped
    if (scanner) {
        scanner.stop();
        scanner.start().catch(console.error);
    } else {
        initScanner();
    }
}

// ---------- Event Listeners ----------
scanPage1Btn.onclick = forceCapture;
scanPage2Btn.onclick = forceCapture;
submitBtn.onclick = sendToGemini;
resetBtn.onclick = resetApp;

// ---------- Start the app ----------
initScanner().catch(err => {
    console.error('Init error:', err);
    statusDiv.innerHTML = '❌ Cannot access camera. Please allow camera permissions and use HTTPS.';
});
