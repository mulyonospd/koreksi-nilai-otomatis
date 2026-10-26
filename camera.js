// camera.js

// Seleksi elemen video dan canvas dari DOM
const videoElement = document.getElementById('video-feed');
const canvasOverlay = document.getElementById('canvas-overlay');
const ctxOverlay = canvasOverlay.getContext('2d');

// Variabel untuk menyimpan aliran media (stream) agar bisa dimatikan nanti
let currentStream = null;
let animationFrameId = null;

// Fungsi untuk menyalakan kamera belakang
async function startCamera() {
    // Cek apakah peramban mendukung API MediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Kamera tidak didukung oleh peramban ini. Gunakan Chrome atau Safari terbaru.");
        return;
    }

    // Pengaturan kamera: wajibkan kamera belakang (environment) dan resolusi tinggi
    const constraints = {
        video: {
            facingMode: 'environment',
            width: { ideal: 1920 }, // Resolusi tinggi penting untuk akurasi OCR dan OMR
            height: { ideal: 1080 }
        }
    };

    try {
        // Meminta akses kamera
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Memasukkan aliran video ke elemen <video>
        videoElement.srcObject = currentStream;
        
        // Menunggu sampai metadata video dimuat agar ukuran video diketahui
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            
            // Sesuaikan ukuran canvas overlay dengan ukuran video asli
            canvasOverlay.width = videoElement.videoWidth;
            canvasOverlay.height = videoElement.videoHeight;
            
            // Mulai siklus pemrosesan frame video
            startVideoProcessing();
        };
    } catch (err) {
        console.error("Gagal mengakses kamera: ", err);
        alert("Gagal membuka kamera. Pastikan Anda telah memberikan izin akses kamera.");
    }
}

// Fungsi untuk mematikan kamera
function stopCamera() {
    if (currentStream) {
        // Hentikan setiap track video yang sedang berjalan
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    
    // Hentikan siklus pemrosesan video
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Kosongkan elemen video dan canvas
    videoElement.srcObject = null;
    ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
}

// Fungsi putaran (loop) untuk menangkap frame kamera terus-menerus
function startVideoProcessing() {
    // Pastikan fungsi scanFrame (dari vision.js) sudah dimuat
    if (typeof scanFrame === 'function') {
        // Cek state dari app.js. Jika tidak sedang 'paused' (saat pop-up muncul), proses gambar
        if (AppState.mode !== 'paused' && AppState.mode !== 'idle') {
            scanFrame(videoElement, ctxOverlay, canvasOverlay.width, canvasOverlay.height);
        }
    }
    
    // Panggil fungsi ini lagi pada frame berikutnya secara terus-menerus (kurang lebih 30-60 FPS)
    animationFrameId = requestAnimationFrame(startVideoProcessing);
}
