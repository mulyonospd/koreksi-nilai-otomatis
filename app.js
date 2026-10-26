// app.js

// Objek untuk menyimpan status (state) global aplikasi
const AppState = {
    mode: 'idle', // Status saat ini: 'idle', 'master' (baca kunci), 'student' (baca siswa), 'paused' (saat pop-up muncul)
    weights: {
        pg: 1,
        mcma: [1, 2, 3], // Poin untuk [1 benar, 2 benar, 3 benar]
        kategori: 1
    },
    masterKey: null // Akan menyimpan matriks jawaban dari scan pertama
};

// Seleksi elemen DOM
const screenSettings = document.getElementById('screen-settings');
const screenCamera = document.getElementById('screen-camera');
const popupResult = document.getElementById('popup-result');
const controlMaster = document.getElementById('control-master');
const instructionText = document.getElementById('instruction-text');

// Tombol
const btnStartMaster = document.getElementById('btn-start-master');
const btnLockMaster = document.getElementById('btn-lock-master');
const btnEndSession = document.getElementById('btn-end-session');
const btnNextScan = document.getElementById('btn-next-scan');
const btnRescan = document.getElementById('btn-rescan');

// 1. Event: Tombol "Simpan & Lanjut ke Kunci Jawaban"
btnStartMaster.addEventListener('click', () => {
    // Ambil input bobot dari halaman pengaturan
    AppState.weights.pg = parseFloat(document.getElementById('weight-pg').value) || 1;
    AppState.weights.mcma = [
        parseFloat(document.getElementById('weight-mcma-1').value) || 1,
        parseFloat(document.getElementById('weight-mcma-2').value) || 2,
        parseFloat(document.getElementById('weight-mcma-3').value) || 3
    ];
    AppState.weights.kategori = parseFloat(document.getElementById('weight-kategori').value) || 1;

    // Transisi UI
    screenSettings.classList.remove('active');
    screenCamera.classList.add('active');
    instructionText.innerText = "Arahkan ke lembar KUNCI JAWABAN";
    controlMaster.style.display = 'block'; // Tampilkan tombol Kunci Jawaban
    
    AppState.mode = 'master'; // Set mode aplikasi ke pembacaan kunci
    
    // Panggil fungsi menyalakan kamera (akan didefinisikan di camera.js)
    if (typeof startCamera === 'function') {
        startCamera();
    }
});

// 2. Event: Tombol "Kunci Peta Jawaban"
btnLockMaster.addEventListener('click', () => {
    // Fungsi extractMasterKey() akan didefinisikan di vision.js / scoring.js
    if (typeof extractMasterKey === 'function') {
        const isSuccess = extractMasterKey();
        
        if (isSuccess) {
            alert("Kunci Jawaban Tersimpan!");
            // Ubah UI dan mode ke pemindaian siswa
            AppState.mode = 'student';
            instructionText.innerText = "Arahkan ke lembar JAWABAN SISWA";
            controlMaster.style.display = 'none'; // Sembunyikan tombol
        } else {
            alert("Gagal membaca lembar. Pastikan kotak pada kertas sejajar dengan garis hijau di layar.");
        }
    } else {
        console.warn("Fungsi extractMasterKey belum tersedia.");
    }
});

// 3. Event: Tombol "Akhiri Sesi"
btnEndSession.addEventListener('click', () => {
    // Matikan kamera
    if (typeof stopCamera === 'function') {
        stopCamera();
    }
    
    // Reset UI dan State
    screenCamera.classList.remove('active');
    screenSettings.classList.add('active');
    popupResult.classList.add('hidden');
    
    AppState.mode = 'idle';
    AppState.masterKey = null; // Hapus data kunci jawaban dari memori
});

// 4. Event: Tombol "Lanjut Scan" (Di dalam Pop-up)
btnNextScan.addEventListener('click', () => {
    popupResult.classList.add('hidden'); // Tutup pop-up
    AppState.mode = 'student'; // Aktifkan lagi mode deteksi kamera
});

// 5. Event: Tombol "Pindai Ulang" (Di dalam Pop-up)
btnRescan.addEventListener('click', () => {
    popupResult.classList.add('hidden'); // Tutup pop-up
    AppState.mode = 'student'; // Aktifkan lagi mode deteksi tanpa menyimpan nilai sebelumnya
});

// --- Fungsi Global untuk Dipanggil oleh Modul Lain ---

// Fungsi ini akan dipanggil oleh vision.js / scoring.js ketika kertas siswa berhasil diproses
function showResultPopup(nis, totalScore, scorePG, scoreKompleks, scoreKategori) {
    AppState.mode = 'paused'; // Hentikan kamera sementara (freeze)
    
    document.getElementById('result-nis').innerText = `Nomor Siswa: ${nis}`;
    document.getElementById('result-total').innerText = `Skor Akhir: ${totalScore}`;
    document.getElementById('result-details').innerText = `PG: ${scorePG} | Kompleks: ${scoreKompleks} | Kategori: ${scoreKategori}`;
    
    popupResult.classList.remove('hidden'); // Munculkan pop-up
}
