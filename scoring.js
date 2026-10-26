// scoring.js

/**
 * Modul ini bertanggung jawab untuk membandingkan jawaban siswa
 * dengan kunci jawaban master, lalu mengkalkulasi skor berdasarkan
 * bobot nilai yang telah diatur oleh guru di halaman pertama.
 */

// Fungsi ini dipanggil dari processStudentSheet() di vision.js
function calculateFinalScore(nis, studentAnswers, masterKey, weights) {
    console.log(`Menghitung nilai untuk Siswa: ${nis}`);

    let scorePG = 0;
    let scoreKompleks = 0;
    let scoreKategori = 0;

    // 1. Kalkulasi Pilihan Ganda Sederhana
    // Memeriksa setiap nomor pada jawaban siswa di bagian PG Sederhana
    if (studentAnswers.pg && masterKey.pg) {
        for (let no in studentAnswers.pg) {
            // Jika jawaban siswa sama persis dengan kunci master
            if (studentAnswers.pg[no] === masterKey.pg[no]) {
                scorePG += weights.pg; // Tambahkan poin sesuai bobot
            }
        }
    }

    // 2. Kalkulasi Pilihan Ganda Kompleks (MCMA)
    // Siswa bisa memilih lebih dari satu jawaban. Maksimal 3 jawaban benar.
    if (studentAnswers.mcma && masterKey.mcma) {
        for (let no in studentAnswers.mcma) {
            let studentArr = studentAnswers.mcma[no] || [];
            let masterArr = masterKey.mcma[no] || [];
            
            // Hitung berapa banyak silangan siswa yang COCOK dengan kunci
            let correctCount = 0;
            studentArr.forEach(ans => {
                if (masterArr.includes(ans)) {
                    correctCount++;
                }
            });

            // Terapkan sistem Partial Credit (Nilai Sebagian) berdasarkan bobot
            if (correctCount === 1) {
                scoreKompleks += weights.mcma[0]; // Poin untuk 1 benar
            } else if (correctCount === 2) {
                scoreKompleks += weights.mcma[1]; // Poin untuk 2 benar
            } else if (correctCount === 3) {
                scoreKompleks += weights.mcma[2]; // Poin untuk 3 benar (maksimal)
            }
        }
    }

    // 3. Kalkulasi Pilihan Ganda Kategori
    // Ada 3 kolom per nomor. Setiap tebakan (B/S) yang benar dihitung per kolom.
    if (studentAnswers.kategori && masterKey.kategori) {
        for (let no in studentAnswers.kategori) {
            let studentCat = studentAnswers.kategori[no] || [];
            let masterCat = masterKey.kategori[no] || [];
            
            // Loop 3 kolom (indeks 0, 1, dan 2)
            for (let i = 0; i < 3; i++) {
                // Jika silangan di kolom tersebut sama dengan kunci
                if (studentCat[i] && masterCat[i] && studentCat[i] === masterCat[i]) {
                    scoreKategori += weights.kategori; // Tambahkan poin per kolom
                }
            }
        }
    }

    // 4. Total Kalkulasi
    const totalScore = scorePG + scoreKompleks + scoreKategori;

    console.log(`Skor Akhir: ${totalScore} (PG: ${scorePG}, Kompleks: ${scoreKompleks}, Kategori: ${scoreKategori})`);

    // 5. Panggil fungsi di app.js untuk menampilkan Pop-up Hasil di layar kamera
    if (typeof showResultPopup === 'function') {
        showResultPopup(nis, totalScore, scorePG, scoreKompleks, scoreKategori);
    } else {
        console.warn("Fungsi showResultPopup tidak ditemukan di app.js");
    }
}
