// vision.js

let cvReady = false;
cv['onRuntimeInitialized'] = () => {
    cvReady = true;
    console.log("OpenCV.js siap digunakan.");
    
    // Memanggil fungsi notifikasi persentase selesai
    if (typeof window.notifyCvReady === 'function') {
        window.notifyCvReady();
    }
};

let srcMat = null;
let grayMat = null;
let edgesMat = null;

function scanFrame(videoElement, ctxOverlay, width, height) {
    if (!cvReady) return; 

    if (!srcMat) {
        srcMat = new cv.Mat(height, width, cv.CV_8UC4);
        grayMat = new cv.Mat(height, width, cv.CV_8UC1);
        edgesMat = new cv.Mat(height, width, cv.CV_8UC1);
    }

    ctxOverlay.drawImage(videoElement, 0, 0, width, height);
    let imageData = ctxOverlay.getImageData(0, 0, width, height);
    srcMat.data.set(imageData.data);

    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY, 0);
    cv.Canny(grayMat, edgesMat, 50, 150, 3, false);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edgesMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let isPaperAligned = detectPaperAlignment(contours, ctxOverlay, width, height);
    
    ctxOverlay.clearRect(0, 0, width, height);
    
    if (isPaperAligned) {
        ctxOverlay.strokeStyle = "#00FF00";
        ctxOverlay.lineWidth = 3;
        ctxOverlay.strokeRect(width * 0.1, height * 0.2, width * 0.8, height * 0.6);

        if (AppState.mode === 'student') {
            processStudentSheet(width, height);
        }
    }

    contours.delete();
    hierarchy.delete();
}

function detectPaperAlignment(contours, ctx, width, height) {
    let maxArea = 0;
    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area > maxArea) maxArea = area;
    }
    return maxArea > 10000; 
}

function readOMRGrid(threshMat, startX, startY, rows, cols, boxW, boxH, spacingX, spacingY, isMultiAnswer = false) {
    let result = {};
    let options = ['A', 'B', 'C', 'D', 'E']; 
    
    for (let r = 0; r < rows; r++) {
        let maxPixels = 0;
        let bestOption = '';
        let multiAnswers = [];
        
        for (let c = 0; c < cols; c++) {
            let x = startX + (c * spacingX);
            let y = startY + (r * spacingY);
            
            if (x >= 0 && y >= 0 && x + boxW <= threshMat.cols && y + boxH <= threshMat.rows) {
                let rect = new cv.Rect(x, y, boxW, boxH);
                let roi = threshMat.roi(rect);
                
                let pixelCount = cv.countNonZero(roi);
                
                if (pixelCount > 150) { 
                    if (isMultiAnswer) {
                        multiAnswers.push(options[c]);
                    } else if (pixelCount > maxPixels) {
                        maxPixels = pixelCount;
                        bestOption = options[c];
                    }
                }
                roi.delete();
            }
        }
        result[r + 1] = isMultiAnswer ? multiAnswers : bestOption;
    }
    return result;
}

function extractMasterKey() {
    if (!cvReady || !grayMat) {
        return false;
    }
    
    let threshMat = new cv.Mat();
    cv.threshold(grayMat, threshMat, 100, 255, cv.THRESH_BINARY_INV);

    let pgAnswers = readOMRGrid(
        threshMat, 
        Math.round(grayMat.cols * 0.1), Math.round(grayMat.rows * 0.3), 
        10, 5, 
        Math.round(grayMat.cols * 0.05), Math.round(grayMat.rows * 0.03), 
        Math.round(grayMat.cols * 0.08), Math.round(grayMat.rows * 0.05)  
    );

    threshMat.delete();

    AppState.masterKey = {
        pg: pgAnswers,
        mcma: {}, 
        kategori: {} 
    };

    return true; 
}

function processStudentSheet(width, height) {
    AppState.mode = 'paused';
    
    let threshMat = new cv.Mat();
    cv.threshold(grayMat, threshMat, 100, 255, cv.THRESH_BINARY_INV);

    let studentPG = readOMRGrid(
        threshMat, 
        Math.round(width * 0.1), Math.round(height * 0.3), 
        10, 5, 
        Math.round(width * 0.05), Math.round(height * 0.03), 
        Math.round(width * 0.08), Math.round(height * 0.05)
    );

    let studentAnswers = {
        pg: studentPG,
        mcma: {}, 
        kategori: {}
    };

    threshMat.delete();

    if (typeof extractNISFromImage === 'function') {
        extractNISFromImage().then((nis) => {
            if (typeof calculateFinalScore === 'function') {
                calculateFinalScore(nis, studentAnswers, AppState.masterKey, AppState.weights);
            }
        }).catch(err => {
            AppState.mode = 'student'; 
        });
    } else {
        if (typeof calculateFinalScore === 'function') {
            calculateFinalScore("TIDAK TERBACA", studentAnswers, AppState.masterKey, AppState.weights);
        }
    }
}
