// vision.js

let srcMat = null;
let grayMat = null;
let threshMat = null;
let horizMat = null;

let anchorPoint = null; // Menyimpan koordinat (x, y) dari garis tebal kop surat

// Konfigurasi posisi tabel RELATIF terhadap garis tebal header (Anchor Point)
const RELATIVE_GRID = {
    pg_left:  { offsetX: 0,   offsetY: 170, rows: 5, cols: 5, boxW: 30, boxH: 25, spacingX: 42, spacingY: 30, options: ['A','B','C','D','E'] },
    pg_right: { offsetX: 320, offsetY: 170, rows: 5, cols: 5, boxW: 30, boxH: 25, spacingX: 42, spacingY: 30, options: ['A','B','C','D','E'] },
    mcma:     { offsetX: 0,   offsetY: 380, rows: 5, cols: 5, boxW: 30, boxH: 25, spacingX: 42, spacingY: 30, options: ['A','B','C','D','E'] },
    kategori: { offsetX: 0,   offsetY: 570, rows: 5, cols: 3, boxW: 40, boxH: 25, spacingX: 65, spacingY: 30, options: ['B','S','B'] }
};

// Fungsi khusus mencari Garis Panjang Horizontal di bagian Kop Surat
function findHeaderLine(thresh) {
    if (!horizMat) horizMat = new cv.Mat();

    // Filter Morfologi: Isolasi garis horizontal panjang (abaikan teks dan huruf kecil)
    let kernelSize = Math.round(thresh.cols * 0.4); // Garis minimal 40% lebar layar
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, 1));
    cv.morphologyEx(thresh, horizMat, cv.MORPH_OPEN, kernel);
    kernel.delete();

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(horizMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let topY = Infinity;
    let bestAnchor = null;

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let rect = cv.boundingRect(cnt);

        // Cari garis tebal teratas (Kop Surat)
        if (rect.width > thresh.cols * 0.4 && rect.y < topY && rect.y > thresh.rows * 0.05) {
            topY = rect.y;
            bestAnchor = { x: rect.x, y: rect.y, width: rect.width };
        }
    }

    contours.delete();
    hierarchy.delete();

    return bestAnchor;
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
    cv.adaptiveThreshold(grayMat, threshMat, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 8);

    // Deteksi Garis Tebal Kop Surat
    anchorPoint = findHeaderLine(threshMat);
    
    ctxOverlay.clearRect(0, 0, width, height);
    
    if (anchorPoint) {
        // Gambar GARIS HIJAU menindih garis tebal kop surat sebagai tanda terkunci
        ctxOverlay.strokeStyle = "#00FF00";
        ctxOverlay.lineWidth = 4;
        ctxOverlay.beginPath();
        ctxOverlay.moveTo(anchorPoint.x, anchorPoint.y);
        ctxOverlay.lineTo(anchorPoint.x + anchorPoint.width, anchorPoint.y);
        ctxOverlay.stroke();

        // Menggambar Overlay Titik Jawaban di Layar
        drawOverlays(ctxOverlay);

        if (AppState.mode === 'student') {
            processStudentSheet();
        }
    } else {
        // Tampilkan garis bantu jika garis tebal belum terdeteksi
        ctxOverlay.strokeStyle = "rgba(255, 0, 0, 0.5)";
        ctxOverlay.lineWidth = 2;
        ctxOverlay.strokeRect(width * 0.05, height * 0.1, width * 0.9, height * 0.02);
    }
}

function drawOverlays(ctx) {
    if (!AppState.overlayData || AppState.overlayData.length === 0 || !anchorPoint) return;

    AppState.overlayData.forEach(item => {
        let screenX = anchorPoint.x + item.relX;
        let screenY = anchorPoint.y + item.relY;

        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });
}

