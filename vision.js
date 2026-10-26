// vision.js

let srcMat = null;
let grayMat = null;
let edgesMat = null;
let currentCorners = null; // Menyimpan 4 titik sudut kertas/tabel

// 1. Fungsi Pembantu: Mengurutkan 4 titik (Kiri Atas, Kanan Atas, Kanan Bawah, Kiri Bawah)
function sortCorners(corners) {
    corners.sort((a, b) => a.y - b.y);
    let top = corners.slice(0, 2).sort((a, b) => a.x - b.x);
    let bottom = corners.slice(2, 4).sort((a, b) => a.x - b.x);
    // Kembalikan urutan: TL (Top-Left), TR (Top-Right), BR (Bottom-Right), BL (Bottom-Left)
    return [top[0], top[1], bottom[1], bottom[0]];
}

// 2. Fungsi Pembantu: Mencari 4 sudut dari objek kotak terbesar (Tabel/Kertas)
function findPaperCorners(contours) {
    let maxArea = 0;
    let bestCorners = null;

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        
        // Jika areanya cukup besar
        if (area > 20000) {
            let peri = cv.arcLength(cnt, true);
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
            
            // Jika bentuknya punya 4 sudut (segi empat)
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

// 3. Looping Kamera
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
    // Sedikit blur agar garis lebih solid
    let blurred = new cv.Mat();
    cv.GaussianBlur(grayMat, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edgesMat, 75, 200, 3, false);
    blurred.delete();

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edgesMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Cari 4 sudut kertas
    currentCorners = findPaperCorners(contours);
    
    ctxOverlay.clearRect(0, 0, width, height);
    
    // Jika 4 sudut terdeteksi, gambar kotak mengikuti miringnya kertas
    if (currentCorners) {
        ctxOverlay.strokeStyle = "#00FF00";
        ctxOverlay.lineWidth = 3;
        ctxOverlay.beginPath();
        ctxOverlay.moveTo(currentCorners[0].x, currentCorners[0].y);
        ctxOverlay.lineTo(currentCorners[1].x, currentCorners[1].y);
        ctxOverlay.lineTo(currentCorners[2].x, currentCorners[2].y);
        ctxOverlay.lineTo(currentCorners[3].x, currentCorners[3].y);
        ctxOverlay.closePath();
        ctxOverlay.stroke();

        // Jika mode scan siswa aktif, langsung jepret!
        if (AppState.mode === 'student') {
            processStudentSheet(width, height);
        }
    } else {
        // Panduan jika kertas belum pas
        ctxOverlay.strokeStyle = "rgba(255, 0, 0, 0.5)";
        ctxOverlay.lineWidth = 2;
        ctxOverlay.strokeRect(width * 0.1, height * 0.2, width * 0.8, height * 0.6);
    }

    contours.delete();
    hierarchy.delete();
}

// 4. Fungsi Pembaca Piksel Grid (Diperbarui dengan opsi Tipe Soal)
function readOMRGrid(threshMat, startX, startY, rows, cols, boxW, boxH, spacingX, spacingY, tipe = 'pg') {
    let result = {};
    let options = (tipe === 'kategori') ? ['B', 'S', 'B'] : ['A', 'B', 'C', 'D', 'E']; 
    
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
                let pixelCount = cv.countNonZero(roi); // Hitung tinta
                
                if (pixelCount > 100) { // Sensitivitas (Bisa diubah jika kurang peka)
                    if (tipe === 'mcma' || tipe === 'kategori') {
                        multiAnswers.push(options[c]);
                    } else { // Untuk PG biasa, cari piksel terbanyak
                        if (pixelCount > maxPixels) {
                            maxPixels = pixelCount;
                            bestOption = options[c];
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

// 5. Fungsi Warp Perspective (Meluruskan Kertas)
function flattenPaper(sourceMat, corners) {
    // Kita paksa gambar yang miring ditarik jadi kanvas datar ukuran 800 x 1000 piksel
    let warpedMat = new cv.Mat();
    let dsize = new cv.Size(800, 1000);
    
    let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners[0].x, corners[0].y, // TL
        corners[1].x, corners[1].y, // TR
        corners[2].x, corners[2].y, // BR
        corners[3].x, corners[3].y  // BL
    ]);
    
    let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,          // TL
        800, 0,        // TR
        800, 1000,     // BR
        0, 1000        // BL
    ]);

    let M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(sourceMat, warpedMat, M, dsize);
    
    srcTri.delete(); dstTri.delete(); M.delete();
    return warpedMat; // Gambar kembalian ukurannya PASTI 800x1000
}

// --- FUNGSI EKSEKUSI PEMBACAAN ---

function extractAnswersFromFlatImage(warpedMat) {
    let threshMat = new cv.Mat();
    // Menggunakan Adaptive Threshold untuk menghilangkan efek bayangan lampu
    cv.adaptiveThreshold(warpedMat, threshMat, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 5);

    /* 
     * =========================================================
     * AREA KALIBRASI (KARENA GAMBAR KINI SELALU 800x1000 PIKSEL)
     * =========================================================
     * Nilai di bawah adalah PIKSEL TETAP, bukan persentase lagi.
     * Silakan ubah angka startX dan startY ini sesuai bentuk tabel di kertas Anda.
     */
     
    // 1. Baca PG Sederhana (Misal tabel ada di atas: X:100, Y:200)
    let pgAnswers = readOMRGrid(threshMat, 100, 200, 10, 5, 30, 30, 45, 45, 'pg');

    // 2. Baca PG Kompleks (Misal tabel ada di tengah: X:100, Y:600)
    // Tipe diset 'mcma' agar bisa menampung 2 atau 3 jawaban.
    let mcmaAnswers = readOMRGrid(threshMat, 100, 600, 5, 5, 30, 30, 45, 45, 'mcma');

    // 3. Baca Kategori B/S (Misal tabel ada di sebelah kanan: X:500, Y:200)
    // Tipe diset 'kategori' agar opsi jadi ['B', 'S'] dan bisa menampung multi.
    let kategoriAnswers = readOMRGrid(threshMat, 500, 200, 5, 3, 30, 30, 45, 45, 'kategori');

    threshMat.delete();

    return {
        pg: pgAnswers,
        mcma: mcmaAnswers, 
        kategori: kategoriAnswers 
    };
}

function extractMasterKey() {
    if (!window.cvIsLoaded || !grayMat || !currentCorners) {
        alert("Posisikan tabel hingga muncul garis hijau mengikuti kertas!");
        return false;
    }
    
    // 1. Tarik gambar jadi datar 800x1000
    let flatMat = flattenPaper(grayMat, currentCorners);
    
    // 2. Ekstrak jawaban dari gambar datar tersebut
    AppState.masterKey = extractAnswersFromFlatImage(flatMat);
    flatMat.delete();

    console.log("Kunci Master:", AppState.masterKey); // Cek F12 jika ingin melihat hasil baca
    return true; 
}

function processStudentSheet(width, height) {
    AppState.mode = 'paused';
    
    // 1. Tarik gambar siswa jadi datar 800x1000
    let flatMat = flattenPaper(grayMat, currentCorners);
    
    // 2. Ekstrak jawaban siswa dengan koordinat presisi yang sama dengan master
    let studentAnswers = extractAnswersFromFlatImage(flatMat);
    flatMat.delete();

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
