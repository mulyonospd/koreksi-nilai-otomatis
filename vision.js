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
function extractMasterKey() {
    if (!cvReady || !grayMat) return false;

    console.log("Memproses Kunci Jawaban Master...");
    
    // Logika OpenCV:
    // 1. Lakukan pemotongan (crop) area tabel I, II, dan III
    // 2. Loop setiap kotak opsi A, B, C, D, E.
    // 3. Deteksi kepadatan piksel hitam / garis bersilang di dalam kotak tersebut.
    
    // Matriks data dummy (Sebagai cetak biru untuk dilanjutkan developer)
    AppState.masterKey = {
        pg: { 1: 'A', 2: 'C', 3: 'D', 4: 'B', 5: 'E' }, // dst...
        mcma: { 11: ['A', 'C'], 12: ['B', 'D', 'E'] }, // dst...
        kategori: { 16: ['B', 'S', 'B'], 17: ['S', 'B', 'S'] } // dst...
    };

    return true; // Berhasil membaca
}

// Fungsi untuk membaca kertas siswa, OCR, dan menghitung nilai
function processStudentSheet(width, height) {
    // 1. Ubah state ke 'paused' agar kamera berhenti memindai berulang-ulang
    AppState.mode = 'paused';
    
    // 2. Ekstrak pola silang siswa dari frame saat ini (grayMat)
    // (Logika OpenCV membaca letak coretan siswa yang identik dengan proses extractMasterKey)
    let studentAnswers = {
        pg: { 1: 'A', 2: 'B' }, // Misal nomor 2 salah karena master kuncinya C
        mcma: { 11: ['A', 'C'] },
        kategori: { 16: ['B', 'S', 'S'] }
    };

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