function readGridSection(thresh, cfg, anchor, tipe = 'pg') {
    let result = {};
    for (let r = 0; r < cfg.rows; r++) {
        let maxPixels = 0;
        let bestOption = '';
        let multiAnswers = [];
        
        for (let c = 0; c < cfg.cols; c++) {
            let x = anchor.x + cfg.offsetX + (c * cfg.spacingX);
            let y = anchor.y + cfg.offsetY + (r * cfg.spacingY);
            
            if (x >= 0 && y >= 0 && x + cfg.boxW <= thresh.cols && y + cfg.boxH <= thresh.rows) {
                let rect = new cv.Rect(x, y, cfg.boxW, cfg.boxH);
                let roi = thresh.roi(rect);
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

function extractAnswersFromSheet() {
    let pg1 = readGridSection(threshMat, RELATIVE_GRID.pg_left, anchorPoint, 'pg');
    let pg2 = readGridSection(threshMat, RELATIVE_GRID.pg_right, anchorPoint, 'pg');
    
    // Gabungkan PG No 1-5 dan No 6-10
    let fullPG = { ...pg1 };
    for (let no in pg2) {
        fullPG[parseInt(no) + 5] = pg2[no];
    }

    let mcmaAnswers = readGridSection(threshMat, RELATIVE_GRID.mcma, anchorPoint, 'mcma');
    let kategoriAnswers = readGridSection(threshMat, RELATIVE_GRID.kategori, anchorPoint, 'kategori');

    // Penyesuaian kunci nomor untuk MCMA (11-15) dan Kategori (16-20)
    let mappedMCMA = {};
    for (let no in mcmaAnswers) mappedMCMA[parseInt(no) + 10] = mcmaAnswers[no];

    let mappedKategori = {};
    for (let no in kategoriAnswers) mappedKategori[parseInt(no) + 15] = kategoriAnswers[no];

    return { pg: fullPG, mcma: mappedMCMA, kategori: mappedKategori };
}

function generateOverlays(studentAnswers, masterKey) {
    let overlays = [];

    const addDot = (cfg, r, optChar, color) => {
        let c = cfg.options.indexOf(optChar);
        if (c !== -1) {
            let relX = cfg.offsetX + (c * cfg.spacingX) + (cfg.boxW / 2);
            let relY = cfg.offsetY + (r * cfg.spacingY) + (cfg.boxH / 2);
            overlays.push({ relX: relX, relY: relY, color: color });
        }
    };

    // PG 1-5 & 6-10
    for (let r = 0; r < 5; r++) {
        let noLeft = r + 1;
        let noRight = r + 6;

        if (masterKey.pg[noLeft]) addDot(RELATIVE_GRID.pg_left, r, masterKey.pg[noLeft], '#FFFF00');
        if (studentAnswers.pg[noLeft]) {
            let col = (studentAnswers.pg[noLeft] === masterKey.pg[noLeft]) ? '#00FF00' : '#FF0000';
            addDot(RELATIVE_GRID.pg_left, r, studentAnswers.pg[noLeft], col);
        }

        if (masterKey.pg[noRight]) addDot(RELATIVE_GRID.pg_right, r, masterKey.pg[noRight], '#FFFF00');
        if (studentAnswers.pg[noRight]) {
            let col = (studentAnswers.pg[noRight] === masterKey.pg[noRight]) ? '#00FF00' : '#FF0000';
            addDot(RELATIVE_GRID.pg_right, r, studentAnswers.pg[noRight], col);
        }
    }

    return overlays;
}

function extractMasterKey() {
    if (!window.cvIsLoaded || !grayMat || !anchorPoint) {
        alert("Posisikan kamera hingga garis hijau menindih garis tebal kop surat!");
        return false;
    }
    
    AppState.masterKey = extractAnswersFromSheet();

    // Buat overlay titik kuning untuk kunci master
    AppState.overlayData = [];
    for (let r = 0; r < 5; r++) {
        let ansL = AppState.masterKey.pg[r + 1];
        if (ansL) {
            let c = RELATIVE_GRID.pg_left.options.indexOf(ansL);
            if (c !== -1) {
                let rx = RELATIVE_GRID.pg_left.offsetX + (c * RELATIVE_GRID.pg_left.spacingX) + (RELATIVE_GRID.pg_left.boxW / 2);
                let ry = RELATIVE_GRID.pg_left.offsetY + (r * RELATIVE_GRID.pg_left.spacingY) + (RELATIVE_GRID.pg_left.boxH / 2);
                AppState.overlayData.push({ relX: rx, relY: ry, color: '#FFFF00' });
            }
        }
    }

    return true; 
}

function processStudentSheet() {
    AppState.mode = 'paused';
    
    let studentAnswers = extractAnswersFromSheet();
    AppState.overlayData = generateOverlays(studentAnswers, AppState.masterKey);

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
