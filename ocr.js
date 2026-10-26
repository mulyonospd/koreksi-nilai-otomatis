// ocr.js

/**
 * Modul ini menggunakan Tesseract.js untuk membaca angka tulisan tangan 
 * pada area isian "Nomor" di lembar jawab.
 * Seluruh pemrosesan teks berjalan secara lokal di RAM browser (tanpa internet).
 */

// Fungsi ini dipanggil oleh vision.js dan mengembalikan Promise berupa teks nomor siswa
async function extractNISFromImage() {
    return new Promise((resolve, reject) => {
        console.log("Memulai proses OCR untuk membaca Nomor Siswa...");

        // 1. Ambil elemen video yang berisi frame kamera saat ini yang sedang membeku (freeze)
        const videoElement = document.getElementById('video-feed');
        
        // 2. Buat canvas sementara (virtual canvas) di memori untuk memotong (crop) area khusus "Nomor"
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        /* 
         * [CATATAN UNTUK DEVELOPER]: 
         * Koordinat crop (x, y, width, height) di bawah ini adalah rasio estimasi. 
         * Pada implementasi nyata, koordinat ini harus dinamis mengambil data dari kontur 
         * kotak tabel OpenCV di vision.js agar letaknya presisi meskipun kertas agak bergeser.
         */
        const cropX = videoElement.videoWidth * 0.5;   // Estimasi: Area nomor ada di paruh kanan atas
        const cropY = videoElement.videoHeight * 0.05; // Estimasi: 5% dari batas atas kertas
        const cropWidth = videoElement.videoWidth * 0.4;
        const cropHeight = videoElement.videoHeight * 0.1;

        tempCanvas.width = cropWidth;
        tempCanvas.height = cropHeight;

        // 3. Salin HANYA bagian kotak "Nomor" dari kamera ke canvas sementara
        tempCtx.drawImage(
            videoElement, 
            cropX, cropY, cropWidth, cropHeight, // Area sumber (potongan)
            0, 0, cropWidth, cropHeight          // Area tujuan di canvas virtual
        );

        // (Opsional) Pada tahap ini, developer bisa menambahkan filter thresholding hitam-putih
        // agar guratan pensil tulisan tangan sangat pekat dan mudah dibaca oleh AI Tesseract.

        // 4. Jalankan Tesseract.js pada potongan gambar tersebut
        Tesseract.recognize(
            tempCanvas,
            'eng', // Menggunakan engine dasar (angka universal)
            {
                logger: m => console.log(`Proses OCR: ${m.status} (${Math.round(m.progress * 100)}%)`),
                tessedit_char_whitelist: '0123456789' // SANGAT PENTING: Batasi agar AI HANYA menebak angka
            }
        ).then(({ data: { text } }) => {
            
            // 5. Bersihkan hasil teks (buang spasi atau karakter ghaib jika ada)
            const cleanNIS = text.replace(/[^0-9]/g, '');
            
            if (cleanNIS.length > 0) {
                console.log("Berhasil membaca Nomor Siswa:", cleanNIS);
                resolve(cleanNIS); // Kirim hasil (misal: "1234") ke vision.js
            } else {
                console.warn("Nomor kosong atau terlalu tipis.");
                resolve("TIDAK TERBACA"); // Berikan nilai default agar aplikasi tidak error
            }
            
        }).catch(err => {
            console.error("Terjadi kesalahan pada modul OCR:", err);
            reject(err);
        });
    });
}
