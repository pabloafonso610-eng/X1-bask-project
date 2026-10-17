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

// --- SISTEMA DE NARRAÇÃO POR VOZ DA IA (SPEECH SYNTHESIS) ---
function speakAI(text) {
  if ('speechSynthesis' in window) {
    // Cancela falas anteriores para não encavalar
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR'; // Português do Brasil
    utterance.rate = 1.05;    // Velocidade levemente dinâmica
    utterance.pitch = 1.0;   // Tom de voz normal
    
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
  } catch (error) {
    console.warn("Não foi possível salvar a partida.", error);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return;

    if (saved.scores && Number.isFinite(saved.scores[1]) && Number.isFinite(saved.scores[2])) {
      state.scores = { 1: Math.max(0, saved.scores[1]), 2: Math.max(0, saved.scores[2]) };
    }
    if (saved.fouls && Number.isFinite(saved.fouls[1]) && Number.isFinite(saved.fouls[2])) {
      state.fouls = { 1: Math.max(0, saved.fouls[1]), 2: Math.max(0, saved.fouls[2]) };
    }
    if (Number.isFinite(saved.remainingSeconds)) {
      state.remainingSeconds = Math.max(0, Math.floor(saved.remainingSeconds));
    }
    if (Array.isArray(saved.events)) state.events = saved.events;
    if (saved.rules && typeof saved.rules === "object") {
      state.rules = { ...state.rules, ...saved.rules };
    }
    state.ended = Boolean(saved.ended);
    state.running = false;
    if (typeof saved.player1Name === "string") $("player1Name").value = saved.player1Name;
    if (typeof saved.player2Name === "string") $("player2Name").value = saved.player2Name;
    $("ruleCommon").value = state.rules.common;
    $("ruleLong").value = state.rules.long;
    $("ruleJelly").value = state.rules.jelly;
    $("ruleAcro").value = state.rules.acro;
    $("ruleMinutes").value = state.rules.minutes;
  } catch (error) {
    console.warn("Não foi possível recuperar a partida salva.", error);
  }
}

function renderScore() {
  scoreEls[1].textContent = String(state.scores[1]).padStart(2, "0");
  scoreEls[2].textContent = String(state.scores[2]).padStart(2, "0");
  $("eventPlayer").options[0].textContent = playerName(1);
  $("eventPlayer").options[1].textContent = playerName(2);
}

function renderClock() {
  clockEl.textContent = formatTime(state.remainingSeconds);
}

function renderMatchState() {
  const wrapper = $("matchState");
  const label = $("matchStateText");
  wrapper.classList.toggle("active", state.running);
  if (state.running) label.textContent = "PARTIDA EM ANDAMENTO";
  else if (state.ended) label.textContent = "PARTIDA ENCERRADA";
  else label.textContent = "PARTIDA NÃO INICIADA";
  $("startPauseBtn").textContent = state.running ? "Ⅱ Pausar partida" : (state.ended ? "▶ Partida encerrada" : "▶ Iniciar partida");
  $("startPauseBtn").disabled = state.ended;
  $("startPauseBtn").style.opacity = state.ended ? ".55" : "1";
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
      speakAI("Atenção! Fim de jogo! Tempo regulamentar encerrado!");
      addEvent({ player: null, title: "Fim de tempo", points: 0, icon: "◷", detail: "Cronômetro chegou a 00:00", type: "system" });
    }
  }, 1000);
  renderMatchState();
}

function addEvent({ player, title, points, icon = "＋", detail = "", type = "score" }) {
  const event = {
    id: Date.now() + Math.random(),
    player,
    title,
    points,
    icon,
    detail,
    type,
    time: formatTime(state.remainingSeconds),
    playerName: player ? playerName(player) : "SISTEMA"
  };
  state.events.unshift(event);
  renderHistory();
  saveState();
}

function changeScore(player, points, title = "Ajuste manual", icon = "±") {
  if (state.ended && points > 0) {
    showToast("Partida encerrada.");
    return;
  }
  const newScore = state.scores[player] + points;
  if (newScore < 0) {
    showToast("O placar não pode ficar negativo.");
    return;
  }
  state.scores[player] = newScore;
  renderScore();
  addEvent({ player, title: title === "Ajuste manual" ? `${points > 0 ? "Pontos adicionados" : "Pontos removidos"}` : title, points, icon, detail: `${playerName(player)} • ${formatTime(state.remainingSeconds)}` });
}

