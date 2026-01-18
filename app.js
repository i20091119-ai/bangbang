/***********************
 * Quiz Roulette (BLE)
 ***********************/
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

// DOM
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

// State
let questions = [];
let selectedId = null;
let lastWrongId = null;
let canSpin = false;

// ============= BLE (Web Bluetooth) =============
let bleDevice = null;
let bleServer = null;
let uartService = null;
let uartRX = null;
let uartTX = null;
const encoder = new TextEncoder();

// Nordic UART Service UUIDs (micro:bit UART)
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write
const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // notify

async function bleConnect() {
  if (!navigator.bluetooth) {
    alert("이 브라우저는 Web Bluetooth를 지원하지 않습니다. (Android Chrome 권장)");
    return;
  }

  elStatus.textContent = "BLE 장치 선택 중… (micro:bit 앱 연결은 끊어주세요)";
  bleDevice = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "micro:bit" }], // 권장: micro:bit 이름을 ROULETTE-로 바꾸면 namePrefix도 바꾸기
    optionalServices: [NUS_SERVICE],
  });

  bleDevice.addEventListener("gattserverdisconnected", onBleDisconnected);

  bleServer = await bleDevice.gatt.connect();
  uartService = await bleServer.getPrimaryService(NUS_SERVICE);
  uartRX = await uartService.getCharacteristic(NUS_RX);
  uartTX = await uartService.getCharacteristic(NUS_TX);

  try {
    await uartTX.startNotifications();
    uartTX.addEventListener("characteristicvaluechanged", (e) => {
      const msg = new TextDecoder().decode(e.target.value);
      console.log("[micro:bit]", msg);
    });
  } catch {}

  elStatus.textContent = "✅ BLE 연결됨";
  btnDisconnect.classList.remove("hidden");
}

function onBleDisconnected() {
  elStatus.textContent = "❌ BLE 연결 끊김";
  bleDevice = null;
  bleServer = null;
  uartService = null;
  uartRX = null;
  uartTX = null;
  btnDisconnect.classList.add("hidden");
}

async function bleDisconnect() {
  try {
    if (bleDevice && bleDevice.gatt.connected) bleDevice.gatt.disconnect();
  } catch {}
  onBleDisconnected();
}

async function bleSendSpin() {
  if (!uartRX) {
    alert("BLE 연결이 필요해요. 상단 [연결]을 눌러 주세요.");
    return;
  }
  await uartRX.writeValue(encoder.encode("SPIN\n"));
}

// ============= Questions (JSONP) =============
loadQuestions();

function loadQuestions() {
  elStatus.textContent = "문항 불러오는 중…";

  window[JSONP_CALLBACK] = (data) => {
    questions = normalizeQuestions(data);
    elStatus.textContent = `문항 ${questions.length}개 로드 완료`;
    lastWrongId = null;
    updateLockText();
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

// ============= UI =============
btnConnect.addEventListener("click", async () => {
  try {
    await bleConnect();
  } catch (e) {
    console.error(e);
    alert("BLE 연결 실패. 위치/권한/다른 앱 연결 여부를 확인해 주세요.");
    elStatus.textContent = "연결 실패";
  }
});

btnDisconnect.addEventListener("click", bleDisconnect);

btnBack.addEventListener("click", () => goPick());

btnRetry.addEventListener("click", () => {
  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setSpinEnabled(false);

  // 보기 다시 선택 가능
  choiceBtns.forEach(b => (b.disabled = false));
});

btnSpin.addEventListener("click", async () => {
  if (!canSpin) return;

  try {
    await bleSendSpin();
    feedback.textContent = "🎡 룰렛이 돌아갑니다!";
  } catch (e) {
    console.error(e);
    alert("전송 실패. BLE 연결 상태를 확인해 주세요.");
  }
});

function goPick() {
  selectedId = null;
  canSpin = false;
  setSpinEnabled(false);
  feedback.textContent = "";
  btnRetry.classList.add("hidden");

  screenQuiz.classList.add("hidden");
  screenPick.classList.remove("hidden");
  renderPick();
}

function goQuiz(id) {
  const q = questions.find(x => x.id === id);
  if (!q) return;

  selectedId = id;
  canSpin = false;
  setSpinEnabled(false);

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

  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setBackHint(false);
}

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

  updateLockText();
}

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

function updateLockText() {
  elLock.textContent = lastWrongId ? `${lastWrongId}번` : "없음";
}

// 오답 때 “다른 문제 선택” 버튼 강조 + 흔들기
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
