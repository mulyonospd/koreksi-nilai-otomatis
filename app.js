// app.js

const AppState = {
    mode: 'idle',
    weights: {
        pg: 1,
        mcma: [1, 2, 3],
        kategori: 1
    },
    masterKey: null,
    overlayData: [] // Menyimpan data titik warna overlay
};

const screenSettings = document.getElementById('screen-settings');
const screenCamera = document.getElementById('screen-camera');
const bottomBanner = document.getElementById('bottom-result-banner');
const controlMaster = document.getElementById('control-master');
const instructionText = document.getElementById('instruction-text');

const btnStartMaster = document.getElementById('btn-start-master');
const btnLockMaster = document.getElementById('btn-lock-master');
const btnEndSession = document.getElementById('btn-end-session');
const btnNextScan = document.getElementById('btn-next-scan');
const btnRescan = document.getElementById('btn-rescan');

btnStartMaster.addEventListener('click', () => {
    AppState.weights.pg = parseFloat(document.getElementById('weight-pg').value) || 1;
    AppState.weights.mcma = [
        parseFloat(document.getElementById('weight-mcma-1').value) || 1,
        parseFloat(document.getElementById('weight-mcma-2').value) || 2,
        parseFloat(document.getElementById('weight-mcma-3').value) || 3
    ];
    AppState.weights.kategori = parseFloat(document.getElementById('weight-kategori').value) || 1;

    screenSettings.classList.remove('active');
    screenCamera.classList.add('active');
    instructionText.innerText = "Arahkan ke lembar KUNCI JAWABAN";
    controlMaster.style.display = 'block';
    
    AppState.mode = 'master';
    
    if (typeof startCamera === 'function') {
        startCamera();
    }
});

btnLockMaster.addEventListener('click', () => {
    if (typeof extractMasterKey === 'function') {
        const isSuccess = extractMasterKey();
        if (isSuccess) {
            alert("Kunci Jawaban Tersimpan!");
            AppState.mode = 'student';
            instructionText.innerText = "Arahkan ke lembar JAWABAN SISWA";
            controlMaster.style.display = 'none';
        }
    }
});

btnEndSession.addEventListener('click', () => {
    if (typeof stopCamera === 'function') {
        stopCamera();
    }
    screenCamera.classList.remove('active');
    screenSettings.classList.add('active');
    bottomBanner.classList.add('hidden');
    
    AppState.mode = 'idle';
    AppState.masterKey = null;
    AppState.overlayData = [];
});

btnNextScan.addEventListener('click', () => {
    bottomBanner.classList.add('hidden');
    AppState.overlayData = [];
    AppState.mode = 'student';
});

btnRescan.addEventListener('click', () => {
    bottomBanner.classList.add('hidden');
    AppState.overlayData = [];
    AppState.mode = 'student';
});

function showResultPopup(nis, totalScore, scorePG, scoreKompleks, scoreKategori) {
    AppState.mode = 'paused';
    
    document.getElementById('result-nis').innerText = `NIS: ${nis}`;
    document.getElementById('result-total').innerText = `Skor: ${totalScore}`;
    document.getElementById('result-details').innerText = `PG: ${scorePG} | Kompleks: ${scoreKompleks} | Kategori: ${scoreKategori}`;
    
    bottomBanner.classList.remove('hidden');
}