function registerFoul(player, foulType = "Contacto Ilegal") {
  if (state.ended) return;
  state.fouls[player] = (state.fouls[player] || 0) + 1;
  addEvent({
    player,
    title: "⚠️ Falta Pessoal Detetada",
    points: 0,
    icon: "⚠️",
    detail: `Falta de ${playerName(player)} (${foulType}) • Total: ${state.fouls[player]}`
  });
  showToast(`⚠️ FALTA! ${playerName(player)} (${foulType})`);
  
  // NARRAÇÃO DA IA POR VOZ
  speakAI(`Atenção! Falta pessoal! ${foulType} cometida pelo ${playerName(player)}!`);
}

function registerBasket(kind) {
  const player = Number($("eventPlayer").value);
  const map = {
    common: { title: "Cesta comum", points: state.rules.common, icon: "＋", detail: "Cesta manual", typeStr: "common" },
    long: { title: "Cesta de longa distância", points: state.rules.long, icon: "↗", detail: "Cesta manual", typeStr: "long" },
    jelly: { title: "Jelly layup / Bandeja", points: state.rules.common + state.rules.jelly, icon: "✦", detail: `Bandeja + bônus`, typeStr: "layup" },
    acro: { title: "Finalização acrobática", points: state.rules.common + state.rules.acro, icon: "⚡", detail: `Cesta + bônus`, typeStr: "layup" }
  };
  const item = map[kind];
  if (state.ended) return;
  autoScore(player, item.typeStr, "Registro Manual");
}

