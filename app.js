/*************************************************
 * Quiz Roulette – BLE (Web Bluetooth) + TOKEN
 * - Google Apps Script(JSONP)에서 6문항 로드
 * - 오답 시 직전 문제 잠금
 * - 정답 시 룰렛 버튼 활성화
 * - BLE UART로 "PING:TOKEN\n" → "PONG:TOKEN\n" 확인
 * - BLE UART로 "SPIN:TOKEN\n" 전송
 *************************************************/

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

// ⭐ micro:bit 코드의 TOKEN과 동일해야 함
const TOKEN = "A1";

// BLE UART UUIDs (Nordic UART Service)
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write
const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // notify

// =====================
// DOM
// =====================
const elStatus = document.getElementById("statusText");
const elLock = document.getElementById("lockText");

const screenPick = document.getElementById("screenPick");
const screenQuiz = document.getElementById("screenQuiz");

const gridButtons = document.getElementById("gridButtons");

const quizNo = document.getElementById("quizNo");
const questionText = document.getElementById("questionText");
const feedback = document.getElementById("feedback");

const btnBack = document.getElementById("btnBack");
const btnRetry = document.getElementById("btnRetry");
const btnSpin = document.getElementById("btnSpin");

const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");

const choiceBtns = Array.from(document.querySelectorAll(".choiceBtn"));
const choiceTexts = Array.from(document.querySelectorAll(".choiceText"));

// =====================
// State
// =====================
let questions = [];
let selectedId = null;
let lastWrongId = null;
let canSpin = false;

// =====================
// BLE State
// =====================
let bleDevice = null;
let bleServer = null;
let uartService = null;
let uartRX = null;
let uartTX = null;
let bleConnected = false;
let bleVerified = false;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// =====================
// Init
// =====================
loadQuestions();
goPick();
setSpinEnabled(false);
updateLockText();
setBackHint(false);

// =====================
// JSONP: Questions
// =====================
function loadQuestions() {
  elStatus.textContent = "문항 불러오는 중…";

  window[JSONP_CALLBACK] = (data) => {
    questions = normalizeQuestions(data);
    elStatus.textContent = `문항 ${questions.length}개 로드 완료`;
    renderPick();
  };

  const script = document.createElement("script");
  script.src = `${APPS_SCRIPT_URL}?callback=${JSONP_CALLBACK}&_=${Date.now()}`;
  script.onerror = () => {
    elStatus.textContent = "문항 로드 실패(URL/네트워크 확인)";
  };
  document.body.appendChild(script);
}

function normalizeQuestions(data) {
  return (Array.isArray(data) ? data : [])
    .filter(q => q && q.enabled === true)
    .map(q => ({
      id: Number(q.id),
      question: String(q.question || ""),
      choiceA: String(q.choiceA || ""),
      choiceB: String(q.choiceB || ""),
      choiceC: String(q.choiceC || ""),
      choiceD: String(q.choiceD || ""),
      answer: String(q.answer || "A").toUpperCase().trim()
    }))
    .sort((a, b) => a.id - b.id);
}

// =====================
// UI navigation
// =====================
function goPick() {
  selectedId = null;
  canSpin = false;
  setSpinEnabled(false);
  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setBackHint(false);

  screenQuiz.classList.add("hidden");
  screenPick.classList.remove("hidden");
  renderPick();
  updateLockText();
}

function goQuiz(id) {
  const q = questions.find(x => x.id === id);
  if (!q) return;

  selectedId = id;
  canSpin = false;
  setSpinEnabled(false);
  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setBackHint(false);

  screenPick.classList.add("hidden");
  screenQuiz.classList.remove("hidden");

  quizNo.textContent = `문제 ${q.id}번`;
  questionText.textContent = q.question;

  const choices = { A: q.choiceA, B: q.choiceB, C: q.choiceC, D: q.choiceD };
  choiceBtns.forEach((btn, idx) => {
    const c = btn.dataset.choice;
    choiceTexts[idx].textContent = choices[c] || "";
    btn.disabled = false;
    btn.onclick = () => handleChoice(c);
  });
}

// =====================
// Render pick grid (1~6)
// =====================
function renderPick() {
  const colors = [
    "bg-rose-200 hover:bg-rose-300",
    "bg-amber-200 hover:bg-amber-300",
    "bg-emerald-200 hover:bg-emerald-300",
    "bg-sky-200 hover:bg-sky-300",
    "bg-violet-200 hover:bg-violet-300",
    "bg-lime-200 hover:bg-lime-300",
  ];

  const hasIds = new Set(questions.map(q => q.id));
  gridButtons.innerHTML = "";

  for (let id = 1; id <= 6; id++) {
    const exists = hasIds.has(id);
    const locked = (lastWrongId === id);

    const btn = document.createElement("button");
    btn.className =
      `tap h-28 md:h-48 rounded-2xl shadow-lg text-5xl md:text-7xl font-extrabold flex items-center justify-center ${colors[id - 1]}`;

    if (!exists || locked) {
      btn.disabled = true;
      btn.classList.add("disabled-look");
    }

    btn.textContent = String(id);
    btn.onclick = () => goQuiz(id);
    gridButtons.appendChild(btn);
  }
}

function updateLockText() {
  elLock.textContent = lastWrongId ? `${lastWrongId}번` : "없음";
}

