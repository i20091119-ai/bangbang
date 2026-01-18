/*************************************************
 * Quiz Roulette – BLE (Web Bluetooth) + TOKEN
 *************************************************/

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

// ⭐ [중요] micro:bit 코드의 TOKEN과 글자 하나까지 똑같아야 작동합니다!
const TOKEN = "A1";

// BLE UART UUIDs (Nordic UART Service) - 소문자 표준
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX_CHARACTERISTIC = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // 앱 -> 마이크로비트 (Write)
const NUS_TX_CHARACTERISTIC = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // 마이크로비트 -> 앱 (Notify)

// =====================
// DOM Elements
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
// const btnRetry = document.getElementById("btnRetry"); // 오답 잠금 규칙을 위해 사용 안 함
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
let bleRxBuffer = ""; // 데이터 수신 버퍼

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
  
  // Retry 버튼 숨김 (오답 시 뒤로가기 강제)
  const retryBtn = document.getElementById("btnRetry");
  if(retryBtn) retryBtn.classList.add("hidden");

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
  
  const retryBtn = document.getElementById("btnRetry");
  if(retryBtn) retryBtn.classList.add("hidden");
  
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
    // 이전에 흐리게 처리된 스타일 제거
    btn.className = btn.className.replace("opacity-50", "");
    btn.onclick = () => handleChoice(c);
  });
}

// =====================
// Render pick grid
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
      `tap h-28 md:h-48 rounded-2xl shadow-lg text-5xl md:text-7xl font-extrabold flex items-center justify-center ${colors[(id - 1) % 6]}`;

    if (!exists || locked) {
      btn.disabled = true;
      btn.classList.add("disabled-look");
      
      if (locked) btn.innerHTML = "🔒"; // 잠김 표시
      else btn.textContent = String(id);
      
    } else {
      btn.textContent = String(id);
      btn.onclick = () => goQuiz(id);
    }
    
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

  // 모든 버튼 비활성화 (중복 클릭 방지)
  choiceBtns.forEach(b => (b.disabled = true));

  if (choice === q.answer) {
    feedback.textContent = "✅ 정답! 룰렛을 돌릴 수 있어요.";
    feedback.className = "mt-5 text-xl font-extrabold text-emerald-600";

    lastWrongId = null;
    updateLockText();

    canSpin = true;
    setSpinEnabled(true);
    setBackHint(false);
  } else {
    feedback.textContent = "❌ 오답! 다른 문제를 선택해 보세요.";
    feedback.className = "mt-5 text-xl font-extrabold text-rose-600";

    lastWrongId = selectedId;
    updateLockText();

    canSpin = false;
    setSpinEnabled(false);
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
    btnBack.textContent = "⬅ 다른 문제 선택하기";
    setTimeout(() => btnBack.classList.remove("shake"), 600);
  } else {
    btnBack.className =
      "tap h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold";
    btnBack.textContent = "다른 문제 선택";
  }
}

// =====================
// BLE Logic (수정된 핵심 부분)
// =====================
btnConnect.addEventListener("click", async () => {
  try {
    await bleConnectAndVerify();
  } catch (e) {
    console.error(e);
    // 사용자 친화적 에러 메시지
    alert(`연결할 수 없습니다.\n\n[원인]\n- 취소 버튼을 누름\n- 또는 이미 다른 앱에 연결됨\n- 에러: ${e.message}`);
    setStatus("연결 실패");
  }
});

btnDisconnect.addEventListener("click", async () => {
  await bleDisconnect();
});

