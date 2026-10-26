// vision.js

let srcMat = null;
let grayMat = null;
let edgesMat = null;
let currentCorners = null;

const GRID_CONFIG = {
    pg: { startX: 80, startY: 150, rows: 10, cols: 5, boxW: 35, boxH: 35, spacingX: 50, spacingY: 50, options: ['A','B','C','D','E'] },
    mcma: { startX: 80, startY: 680, rows: 3, cols: 5, boxW: 35, boxH: 35, spacingX: 50, spacingY: 50, options: ['A','B','C','D','E'] },
    kategori: { startX: 450, startY: 150, rows: 5, cols: 3, boxW: 35, boxH: 35, spacingX: 50, spacingY: 50, options: ['B','S','B'] }
};

function sortCorners(corners) {
    corners.sort((a, b) => a.y - b.y);
    let top = corners.slice(0, 2).sort((a, b) => a.x - b.x);
    let bottom = corners.slice(2, 4).sort((a, b) => a.x - b.x);
    return [top[0], top[1], bottom[1], bottom[0]];
}

// Mencari 4 sudut dari Bingkai Tabel Soal (Bukan Tepi Kertas)
function findTableCorners(contours) {
    let maxArea = 0;
    let bestCorners = null;

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        
        // Memfilter kontur berukuran sedang-besar (Fokus ke Bingkai Tabel)
        if (area > 10000) {
            let peri = cv.arcLength(cnt, true);
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.03 * peri, true); // Toleransi sudut diperluas
            
            if (approx.rows === 4 && area > maxArea) {
                maxArea = area;
                let pts = [];
                for (let j = 0; j < 4; j++) {
                    pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
                }
                bestCorners = sortCorners(pts);
            }
            approx.delete();
        }
    }
    return bestCorners;
}

function scanFrame(videoElement, ctxOverlay, width, height) {
    if (!window.cvIsLoaded) return; 

    if (!srcMat) {
        srcMat = new cv.Mat(height, width, cv.CV_8UC4);
        grayMat = new cv.Mat(height, width, cv.CV_8UC1);
        edgesMat = new cv.Mat(height, width, cv.CV_8UC1);
    }

    ctxOverlay.drawImage(videoElement, 0, 0, width, height);
    let imageData = ctxOverlay.getImageData(0, 0, width, height);
    srcMat.data.set(imageData.data);

    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY, 0);
    
    // Thresholding untuk mempertegas garis hitam tabel
    let thresh = new cv.Mat();
    cv.adaptiveThreshold(grayMat, thresh, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 15, 10);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    currentCorners = findTableCorners(contours);
    
    ctxOverlay.clearRect(0, 0, width, height);
    
    if (currentCorners) {
        // Gambarkan garis hijau mengunci bingkai tabel
        ctxOverlay.strokeStyle = "#00FF00";
        ctxOverlay.lineWidth = 3;
        ctxOverlay.beginPath();
        ctxOverlay.moveTo(currentCorners[0].x, currentCorners[0].y);
        ctxOverlay.lineTo(currentCorners[1].x, currentCorners[1].y);
        ctxOverlay.lineTo(currentCorners[2].x, currentCorners[2].y);
        ctxOverlay.lineTo(currentCorners[3].x, currentCorners[3].y);
        ctxOverlay.closePath();
        ctxOverlay.stroke();

        drawOverlays(ctxOverlay, currentCorners);

        if (AppState.mode === 'student') {
            processStudentSheet(width, height);
        }
    } else {
        // Tampilkan kotak panduan berwarna oranye jika tabel belum pas
        ctxOverlay.strokeStyle = "rgba(255, 165, 0, 0.6)";
        ctxOverlay.lineWidth = 2;
        ctxOverlay.strokeRect(width * 0.1, height * 0.15, width * 0.8, height * 0.7);
    }

    thresh.delete();
    contours.delete();
    hierarchy.delete();
}