// =====================
// Choice handling
// =====================
function handleChoice(choice) {
  const q = questions.find(x => x.id === selectedId);
  if (!q) return;

  // 중복 클릭 방지
  choiceBtns.forEach(b => (b.disabled = true));

  if (choice === q.answer) {
    feedback.textContent = "✅ 정답! 룰렛을 돌릴 수 있어요.";
    feedback.className = "mt-5 text-xl font-extrabold text-emerald-600";

    lastWrongId = null;
    updateLockText();

    canSpin = true;
    setSpinEnabled(true);

    btnRetry.classList.add("hidden");
    setBackHint(false);
  } else {
    feedback.textContent = "❌ 오답! 다른 문제를 선택해 보세요.";
    feedback.className = "mt-5 text-xl font-extrabold text-rose-600";

    lastWrongId = selectedId;
    updateLockText();

    canSpin = false;
    setSpinEnabled(false);

    btnRetry.classList.remove("hidden");
    setBackHint(true);
  }
}

function setSpinEnabled(enabled) {
  btnSpin.disabled = !enabled;
  btnSpin.className = enabled
    ? "tap h-12 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow"
    : "tap h-12 px-5 rounded-xl bg-slate-200 text-slate-600 font-extrabold shadow";
}

function setBackHint(isWrong) {
  if (isWrong) {
    btnBack.className =
      "tap h-11 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold shadow shake";
    btnBack.textContent = "다른 문제 선택하기";
    setTimeout(() => btnBack.classList.remove("shake"), 600);
  } else {
    btnBack.className =
      "tap h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold";
    btnBack.textContent = "다른 문제 선택";
  }
}

// =====================
// BLE: connect / disconnect / verify / send
// =====================
btnConnect.addEventListener("click", async () => {
  try {
    await bleConnectAndVerify();
  } catch (e) {
    console.error(e);
    alert("BLE 연결 실패. 위치/권한/다른 앱 연결 여부 확인");
    setStatus("연결 실패");
  }
});

btnDisconnect.addEventListener("click", async () => {
  await bleDisconnect();
});

async function bleConnectAndVerify() {
  if (!navigator.bluetooth) {
    alert("이 브라우저는 Web Bluetooth를 지원하지 않습니다. (Android Chrome 권장)");
    return;
  }

  setStatus("BLE 장치 선택 중… (micro:bit 앱 연결은 끊어주세요)");
  bleVerified = false;

  bleDevice = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "micro:bit" }],
    optionalServices: [NUS_SERVICE],
  });
  bleDevice.addEventListener("gattserverdisconnected", onBleDisconnected);

  bleServer = await bleDevice.gatt.connect();
  uartService = await bleServer.getPrimaryService(NUS_SERVICE);
  uartRX = await uartService.getCharacteristic(NUS_RX);
  uartTX = await uartService.getCharacteristic(NUS_TX);

  await uartTX.startNotifications();
  uartTX.addEventListener("characteristicvaluechanged", handleBleNotify);

  bleConnected = true;
  btnDisconnect.classList.remove("hidden");

  setStatus("BLE 연결됨 → 인증 중…");

  // ---- 토큰 인증 (PING → PONG) ----
  await bleSendLine(`PING:${TOKEN}`);
  const ok = await waitForPong(1500);
  if (!ok) {
    alert("연결된 micro:bit가 우리 기기(TOKEN)와 일치하지 않아요. 다시 선택해 주세요.");
    await bleDisconnect();
    return;
  }

  bleVerified = true;
  setStatus("✅ BLE 연결 + 인증 완료");
}

function handleBleNotify(e) {
  const msg = decoder.decode(e.target.value);
  // 여러 조각으로 올 수 있으니 줄 단위로 누적 처리
  bleRxBuffer += msg;
  // 줄바꿈 기준 처리
  let idx;
  while ((idx = bleRxBuffer.indexOf("\n")) >= 0) {
    const line = bleRxBuffer.slice(0, idx).trim();
    bleRxBuffer = bleRxBuffer.slice(idx + 1);
    if (line) onBleLine(line);
  }
}

let bleRxBuffer = "";
let lastPongAt = 0;

function onBleLine(line) {
  console.log("[micro:bit]", line);
  if (line === `PONG:${TOKEN}`) {
    lastPongAt = Date.now();
  }
}

async function waitForPong(timeoutMs) {
  const start = Date.now();
  lastPongAt = 0;
  while (Date.now() - start < timeoutMs) {
    // PONG가 들어오면 lastPongAt 찍힘
    if (lastPongAt && (Date.now() - lastPongAt < 5000)) return true;
    await sleep(50);
  }
  return false;
}

async function bleDisconnect() {
  try {
    if (bleDevice && bleDevice.gatt.connected) bleDevice.gatt.disconnect();
  } catch {}
  onBleDisconnected();
}

function onBleDisconnected() {
  bleConnected = false;
  bleVerified = false;
  bleDevice = null;
  bleServer = null;
  uartService = null;
  uartRX = null;
  uartTX = null;
  bleRxBuffer = "";
  btnDisconnect.classList.add("hidden");
  setStatus("BLE 연결 끊김");
}

async function bleSendLine(text) {
  if (!uartRX) throw new Error("UART RX not ready");
  await uartRX.writeValue(encoder.encode(text + "\n"));
}

// =====================
// SPIN button
// =====================
btnSpin.addEventListener("click", async () => {
  if (!canSpin) return;

  if (!bleConnected || !bleVerified) {
    alert("BLE 연결(인증)이 필요해요. 상단 [연결]을 눌러 주세요.");
    return;
  }

  try {
    await bleSendLine(`SPIN:${TOKEN}`);
    setStatus("🎡 룰렛 신호 전송!");
  } catch (e) {
    console.error(e);
    alert("전송 실패. BLE 연결 상태를 확인해 주세요.");
  }
});

// =====================
// Other buttons
// =====================
btnBack.addEventListener("click", () => goPick());

btnRetry.addEventListener("click", () => {
  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setSpinEnabled(false);
  choiceBtns.forEach(b => (b.disabled = false));
});

// =====================
// Utils
// =====================
function setStatus(t) {
  elStatus.textContent = t;
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}
