// vision.js

let srcMat = null;
let grayMat = null;
let threshMat = null;
let currentCorners = null;

// Konfigurasi Grid pada Gambar Datar (Ukuran Standar 800 x 1000 Piksel)
const GRID_CONFIG = {
    pg_left:  { startX: 100, startY: 340, rows: 5, cols: 5, boxW: 30, boxH: 25, spacingX: 45, spacingY: 30, options: ['A','B','C','D','E'] },
    pg_right: { startX: 450, startY: 340, rows: 5, cols: 5, boxW: 30, boxH: 25, spacingX: 45, spacingY: 30, options: ['A','B','C','D','E'] },
    mcma:     { startX: 100, startY: 530, rows: 5, cols: 5, boxW: 30, boxH: 25, spacingX: 45, spacingY: 30, options: ['A','B','C','D','E'] },
    kategori: { startX: 100, startY: 710, rows: 5, cols: 3, boxW: 40, boxH: 25, spacingX: 65, spacingY: 30, options: ['B','S','B'] }
};

// Algoritma Mencari 4 Kotak Hitam di Setiap Pojok (Corner Markers)
function find4CornerMarkers(thresh) {
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let candidates = [];

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        
        // Filter luas area kotak hitam sudut
        if (area > 100 && area < 15000) {
            let rect = cv.boundingRect(cnt);
            let aspectRatio = rect.width / rect.height;
            let fillRatio = area / (rect.width * rect.height);
            
            // Kotak hitam sudut memiliki rasio 1:1 (persegi) dan terisi pekat (>65%)
            if (aspectRatio >= 0.7 && aspectRatio <= 1.3 && fillRatio > 0.65) {
                let M = cv.moments(cnt);
                if (M.m00 !== 0) {
                    candidates.push({
                        x: M.m10 / M.m00,
                        y: M.m01 / M.m00
                    });
                }
            }
        }
    }

    contours.delete();
    hierarchy.delete();

    // Wajib terdeteksi minimal 4 kotak sudut
    if (candidates.length < 4) return null;

    // Urutkan kandidat berdasarkan posisiY untuk memisahkan 2 atas dan 2 bawah
    candidates.sort((a, b) => a.y - b.y);
    
    let topTwo = candidates.slice(0, 2).sort((a, b) => a.x - b.x); // Top-Left, Top-Right
    let bottomTwo = candidates.slice(-2).sort((a, b) => a.x - b.x); // Bottom-Left, Bottom-Right

    // Kembalikan urutan: TL, TR, BR, BL
    return [topTwo[0], topTwo[1], bottomTwo[1], bottomTwo[0]];
}

