const state = {
  scores: { 1: 0, 2: 0 },
  fouls: { 1: 0, 2: 0 },
  running: false,
  ended: false,
  remainingSeconds: 600,
  events: [],
  rules: { common: 2, long: 3, jelly: 1, acro: 2, minutes: 10 },
  interval: null
};

const STORAGE_KEY = "x1-basket-ai-match-v1";
const $ = (id) => document.getElementById(id);
const scoreEls = { 1: $("score1"), 2: $("score2") };
const clockEl = $("clock");
let toastTimer = null;

function speakAI(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }
}

function playerName(player) {
  const value = $(`player${player}Name`).value.trim();
  return value || `JOGADOR ${player === 1 ? "A" : "B"}`;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function saveState() {
  try {
    const savedState = {
      scores: state.scores,
      fouls: state.fouls,
      ended: state.ended,
      remainingSeconds: state.remainingSeconds,
      events: state.events,
      rules: state.rules,
      player1Name: $("player1Name").value,
      player2Name: $("player2Name").value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
  } catch (e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.scores) state.scores = saved.scores;
    if (saved.fouls) state.fouls = saved.fouls;
    if (Number.isFinite(saved.remainingSeconds)) state.remainingSeconds = saved.remainingSeconds;
    if (Array.isArray(saved.events)) state.events = saved.events;
    state.ended = Boolean(saved.ended);
    state.running = false;
    if (saved.player1Name) $("player1Name").value = saved.player1Name;
    if (saved.player2Name) $("player2Name").value = saved.player2Name;
  } catch (e) {}
}

function renderScore() {
  scoreEls[1].textContent = String(state.scores[1]).padStart(2, "0");
  scoreEls[2].textContent = String(state.scores[2]).padStart(2, "0");
  $("eventPlayer").options[0].textContent = playerName(1);
  $("eventPlayer").options[1].textContent = playerName(2);
}

function renderClock() { clockEl.textContent = formatTime(state.remainingSeconds); }

function renderMatchState() {
  const wrapper = $("matchState");
  const label = $("matchStateText");
  wrapper.classList.toggle("active", state.running);
  if (state.running) label.textContent = "PARTIDA EM ANDAMENTO";
  else if (state.ended) label.textContent = "PARTIDA ENCERRADA";
  else label.textContent = "PARTIDA NÃO INICIADA";
  $("startPauseBtn").textContent = state.running ? "Ⅱ Pausar" : "▶ Iniciar";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function stopTimer() {
  if (state.interval) clearInterval(state.interval);
  state.interval = null;
  state.running = false;
}

function startTimer() {
  if (state.ended) return;
  state.running = true;
  state.interval = setInterval(() => {
    if (state.remainingSeconds > 0) {
      state.remainingSeconds -= 1;
      renderClock();
      saveState();
    }
    if (state.remainingSeconds <= 0) {
      stopTimer();
      state.ended = true;
      renderMatchState();
      showToast("Tempo encerrado!");
      speakAI("Fim de jogo!");
    }
  }, 1000);
  renderMatchState();
}

function addEvent({ player, title, points, icon = "＋", detail = "" }) {
  const event = {
    id: Date.now() + Math.random(),
    player, title, points, icon, detail,
    time: formatTime(state.remainingSeconds),
    playerName: player ? playerName(player) : "SISTEMA"
  };
  state.events.unshift(event);
  renderHistory();
  saveState();
}

function changeScore(player, points) {
  if (state.ended && points > 0) return;
  const newScore = state.scores[player] + points;
  if (newScore < 0) return;
  state.scores[player] = newScore;
  renderScore();
  addEvent({ player, title: points > 0 ? "Ponto manual" : "Remoção", points, icon: points > 0 ? "＋" : "−" });
}

function autoScore(player, shotType = "common", detailStr = "Automático") {
  if (state.ended) return;
  let points = state.rules.common;
  let titleStr = "🏀 Cesta de 2 Pontos";
  let speechText = "";

  if (shotType === "layup") {
    points = state.rules.common + state.rules.jelly;
    titleStr = "⚡ Bandeja Detetada";
    speechText = `Bandeja de ${points} pontos do ${playerName(player)}!`;
  } else if (shotType === "long") {
    points = state.rules.long;
    titleStr = "↗ Cesta de 3 Pontos";
    speechText = `Cesta de três pontos do ${playerName(player)}!`;
  } else {
    speechText = `Cesta de dois pontos para ${playerName(player)}!`;
  }

  state.scores[player] += points;
  renderScore();
  addEvent({ player, title: titleStr, points, icon: "🎯", detail: detailStr });
  showToast(`${titleStr}! +${points}`);
  speakAI(speechText);
}

function registerFoul(player) {
  if (state.ended) return;
  state.fouls[player] = (state.fouls[player] || 0) + 1;
  addEvent({ player, title: "⚠️ Falta Pessoal", points: 0, icon: "⚠️", detail: `Falta de ${playerName(player)}` });
  showToast(`⚠️ Falta detetada para ${playerName(player)}`);
  speakAI(`Falta pessoal cometida por ${playerName(player)}!`);
}

function renderHistory() {
  const list = $("historyList");
  $("eventCount").textContent = `${state.events.length} EVENTOS`;
  if (!state.events.length) {
    list.innerHTML = `<div class="empty-state"><span>＋</span><strong>Sem jogadas</strong><p>Inicie a partida.</p></div>`;
    return;
  }
  list.innerHTML = state.events.map(ev => `
    <div class="history-item">
      <div class="event-icon">${ev.icon}</div>
      <div><div class="event-title">${ev.title}</div><div class="event-meta">${ev.playerName} · ${ev.time}</div></div>
      <div class="event-points">${ev.points === 0 ? "—" : (ev.points > 0 ? "+" + ev.points : ev.points)}</div>
    </div>
  `).join("");
}

document.querySelectorAll(".score-btn").forEach(btn => {
  btn.addEventListener("click", () => changeScore(Number(btn.dataset.player), Number(btn.dataset.points)));
});

$("startPauseBtn").addEventListener("click", () => {
  if (state.ended) return;
  if (state.running) { stopTimer(); renderMatchState(); } else { startTimer(); speakAI("Partida iniciada!"); }
});

$("resetClockBtn").addEventListener("click", () => {
  stopTimer();
  state.remainingSeconds = state.rules.minutes * 60;
  state.ended = false;
  renderClock();
  renderMatchState();
  saveState();
  showToast("Tempo reiniciado.");
});

$("endMatchBtn").addEventListener("click", () => {
  if (state.ended) return;
  stopTimer();
  state.ended = true;
  renderMatchState();
  speakAI("Fim de jogo!");
});

$("newMatchBtn").addEventListener("click", () => {
  stopTimer();
  state.ended = false;
  state.scores = { 1: 0, 2: 0 };
  state.events = [];
  state.remainingSeconds = state.rules.minutes * 60;
  renderScore(); renderClock(); renderMatchState(); renderHistory(); saveState();
  showToast("Nova partida pronta.");
});

$("clearHistoryBtn").addEventListener("click", () => { state.events = []; renderHistory(); saveState(); });
$("player1Name").addEventListener("input", () => { renderScore(); saveState(); });
$("player2Name").addEventListener("input", () => { renderScore(); saveState(); });

loadState(); renderScore(); renderClock(); renderMatchState(); renderHistory();

// --- CONTROLO DA CÂMERA (TRASEIRA POR DEFEITO + INVERTER + TELA CHEIA) ---
let mediaStream = null;
let useFrontCamera = false;

async function startCamera() {
  const webcamEl = $("webcamVideo");
  const placeholderEl = $("cameraPlaceholderContent");
  const dotEl = $("cameraDot");
  const statusTextEl = $("cameraStatusText");

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
  }

  try {
    const constraints = {
      video: {
        facingMode: useFrontCamera ? "user" : { exact: "environment" }, // Tenta forçar a traseira
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // Fallback se a câmera traseira exata falhar
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e) {
      showToast("Não foi possível aceder à câmara.");
      return;
    }
  }

  webcamEl.srcObject = mediaStream;
  webcamEl.style.display = "block";
  placeholderEl.style.display = "none";
  dotEl.style.background = "var(--lime)";
  statusTextEl.textContent = useFrontCamera ? "Câmera Frontal" : "Câmera Traseira Ativa";
  showToast(useFrontCamera ? "Câmera frontal ligada" : "Câmera traseira ligada");
}

document.addEventListener("DOMContentLoaded", () => {
  const toggleCamBtn = $("toggleCameraBtn");
  const switchCamBtn = $("switchCameraBtn");
  const fullscreenBtn = $("fullscreenBtn");

  if (toggleCamBtn) {
    toggleCamBtn.addEventListener("click", () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
        $("webcamVideo").style.display = "none";
        $("outputCanvas").style.display = "none";
        $("cameraPlaceholderContent").style.display = "flex";
        toggleCamBtn.textContent = "📷 Ligar Câmera Traseira";
        $("cameraDot").style.background = "#777";
        $("cameraStatusText").textContent = "Fonte: inativa";
      } else {
        useFrontCamera = false;
        startCamera();
        toggleCamBtn.textContent = "Desligar Câmera";
      }
    });
  }

  if (switchCamBtn) {
    switchCamBtn.addEventListener("click", () => {
      useFrontCamera = !useFrontCamera;
      if (mediaStream) startCamera();
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });
  }
});

