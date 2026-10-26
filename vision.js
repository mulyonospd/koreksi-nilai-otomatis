// vision.js

// Memastikan library OpenCV sudah termuat sebelum eksekusi
let cvReady = false;
cv['onRuntimeInitialized'] = () => {
    cvReady = true;
    console.log("OpenCV.js siap digunakan.");
};

// Variabel matriks gambar (Mat) untuk memori sementara
let srcMat = null;
let grayMat = null;
let edgesMat = null;

// Fungsi utama yang dipanggil berulang kali (looping) oleh camera.js
function scanFrame(videoElement, ctxOverlay, width, height) {
    if (!cvReady) return; // Tunggu sampai OpenCV selesai dimuat

    // Inisialisasi memori matriks jika belum ada
    if (!srcMat) {
        srcMat = new cv.Mat(height, width, cv.CV_8UC4);
        grayMat = new cv.Mat(height, width, cv.CV_8UC1);
        edgesMat = new cv.Mat(height, width, cv.CV_8UC1);
    }

    // 1. Tangkap frame video saat ini ke dalam canvas
    ctxOverlay.drawImage(videoElement, 0, 0, width, height);
    let imageData = ctxOverlay.getImageData(0, 0, width, height);
    
    // 2. Masukkan data piksel gambar ke matriks OpenCV
    srcMat.data.set(imageData.data);

    // 3. Pemrosesan Gambar: Ubah ke Grayscale (Hitam-Putih)
    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY, 0);

    // 4. Deteksi Tepi (Edge Detection) menggunakan algoritma Canny
    // Ini berfungsi menonjolkan garis tabel dan coretan silang (X)
    cv.Canny(grayMat, edgesMat, 50, 150, 3, false);

    // 5. Pencarian Kontur (Mencari kotak tabel utama sebagai jangkar/anchor)
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edgesMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Analisis apakah kertas sudah terdeteksi di posisi yang pas
    let isPaperAligned = detectPaperAlignment(contours, ctxOverlay, width, height);

    // Bersihkan gambar dari kanvas overlay agar tidak menumpuk, lalu gambar ulang indikator visual
    ctxOverlay.clearRect(0, 0, width, height);
    
    if (isPaperAligned) {
        // Tampilkan indikator kotak hijau di layar bahwa kertas siap dipindai
        ctxOverlay.strokeStyle = "#00FF00";
        ctxOverlay.lineWidth = 3;
        ctxOverlay.strokeRect(width * 0.1, height * 0.2, width * 0.8, height * 0.6); // Kotak imajiner

        // Jika mode siswa aktif dan kertas sejajar, langsung proses penilaian!
        if (AppState.mode === 'student') {
            processStudentSheet(width, height);
        }
    }

    // Bebaskan memori kontur untuk mencegah kebocoran memori (memory leak) di RAM HP
    contours.delete();
    hierarchy.delete();
}

// Fungsi mendeteksi apakah tabel soal sudah masuk di tengah frame kamera
function detectPaperAlignment(contours, ctx, width, height) {
    // Di aplikasi nyata, bagian ini akan memfilter kontur berdasarkan luas (area)
    // untuk mencari bentuk kotak tabel "I. PILIHAN GANDA SEDERHANA"
    // Untuk simulasi ini, kita anggap true jika ada kontur cukup besar terdeteksi.
    let maxArea = 0;
    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area > maxArea) maxArea = area;
    }
    // Jika area garis tabel cukup dominan di layar (misal > 50000 piksel)
    return maxArea > 50000; 
}

// Fungsi dipanggil saat tombol "Kunci Peta Jawaban" ditekan di app.js

// --- KODE PEMBACAAN PIKSEL ASLI (PENGGANTI BLUEPRINT) ---