async function bleConnectAndVerify() {
  if (!navigator.bluetooth) {
    alert("이 브라우저는 블루투스를 지원하지 않습니다.\n안드로이드 Chrome을 권장합니다.");
    return;
  }

  setStatus("장치 검색 중... 목록에서 'BBC micro:bit'를 선택하세요.");
  bleVerified = false;

  // ✅ [최종 수정] 갤럭시탭에서 확실하게 'BBC micro:bit'를 찾도록 필터 적용
 bleDevice = await navigator.bluetooth.requestDevice({
  acceptAllDevices: true, 
  optionalServices: [NUS_SERVICE]
  });
  
  bleDevice.addEventListener("gattserverdisconnected", onBleDisconnected);

  setStatus("서버에 연결 중...");
  bleServer = await bleDevice.gatt.connect();

  setStatus("서비스(UART) 찾는 중...");
  uartService = await bleServer.getPrimaryService(NUS_SERVICE);

  setStatus("통신 채널 연결 중...");
  uartRX = await uartService.getCharacteristic(NUS_RX_CHARACTERISTIC);
  uartTX = await uartService.getCharacteristic(NUS_TX_CHARACTERISTIC);

  // 데이터 수신 시작
  await uartTX.startNotifications();
  uartTX.addEventListener("characteristicvaluechanged", handleBleNotify);

  bleConnected = true;
  
  // UI 전환
  btnConnect.classList.add("hidden");
  btnDisconnect.classList.remove("hidden");

  setStatus("연결됨! 토큰 인증 중 (PING)...");

  // ---- 토큰 인증 (PING → PONG) ----
  bleRxBuffer = ""; // 버퍼 초기화
  
  await bleSendLine(`PING:${TOKEN}`);
  
  // 2.5초 내에 PONG 응답 대기
  const ok = await waitForPong(2500);
  if (!ok) {
    alert(`연결은 성공했지만, 인증에 실패했습니다.\n\n설정된 토큰: ${TOKEN}\n(마이크로비트 코드의 TOKEN과 일치하는지 확인하세요)`);
    await bleDisconnect();
    return;
  }

  bleVerified = true;
  setStatus("✅ 연결 및 인증 완료!");
}

function handleBleNotify(e) {
  const msg = decoder.decode(e.target.value);
  bleRxBuffer += msg;
  
  // 줄바꿈(\n) 단위로 잘라서 처리
  let idx;
  while ((idx = bleRxBuffer.indexOf("\n")) >= 0) {
    const line = bleRxBuffer.slice(0, idx).trim();
    bleRxBuffer = bleRxBuffer.slice(idx + 1);
    if (line) onBleLine(line);
  }
}

let lastPongAt = 0;

function onBleLine(line) {
  console.log("[RX]", line);
  // PONG 체크
  if (line.includes(`PONG:${TOKEN}`)) {
    lastPongAt = Date.now();
  }
}

async function waitForPong(timeoutMs) {
  const start = Date.now();
  lastPongAt = 0;
  while (Date.now() - start < timeoutMs) {
    // start 이후에 응답을 받았다면 OK
    if (lastPongAt > start) return true;
    await sleep(100);
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
  btnConnect.classList.remove("hidden");
  setStatus("대기 중 (연결 끊김)");
}

async function bleSendLine(text) {
  if (!uartRX) throw new Error("UART 전송 불가 (연결 안됨)");
  // 마이크로비트는 끝에 \n이 있어야 명령으로 인식
  await uartRX.writeValue(encoder.encode(text + "\n"));
}

// =====================
// SPIN button
// =====================
btnSpin.addEventListener("click", async () => {
  if (!canSpin) return;

  if (!bleConnected || !bleVerified) {
    alert("블루투스가 연결되지 않았습니다. 상단 [연결] 버튼을 눌러주세요.");
    return;
  }

  try {
    // 중복 전송 방지
    btnSpin.disabled = true;
    
    await bleSendLine(`SPIN:${TOKEN}`);
    setStatus("🎡 룰렛 돌아가는 중...");
    
    // 3초 후 버튼 상태 복구 (다음 퀴즈를 위해)
    // 하지만 현재 로직상 다음 문제로 가야 활성화되므로 여기서는 메시지만 복구
    setTimeout(() => {
        setStatus("✅ 연결 및 인증 완료!");
    }, 3000);
    
  } catch (e) {
    console.error(e);
    alert("명령 전송 실패. 연결을 확인해주세요.");
    onBleDisconnected();
  }
});

// =====================
// Other buttons
// =====================
btnBack.addEventListener("click", () => goPick());

// =====================
// Utils
// =====================
function setStatus(t) {
  elStatus.textContent = t;
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