// --- MEDIAPIPE (IA NA QUADRA) ---
let poseDetector = null;
let mpCamera = null;
let lastAutoScoreTime = 0;
let lastFoulTime = 0;

function initMediaPipe() {
  const webcamEl = $("webcamVideo");
  const canvasEl = $("outputCanvas");
  if (!webcamEl || !mediaStream) {
    showToast("Ligue a câmera primeiro!");
    return;
  }

  canvasEl.style.display = "block";
  const canvasCtx = canvasEl.getContext("2d");

  poseDetector = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
  });

  poseDetector.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  poseDetector.onResults((results) => {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasEl.width, canvasEl.height);

    const width = canvasEl.width;
    const height = canvasEl.height;
    const rimZone = { x: width * 0.25, y: 0, width: width * 0.5, height: height * 0.35 };

    canvasCtx.strokeStyle = "#10b981";
    canvasCtx.lineWidth = 3;
    canvasCtx.strokeRect(rimZone.x, rimZone.y, rimZone.width, rimZone.height);
    canvasCtx.fillStyle = "rgba(16, 185, 129, 0.15)";
    canvasCtx.fillRect(rimZone.x, rimZone.y, rimZone.width, rimZone.height);

    if (results.poseLandmarks) {
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#10b981', lineWidth: 2 });
      drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#ef4444', lineWidth: 1, radius: 2 });

      const leftWrist = results.poseLandmarks[15];
      const rightWrist = results.poseLandmarks[16];
      const leftKnee = results.poseLandmarks[25];
      const rightKnee = results.poseLandmarks[26];
      const leftHip = results.poseLandmarks[23];
      const nose = results.poseLandmarks[0];

      if (leftWrist && rightWrist && nose) {
        const leftWristX = leftWrist.x * width;
        const leftWristY = leftWrist.y * height;
        const rightWristX = rightWrist.x * width;
        const rightWristY = rightWrist.y * height;
        const identifiedPlayer = (nose.x < 0.5) ? 1 : 2;

        const inZone = (leftWristX >= rimZone.x && leftWristX <= (rimZone.x + rimZone.width) && leftWristY <= rimZone.height) ||
                       (rightWristX >= rimZone.x && rightWristX <= (rimZone.x + rimZone.width) && rightWristY <= rimZone.height);

        if (inZone) {
          let isLayup = false;
          if (leftKnee && rightKnee && leftHip) {
            if ((leftKnee.y < leftHip.y + 0.1) || (rightKnee.y < leftHip.y + 0.1)) isLayup = true;
          }
          const isThree = (nose.y > 0.65);
          const now = Date.now();
          if (now - lastAutoScoreTime > 4000) {
            lastAutoScoreTime = now;
            let shot = isLayup ? "layup" : (isThree ? "long" : "common");
            autoScore(identifiedPlayer, shot, "IA Visão");
          }
        }
      }
    }
    canvasCtx.restore();
  });

  mpCamera = new Camera(webcamEl, {
    onFrame: async () => {
      if (mediaStream && webcamEl.readyState >= 2) {
        canvasEl.width = webcamEl.videoWidth || 1280;
        canvasEl.height = webcamEl.videoHeight || 720;
        await poseDetector.send({ image: webcamEl });
      }
    },
    width: 1280,
    height: 720
  });

  mpCamera.start();
  showToast("IA de esqueleto e deteção ativada!");
  speakAI("IA ativada com sucesso!");
}

function triggerAICaptureBasket(player) {
  if (!mediaStream) {
    showToast("Ligue a câmera primeiro!");
    return;
  }
  autoScore(player, "common", "Validação Manual IA");
}