function renderHistory() {
  const list = $("historyList");
  $("eventCount").textContent = `${state.events.length} ${state.events.length === 1 ? "EVENTO" : "EVENTOS"}`;
  if (!state.events.length) {
    list.innerHTML = `<div class="empty-state"><span>＋</span><strong>Nenhuma jogada registrada</strong><p>Inicie a partida e registre uma cesta ou falta.</p></div>`;
    return;
  }
  list.innerHTML = state.events.map(event => {
    const pointsText = event.points > 0 ? `+${event.points}` : String(event.points);
    const pointsClass = event.points < 0 ? "event-points negative" : "event-points";
    return `<div class="history-item">
      <div class="event-icon">${event.icon}</div>
      <div><div class="event-title">${escapeHtml(event.title)}</div>
      <div class="event-meta">${escapeHtml(event.playerName)} · ${event.time}</div></div>
      <div class="${pointsClass}">${event.points === 0 ? "—" : pointsText}</div>
    </div>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function updateRuleLabels() {
  $("commonPointsLabel").textContent = `+${state.rules.common} pontos`;
  $("longPointsLabel").textContent = `+${state.rules.long} pontos`;
  $("jellyBonusLabel").textContent = `Cesta + ${state.rules.jelly} bônus`;
  $("acroBonusLabel").textContent = `Cesta + ${state.rules.acro} bônus`;
}

function readRule(id, fallback, min, max) {
  const number = Number($(id).value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function applyRules() {
  state.rules = {
    common: readRule("ruleCommon", state.rules.common, 1, 10),
    long: readRule("ruleLong", state.rules.long, 1, 10),
    jelly: readRule("ruleJelly", state.rules.jelly, 0, 10),
    acro: readRule("ruleAcro", state.rules.acro, 0, 10),
    minutes: readRule("ruleMinutes", state.rules.minutes, 1, 60)
  };
  if (!state.running && !state.ended) {
    state.remainingSeconds = state.rules.minutes * 60;
    renderClock();
  }
  updateRuleLabels();
  saveState();
  showToast("Configurações aplicadas.");
}

function resetMatch() {
  stopTimer();
  state.ended = false;
  state.scores = { 1: 0, 2: 0 };
  state.fouls = { 1: 0, 2: 0 };
  state.events = [];
  state.remainingSeconds = state.rules.minutes * 60;
  renderScore();
  renderClock();
  renderMatchState();
  renderHistory();
  saveState();
  showToast("Nova partida pronta.");
}

document.querySelectorAll(".score-btn").forEach(button => {
  button.addEventListener("click", () => {
    changeScore(Number(button.dataset.player), Number(button.dataset.points));
  });
});

$("startPauseBtn").addEventListener("click", () => {
  if (state.ended) return;
  if (state.running) { 
    stopTimer(); 
    renderMatchState(); 
    showToast("Pausado."); 
    speakAI("Partida pausada.");
  } else { 
    startTimer(); 
    showToast("Iniciado."); 
    speakAI("Partida iniciada! Boa sorte aos jogadores!");
  }
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
  addEvent({ player: null, title: "Partida encerrada", points: 0, icon: "■", detail: "Fim de jogo" });
  showToast("Partida encerrada.");
  speakAI(`Fim de jogo! Placar final: ${playerName(1)} ${state.scores[1]} ponto a ponto com ${playerName(2)} ${state.scores[2]}!`);
});

$("newMatchBtn").addEventListener("click", resetMatch);
$("commonBasketBtn").addEventListener("click", () => registerBasket("common"));
$("longBasketBtn").addEventListener("click", () => registerBasket("long"));
$("jellyBtn").addEventListener("click", () => registerBasket("jelly"));
$("acroBtn").addEventListener("click", () => registerBasket("acro"));
$("applyRulesBtn").addEventListener("click", applyRules);

$("clearHistoryBtn").addEventListener("click", () => {
  if (!state.events.length) return;
  if (confirm("Deseja limpar o histórico?")) {
    state.events = [];
    renderHistory();
    saveState();
    showToast("Histórico limpo.");
  }
});

$("player1Name").addEventListener("input", () => { renderScore(); saveState(); });
$("player2Name").addEventListener("input", () => { renderScore(); saveState(); });

loadState();
renderScore();
renderClock();
renderMatchState();
renderHistory();
updateRuleLabels();

// --- ATALHOS DE TECLADO ---
document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT") return;
  if (event.key === "1") autoScore(1, "common", "Atalho teclado");
  if (event.key === "2") autoScore(2, "common", "Atalho teclado");
  if (event.key === "f" || event.key === "F") registerFoul(1, "Contacto Ilegal");
});

// --- CÂMERA REAL ---
let mediaStream = null;

async function toggleCamera() {
  const webcamEl = $("webcamVideo");
  const placeholderEl = $("cameraPlaceholderContent");
  const btnEl = $("toggleCameraBtn");
  const dotEl = $("cameraDot");
  const statusTextEl = $("cameraStatusText");

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
    webcamEl.style.display = "none";
    $("outputCanvas").style.display = "none";
    placeholderEl.style.display = "flex";
    btnEl.textContent = "Ligar Câmera Real";
    dotEl.style.background = "#777";
    statusTextEl.textContent = "Fonte de vídeo: inativa";
    showToast("Câmera desligada.");
  } else {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      webcamEl.srcObject = mediaStream;
      webcamEl.style.display = "block";
      placeholderEl.style.display = "none";
      btnEl.textContent = "Desligar Câmera";
      dotEl.style.background = "var(--lime)";
      statusTextEl.textContent = "Webcam ativa";
      showToast("Câmera ligada!");
      speakAI("Câmera conectada. Visão computacional pronta.");
    } catch (error) {
      showToast("Erro ao aceder à câmara.");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if ($("toggleCameraBtn")) $("toggleCameraBtn").addEventListener("click", toggleCamera);
});

// --- PONTUAÇÃO AUTOMÁTICA COM NARRAÇÃO POR VOZ ---
function autoScore(player, shotType = "common", detailStr = "Deteção Automática") {
  if (state.ended) return;
  
  let points = state.rules.common;
  let titleStr = "🏀 IA: Cesta de 2 Pontos";
  let speechText = "";
  let iconStr = "🎯";

  if (shotType === "layup") {
    points = state.rules.common + state.rules.jelly;
    titleStr = "⚡ IA: Bandeja Detetada";
    iconStr = "✦";
    speechText = `Bandeja incrível de ${points} pontos do ${playerName(player)}!`;
  } else if (shotType === "long") {
    points = state.rules.long;
    titleStr = "↗ IA: Cesta de 3 Pontos";
    iconStr = "↗";
    speechText = `Cesta de três pontos espetacular do ${playerName(player)}!`;
  } else {
    speechText = `Cesta de dois pontos confirmada para ${playerName(player)}!`;
  }

  state.scores[player] += points;
  renderScore();
  addEvent({ player, title: titleStr, points, icon: iconStr, detail: `${detailStr} • ${formatTime(state.remainingSeconds)}` });
  showToast(`${titleStr}! +${points} pts para ${playerName(player)}!`);

  // NARRAÇÃO POR VOZ
  speakAI(speechText);
}

// --- MEDIAPIPE + PROCESSAMENTO DE ÁUDIO & VISÃO ---
let poseDetector = null;
let mpCamera = null;
let lastAutoScoreTime = 0;
let lastFoulTime = 0;

function initMediaPipe() {
  const webcamEl = $("webcamVideo");
  const canvasEl = $("outputCanvas");
  if (!webcamEl || !mediaStream) {
    showToast("Ligue a câmera real primeiro.");
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
    canvasCtx.fillStyle = "#10b981";
    canvasCtx.font = "bold 14px system-ui";
    canvasCtx.fillText("🎯 ZONA DA CESTA (NARRAÇÃO ATIVA)", rimZone.x + 10, 25);

    if (results.poseLandmarks) {
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#10b981', lineWidth: 2 });
      drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#ef4444', lineWidth: 1, radius: 3 });

      const leftWrist = results.poseLandmarks[15];
      const rightWrist = results.poseLandmarks[16];
      const leftKnee = results.poseLandmarks[25];
      const rightKnee = results.poseLandmarks[26];
      const leftHip = results.poseLandmarks[23];
      const leftElbow = results.poseLandmarks[13];
      const rightElbow = results.poseLandmarks[14];
      const nose = results.poseLandmarks[0];

      if (leftWrist && rightWrist && nose) {
        const leftWristX = leftWrist.x * width;
        const leftWristY = leftWrist.y * height;
        const rightWristX = rightWrist.x * width;
        const rightWristY = rightWrist.y * height;

        const identifiedPlayer = (nose.x < 0.5) ? 1 : 2;
        const defenderPlayer = (identifiedPlayer === 1) ? 2 : 1;
        const playerLabel = playerName(identifiedPlayer);

        canvasCtx.fillStyle = (identifiedPlayer === 1) ? "#10b981" : "#3b82f6";
        canvasCtx.font = "bold 16px system-ui";
        canvasCtx.fillText(`👤 ${playerLabel}`, nose.x * width - 30, nose.y * height - 20);

        // DETEÇÃO DE FALTAS
        if (leftElbow && rightElbow) {
          const wristDistance = Math.hypot(leftWristX - rightWristX, leftWristY - rightWristY);

          if (wristDistance < 35 && (leftWristY < nose.y * height)) {
            const now = Date.now();
            if (now - lastFoulTime > 5000) {
              lastFoulTime = now;
              canvasCtx.fillStyle = "#ef4444";
              canvasCtx.font = "bold 24px system-ui";
              canvasCtx.fillText("⚠️ FALTA DETETADA PELA IA!", 20, 60);
              registerFoul(defenderPlayer, "Contacto Ilegal no Arremesso");
            }
          }
        }

        // DETEÇÃO DE CESTAS DE 2, 3 PONTOS E BANDEJAS
        const inZone = (leftWristX >= rimZone.x && leftWristX <= (rimZone.x + rimZone.width) && leftWristY <= rimZone.height) ||
                       (rightWristX >= rimZone.x && rightWristX <= (rimZone.x + rimZone.width) && rightWristY <= rimZone.height);

        if (inZone) {
          let isLayup = false;
          if (leftKnee && rightKnee && leftHip) {
            const kneeRaised = (leftKnee.y < leftHip.y + 0.1) || (rightKnee.y < leftHip.y + 0.1);
            if (kneeRaised) isLayup = true;
          }

          // Distância do jogador até à câmara/cesta determina se é 2 ou 3 pontos
          const isThreePointer = (nose.y > 0.65); // Quanto mais em baixo no vídeo, mais longe da cesta

          const now = Date.now();
          if (now - lastAutoScoreTime > 4000) {
            lastAutoScoreTime = now;
            let shotKind = "common";
            if (isLayup) shotKind = "layup";
            else if (isThreePointer) shotKind = "long";

            autoScore(identifiedPlayer, shotKind, isThreePointer ? "Visão: Longa Distância" : "Visão: Aro");
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
  showToast("IA ativada com narração por voz!");
  speakAI("Sistema de visão e áudio ativados! Bom jogo!");
  if ($("aiStatusTag")) $("aiStatusTag").textContent = "IA COM NARRAÇÃO POR VOZ";
}