// Fungsi bantuan untuk membaca grid jawaban (Menghitung jumlah tinta/tanda silang)
function readOMRGrid(threshMat, startX, startY, rows, cols, boxW, boxH, spacingX, spacingY, isMultiAnswer = false) {
    let result = {};
    let options = ['A', 'B', 'C', 'D', 'E']; // Opsi standar
    
    for (let r = 0; r < rows; r++) {
        let maxPixels = 0;
        let bestOption = '';
        let multiAnswers = [];
        
        for (let c = 0; c < cols; c++) {
            let x = startX + (c * spacingX);
            let y = startY + (r * spacingY);
            
            // Pastikan koordinat tidak keluar dari layar kamera
            if (x >= 0 && y >= 0 && x + boxW <= threshMat.cols && y + boxH <= threshMat.rows) {
                let rect = new cv.Rect(x, y, boxW, boxH);
                let roi = threshMat.roi(rect);
                
                // Hitung jumlah piksel putih (tinta pensil/pulpen yang sudah di-threshold)
                let pixelCount = cv.countNonZero(roi);
                
                // Angka 150 adalah sensitivitas (bisa dinaikkan jika terlalu sensitif)
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

// Fungsi memproses Kunci Jawaban Master (Real Pixel Reading)
function extractMasterKey() {
    if (!cvReady || !grayMat) return false;
    
    // Ubah gambar jadi hitam putih murni (tinta hitam jadi putih agar mudah dihitung)
    let threshMat = new cv.Mat();
    cv.threshold(grayMat, threshMat, 100, 255, cv.THRESH_BINARY_INV);

    /* 
     * [KALIBRASI KOORDINAT PENTING]
     * Nilai x, y, width, height di bawah ini adalah rasio dari layar kamera.
     * Anda/Developer harus mengatur angka ini agar pas dengan posisi tabel PG di kertas.
     * Contoh di bawah: Membaca tabel PG Sederhana (10 soal, 5 opsi).
     */
    let pgAnswers = readOMRGrid(
        threshMat, 
        Math.round(grayMat.cols * 0.1), // startX (Mulai dari 10% lebar layar kiri)
        Math.round(grayMat.rows * 0.3), // startY (Mulai dari 30% tinggi layar atas)
        10, // Jumlah baris (10 soal)
        5,  // Jumlah opsi (A,B,C,D,E)
        Math.round(grayMat.cols * 0.05), // Lebar 1 kotak opsi
        Math.round(grayMat.rows * 0.03), // Tinggi 1 kotak opsi
        Math.round(grayMat.cols * 0.08), // Jarak antar kotak ke samping (spacingX)
        Math.round(grayMat.rows * 0.05)  // Jarak antar kotak ke bawah (spacingY)
    );

    threshMat.delete(); // Bersihkan memori

    // Simpan ke State
    AppState.masterKey = {
        pg: pgAnswers,
        // Untuk tabel Kompleks dan Kategori, panggil fungsi readOMRGrid lagi 
        // dengan startX dan startY yang menunjuk ke tabel bagian bawah kertas.
        mcma: {}, 
        kategori: {} 
    };

    return true; 
}

// Fungsi memproses Kertas Siswa (Real Pixel Reading)
function processStudentSheet(width, height) {
    AppState.mode = 'paused';
    
    let threshMat = new cv.Mat();
    cv.threshold(grayMat, threshMat, 100, 255, cv.THRESH_BINARY_INV);

    // Baca coretan siswa dengan koordinat yang SAMA PERSIS dengan kunci master
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

    // Panggil OCR untuk membaca NIS
    extractNISFromImage().then((nis) => {
        if (typeof calculateFinalScore === 'function') {
            calculateFinalScore(nis, studentAnswers, AppState.masterKey, AppState.weights);
        }
    }).catch(err => {
        AppState.mode = 'student'; 
    });
}

;

    // 3. Panggil fungsi OCR dari ocr.js untuk membaca nomor siswa di bagian atas kertas
    // Kita kirimkan potongan gambar (crop) khusus area isian Nomor
    extractNISFromImage().then((nis) => {
        
        // 4. Setelah NIS dan Jawaban didapat, panggil algoritma kalkulasi di scoring.js
        if (typeof calculateFinalScore === 'function') {
            calculateFinalScore(nis, studentAnswers, AppState.masterKey, AppState.weights);
        }

    }).catch(err => {
        console.error("Gagal membaca Nomor Siswa:", err);
        // Jika gagal membaca nomor, kembalikan mode ke student agar mencoba scan ulang
        AppState.mode = 'student'; 
    });
}