function warpPointToScreen(x, y, corners) {
    let u = x / 800;
    let v = y / 1000;
    let tl = corners[0], tr = corners[1], br = corners[2], bl = corners[3];
    let px = (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + u * v * br.x + (1 - u) * v * bl.x;
    let py = (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + u * v * br.y + (1 - u) * v * bl.y;
    return { x: px, y: py };
}

function drawOverlays(ctx, corners) {
    if (!AppState.overlayData || AppState.overlayData.length === 0) return;

    AppState.overlayData.forEach(item => {
        let pt = warpPointToScreen(item.x, item.y, corners);
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });
}

function readOMRGrid(threshMat, cfg, tipe = 'pg') {
    let result = {};
    for (let r = 0; r < cfg.rows; r++) {
        let maxPixels = 0;
        let bestOption = '';
        let multiAnswers = [];
        
        for (let c = 0; c < cfg.cols; c++) {
            let x = cfg.startX + (c * cfg.spacingX);
            let y = cfg.startY + (r * cfg.spacingY);
            
            if (x >= 0 && y >= 0 && x + cfg.boxW <= threshMat.cols && y + cfg.boxH <= threshMat.rows) {
                let rect = new cv.Rect(x, y, cfg.boxW, cfg.boxH);
                let roi = threshMat.roi(rect);
                let pixelCount = cv.countNonZero(roi);
                
                if (pixelCount > 120) { 
                    if (tipe === 'mcma' || tipe === 'kategori') {
                        multiAnswers.push(cfg.options[c]);
                    } else {
                        if (pixelCount > maxPixels) {
                            maxPixels = pixelCount;
                            bestOption = cfg.options[c];
                        }
                    }
                }
                roi.delete();
            }
        }
        result[r + 1] = (tipe === 'pg') ? bestOption : multiAnswers;
    }
    return result;
}

function flattenPaper(sourceMat, corners) {
    let warpedMat = new cv.Mat();
    let dsize = new cv.Size(800, 1000);
    
    let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners[0].x, corners[0].y,
        corners[1].x, corners[1].y,
        corners[2].x, corners[2].y,
        corners[3].x, corners[3].y
    ]);
    
    let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0, 800, 0, 800, 1000, 0, 1000
    ]);

    let M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(sourceMat, warpedMat, M, dsize);
    
    srcTri.delete(); dstTri.delete(); M.delete();
    return warpedMat;
}

function extractAnswersFromFlatImage(warpedMat) {
    let threshMat = new cv.Mat();
    cv.adaptiveThreshold(warpedMat, threshMat, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 5);

    let pgAnswers = readOMRGrid(threshMat, GRID_CONFIG.pg, 'pg');
    let mcmaAnswers = readOMRGrid(threshMat, GRID_CONFIG.mcma, 'mcma');
    let kategoriAnswers = readOMRGrid(threshMat, GRID_CONFIG.kategori, 'kategori');

    threshMat.delete();

    return { pg: pgAnswers, mcma: mcmaAnswers, kategori: kategoriAnswers };
}

function generateVisualOverlays(studentAnswers, masterKey) {
    let overlays = [];

    const addDot = (cfg, r, optChar, color) => {
        let c = cfg.options.indexOf(optChar);
        if (c !== -1) {
            let cx = cfg.startX + (c * cfg.spacingX) + (cfg.boxW / 2);
            let cy = cfg.startY + (r * cfg.spacingY) + (cfg.boxH / 2);
            overlays.push({ x: cx, y: cy, color: color });
        }
    };

    for (let r = 0; r < GRID_CONFIG.pg.rows; r++) {
        let no = r + 1;
        let masterAns = masterKey.pg[no];
        let studentAns = studentAnswers.pg[no];

        if (masterAns) addDot(GRID_CONFIG.pg, r, masterAns, '#FFFF00');
        if (studentAns) {
            let color = (studentAns === masterAns) ? '#00FF00' : '#FF0000';
            addDot(GRID_CONFIG.pg, r, studentAns, color);
        }
    }

    return overlays;
}

function extractMasterKey() {
    if (!window.cvIsLoaded || !grayMat || !currentCorners) {
        alert("Posisikan tabel hingga muncul kotak hijau!");
        return false;
    }
    
    let flatMat = flattenPaper(grayMat, currentCorners);
    AppState.masterKey = extractAnswersFromFlatImage(flatMat);
    flatMat.delete();

    AppState.overlayData = [];
    for (let r = 0; r < GRID_CONFIG.pg.rows; r++) {
        let ans = AppState.masterKey.pg[r + 1];
        if (ans) {
            let c = GRID_CONFIG.pg.options.indexOf(ans);
            if (c !== -1) {
                let cx = GRID_CONFIG.pg.startX + (c * GRID_CONFIG.pg.spacingX) + (GRID_CONFIG.pg.boxW / 2);
                let cy = GRID_CONFIG.pg.startY + (r * GRID_CONFIG.pg.spacingY) + (GRID_CONFIG.pg.boxH / 2);
                AppState.overlayData.push({ x: cx, y: cy, color: '#FFFF00' });
            }
        }
    }

    return true; 
}

function processStudentSheet(width, height) {
    AppState.mode = 'paused';
    
    let flatMat = flattenPaper(grayMat, currentCorners);
    let studentAnswers = extractAnswersFromFlatImage(flatMat);
    flatMat.delete();

    AppState.overlayData = generateVisualOverlays(studentAnswers, AppState.masterKey);

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
