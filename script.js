// Use var to avoid redeclaration errors if script loads twice
var video = document.getElementById('cameraFeed');
var scanPage1Btn = document.getElementById('scanPage1Btn');
var scanPage2Btn = document.getElementById('scanPage2Btn');
var submitBtn = document.getElementById('submitBtn');
var resetBtn = document.getElementById('resetBtn');
var statusToast = document.getElementById('statusToast');
var qualityToast = document.getElementById('qualityToast');
var resultModal = document.getElementById('resultModal');
var resultText = document.getElementById('resultText');
var closeModalBtn = document.getElementById('closeModalBtn');

var stream = null;
var page1Image = null;
var page2Image = null;
var currentPage = 1;

// Prevent double initialization
if (window._scannerInitialized) {
    console.log("Script already initialized, skipping.");
} else {
    window._scannerInitialized = true;

    // Toast helpers
    var statusTimeout, qualityTimeout;
    function showStatus(msg, isError) {
        if (statusTimeout) clearTimeout(statusTimeout);
        statusToast.style.opacity = '1';
        statusToast.innerText = msg;
        statusToast.style.background = isError ? 'rgba(200,50,50,0.9)' : 'rgba(0,0,0,0.8)';
        statusTimeout = setTimeout(function() { statusToast.style.opacity = '0'; }, 3000);
    }
    function showQuality(msg) {
        if (qualityTimeout) clearTimeout(qualityTimeout);
        qualityToast.innerText = msg;
        qualityToast.style.opacity = '1';
        qualityToast.style.background = 'rgba(255,100,100,0.9)';
        qualityTimeout = setTimeout(function() { qualityToast.style.opacity = '0'; }, 2000);
    }

    // Camera setup
    async function setupCamera() {
        showStatus("Requesting camera...");
        try {
            var constraints = { video: { facingMode: "environment" } };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            await video.play();
            var track = stream.getVideoTracks()[0];
            var settings = track.getSettings();
            console.log("Camera ready:", settings);
            showStatus("✅ Camera ready (" + (settings.width || '?') + "×" + (settings.height || '?') + ")");
        } catch (err) {
            console.error("Camera error:", err);
            showStatus("❌ Camera error: " + err.message, true);
            var retryBtn = document.createElement('button');
            retryBtn.innerText = "Retry Camera";
            retryBtn.style.position = 'fixed';
            retryBtn.style.bottom = '100px';
            retryBtn.style.left = '50%';
            retryBtn.style.transform = 'translateX(-50%)';
            retryBtn.style.zIndex = '1000';
            retryBtn.style.padding = '12px 24px';
            retryBtn.style.background = '#1a73e8';
            retryBtn.style.color = 'white';
            retryBtn.style.border = 'none';
            retryBtn.style.borderRadius = '40px';
            retryBtn.onclick = function() { retryBtn.remove(); setupCamera(); };
            document.body.appendChild(retryBtn);
        }
    }

    // Quality check
    function checkImageQuality(imageDataUrl) {
        return new Promise(function(resolve) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                var data = imageData.data;
                var w = canvas.width, h = canvas.height;
                var sum = 0, sumSq = 0;
                for (var y = 1; y < h-1; y++) {
                    for (var x = 1; x < w-1; x++) {
                        var idx = (y*w + x)*4;
                        var gray = 0.299*data[idx] + 0.587*data[idx+1] + 0.114*data[idx+2];
                        var top = (y-1)*w + x;
                        var bottom = (y+1)*w + x;
                        var left = y*w + (x-1);
                        var right = y*w + (x+1);
                        var gTop = 0.299*data[top*4] + 0.587*data[top*4+1] + 0.114*data[top*4+2];
                        var gBottom = 0.299*data[bottom*4] + 0.587*data[bottom*4+1] + 0.114*data[bottom*4+2];
                        var gLeft = 0.299*data[left*4] + 0.587*data[left*4+1] + 0.114*data[left*4+2];
                        var gRight = 0.299*data[right*4] + 0.587*data[right*4+1] + 0.114*data[right*4+2];
                        var lap = Math.abs(4*gray - gTop - gBottom - gLeft - gRight);
                        sum += lap;
                        sumSq += lap*lap;
                    }
                }
                var variance = (sumSq/(w*h)) - Math.pow(sum/(w*h), 2);
                var isSharp = variance > 30;
                var totalLum = 0;
                for (var i=0; i<data.length; i+=4) {
                    totalLum += 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2];
                }
                var avgLum = totalLum/(w*h);
                var isBright = avgLum > 70;
                var isGood = true, reason = "";
                if (!isSharp) { isGood = false; reason += "Blurry • "; }
                if (!isBright) { isGood = false; reason += "Too dark • "; }
                if (isGood) reason = "✅ Good quality";
                resolve({ isGood: isGood, reason: reason });
            };
            img.src = imageDataUrl;
        });
    }

    // Capture and enhance
    async function captureFullFrame() {
        if (!video.videoWidth || !video.videoHeight) {
            console.warn("Video dimensions not ready");
            return null;
        }
        var canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var enhanced = await enhanceImage(canvas);
        return enhanced;
    }

    function enhanceImage(sourceCanvas) {
        return new Promise(function(resolve) {
            var canvas = document.createElement('canvas');
            canvas.width = sourceCanvas.width;
            canvas.height = sourceCanvas.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(sourceCanvas, 0, 0);
            var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var data = imageData.data;
            var contrast = 1.4;
            var brightness = 10;
            for (var i = 0; i < data.length; i += 4) {
                data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 + brightness));
                data[i+1] = Math.min(255, Math.max(0, (data[i+1] - 128) * contrast + 128 + brightness));
                data[i+2] = Math.min(255, Math.max(0, (data[i+2] - 128) * contrast + 128 + brightness));
            }
            ctx.putImageData(imageData, 0, 0);
            var sharpenCanvas = document.createElement('canvas');
            sharpenCanvas.width = canvas.width;
            sharpenCanvas.height = canvas.height;
            var sCtx = sharpenCanvas.getContext('2d');
            sCtx.drawImage(canvas, 0, 0);
            var src = sCtx.getImageData(0, 0, canvas.width, canvas.height);
            var dst = sCtx.createImageData(canvas.width, canvas.height);
            var kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
            for (var y = 1; y < canvas.height-1; y++) {
                for (var x = 1; x < canvas.width-1; x++) {
                    var r = 0, g = 0, b = 0;
                    for (var ky = -1; ky <= 1; ky++) {
                        for (var kx = -1; kx <= 1; kx++) {
                            var idx = ((y+ky)*canvas.width + (x+kx)) * 4;
                            var w = kernel[(ky+1)*3 + (kx+1)];
                            r += src.data[idx] * w;
                            g += src.data[idx+1] * w;
                            b += src.data[idx+2] * w;
                        }
                    }
                    var didx = (y*canvas.width + x)*4;
                    dst.data[didx] = r;
                    dst.data[didx+1] = g;
                    dst.data[didx+2] = b;
                    dst.data[didx+3] = src.data[(y*canvas.width + x)*4 + 3];
                }
            }
            sCtx.putImageData(dst, 0, 0);
            resolve(sharpenCanvas.toDataURL('image/jpeg', 0.92));
        });
    }

    async function capturePage() {
        if (!stream || !video.srcObject) {
            showStatus("Camera not started. Please allow camera permission.", true);
            return;
        }
        showStatus("📸 Capturing Page " + currentPage + "...");
        var capturedDataUrl = await captureFullFrame();
        if (!capturedDataUrl) {
            showStatus("❌ Capture failed. Try again.", true);
            return;
        }
        var quality = await checkImageQuality(capturedDataUrl);
        showQuality(quality.reason);
        if (!quality.isGood) {
            showStatus("⚠️ Page " + currentPage + " rejected. " + quality.reason, true);
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

    async function sendToGemini() {
        if (!page1Image || !page2Image) {
            showStatus("❌ Both pages required.", true);
            return;
        }
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        showStatus("🤖 Sending to Gemini AI...");
        try {
            var response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page1: page1Image, page2: page2Image })
            });
            var data = await response.json();
            if (response.ok) {
                resultText.innerText = data.extractedText;
                resultModal.classList.remove('hidden');
                showStatus("✅ Extraction complete!");
            } else {
                showStatus("❌ Gemini error: " + (data.error || "Unknown"), true);
                resultText.innerText = "Error: " + (data.error || "Unknown");
                resultModal.classList.remove('hidden');
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
        resultModal.classList.add('hidden');
        showStatus("⟳ Reset. Ready for fresh scan.");
    }

    // Attach event listeners
    scanPage1Btn.onclick = capturePage;
    scanPage2Btn.onclick = capturePage;
    submitBtn.onclick = sendToGemini;
    resetBtn.onclick = resetApp;
    closeModalBtn.onclick = function() { resultModal.classList.add('hidden'); };

    // Start camera
    window.addEventListener('load', setupCamera);

    // Cleanup
    window.addEventListener('beforeunload', function() {
        if (stream) {
            stream.getTracks().forEach(function(track) { track.stop(); });
        }
    });
}