function scanFrame(videoElement, ctxOverlay, width, height) {
    if (!window.cvIsLoaded) return; 

    if (!srcMat) {
        srcMat = new cv.Mat(height, width, cv.CV_8UC4);
        grayMat = new cv.Mat(height, width, cv.CV_8UC1);
        threshMat = new cv.Mat(height, width, cv.CV_8UC1);
    }

    ctxOverlay.drawImage(videoElement, 0, 0, width, height);
    let imageData = ctxOverlay.getImageData(0, 0, width, height);
    srcMat.data.set(imageData.data);

    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY, 0);
    // Thresholding untuk mempertegas warna hitam pekat kotak sudut
    cv.threshold(grayMat, threshMat, 100, 255, cv.THRESH_BINARY_INV);

    currentCorners = find4CornerMarkers(threshMat);
    
    ctxOverlay.clearRect(0, 0, width, height);
    
    if (currentCorners) {
        // Gambarkan lingkaran hijau di ke-4 kotak sudut yang berhasil terkunci
        ctxOverlay.strokeStyle = "#00FF00";
        ctxOverlay.lineWidth = 3;
        ctxOverlay.beginPath();
        
        currentCorners.forEach((pt, index) => {
            ctxOverlay.arc(pt.x, pt.y, 12, 0, 2 * Math.PI);
            if (index === 0) ctxOverlay.moveTo(pt.x, pt.y);
            else ctxOverlay.lineTo(pt.x, pt.y);
        });
        
        ctxOverlay.closePath();
        ctxOverlay.stroke();

        drawOverlays(ctxOverlay, currentCorners);

        if (AppState.mode === 'student') {
            processStudentSheet();
        }
    } else {
        // Panduan visual merah jika 4 kotak sudut belum pas di layar
        ctxOverlay.strokeStyle = "rgba(255, 0, 0, 0.4)";
        ctxOverlay.lineWidth = 2;
        ctxOverlay.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9);
    }
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
                
                if (pixelCount > 100) { 
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

function extractAnswersFromFlatImage(warpedMat) {
    let threshWarp = new cv.Mat();
    cv.adaptiveThreshold(warpedMat, threshWarp, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 5);

    let pg1 = readOMRGrid(threshWarp, GRID_CONFIG.pg_left, 'pg');
    let pg2 = readOMRGrid(threshWarp, GRID_CONFIG.pg_right, 'pg');
    
    let fullPG = { ...pg1 };
    for (let no in pg2) {
        fullPG[parseInt(no) + 5] = pg2[no];
    }

    let mcmaAnswers = readOMRGrid(threshWarp, GRID_CONFIG.mcma, 'mcma');
    let kategoriAnswers = readOMRGrid(threshWarp, GRID_CONFIG.kategori, 'kategori');

    let mappedMCMA = {};
    for (let no in mcmaAnswers) mappedMCMA[parseInt(no) + 10] = mcmaAnswers[no];

    let mappedKategori = {};
    for (let no in kategoriAnswers) mappedKategori[parseInt(no) + 15] = kategoriAnswers[no];

    threshWarp.delete();

    return { pg: fullPG, mcma: mappedMCMA, kategori: mappedKategori };
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

    for (let r = 0; r < 5; r++) {
        let noLeft = r + 1;
        let noRight = r + 6;

        if (masterKey.pg[noLeft]) addDot(GRID_CONFIG.pg_left, r, masterKey.pg[noLeft], '#FFFF00');
        if (studentAnswers.pg[noLeft]) {
            let col = (studentAnswers.pg[noLeft] === masterKey.pg[noLeft]) ? '#00FF00' : '#FF0000';
            addDot(GRID_CONFIG.pg_left, r, studentAnswers.pg[noLeft], col);
        }

        if (masterKey.pg[noRight]) addDot(GRID_CONFIG.pg_right, r, masterKey.pg[noRight], '#FFFF00');
        if (studentAnswers.pg[noRight]) {
            let col = (studentAnswers.pg[noRight] === masterKey.pg[noRight]) ? '#00FF00' : '#FF0000';
            addDot(GRID_CONFIG.pg_right, r, studentAnswers.pg[noRight], col);
        }
    }

    return overlays;
}

function extractMasterKey() {
    if (!window.cvIsLoaded || !grayMat || !currentCorners) {
        alert("Posisikan kamera sampai 4 lingkaran hijau mengunci kotak di setiap sudut!");
        return false;
    }
    
    let flatMat = flattenPaper(grayMat, currentCorners);
    AppState.masterKey = extractAnswersFromFlatImage(flatMat);
    flatMat.delete();

    AppState.overlayData = [];
    for (let r = 0; r < 5; r++) {
        let ansL = AppState.masterKey.pg[r + 1];
        if (ansL) {
            let c = GRID_CONFIG.pg_left.options.indexOf(ansL);
            if (c !== -1) {
                let cx = GRID_CONFIG.pg_left.startX + (c * GRID_CONFIG.pg_left.spacingX) + (GRID_CONFIG.pg_left.boxW / 2);
                let cy = GRID_CONFIG.pg_left.startY + (r * GRID_CONFIG.pg_left.spacingY) + (GRID_CONFIG.pg_left.boxH / 2);
                AppState.overlayData.push({ x: cx, y: cy, color: '#FFFF00' });
            }
        }
    }

    return true; 
}

function processStudentSheet() {
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
