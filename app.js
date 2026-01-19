/*************************************************
 * Quiz Roulette – V3 (6Q) + BLE Pin Trigger (P2)
 * - Data: Google Apps Script JSONP (6 questions)
 * - Flow:
 *   1) Pick 1~6
 *   2) Solve 4-choice
 *   3) Correct -> enable SPIN
 *   4) Wrong -> lock that question for next pick + "다른 문제 선택" 강조/흔들기
 *   5) After any correct -> lock cleared
 *
 * - BLE:
 *   - Uses micro:bit IO Pin Service (standard)
 *   - Toggles P2 HIGH->LOW (trigger)
 *************************************************/

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

// =====================
// BLE: micro:bit IO Pin Service UUIDs
// =====================
const MB_IO_SERVICE = "e95d127b-251d-470a-a062-fa1922dfa9a8";
const MB_PIN_DATA = "e95d8d00-251d-470a-a062-fa1922dfa9a8"; // PinData (write)

// Trigger pin = P2
const TRIGGER_PIN = 2;

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
let ioService = null;
let pinChar = null;
let bleConnected = false;

// =====================
// Init
// =====================
setStatus("대기 중");
updateLockText();
setSpinEnabled(false);
setBackHint(false);
goPick();
loadQuestions();

// =====================
// JSONP load
// =====================
function loadQuestions() {
  setStatus("문항 불러오는 중…");

  window[JSONP_CALLBACK] = (data) => {
    questions = normalizeQuestions(data);
    setStatus(`문항 ${questions.length}개 로드 완료`);
    renderPick();
  };

  // cache buster
  const s = document.createElement("script");
  s.src = `${APPS_SCRIPT_URL}?callback=${JSONP_CALLBACK}&_=${Date.now()}`;
  s.onerror = () => setStatus("문항 로드 실패(URL/네트워크 확인)");
  document.body.appendChild(s);
}

function normalizeQuestions(data) {
  return (Array.isArray(data) ? data : [])
    .filter((q) => q && q.enabled === true)
    .map((q) => ({
      id: Number(q.id),
      question: String(q.question || ""),
      choiceA: String(q.choiceA || ""),
      choiceB: String(q.choiceB || ""),
      choiceC: String(q.choiceC || ""),
      choiceD: String(q.choiceD || ""),
      answer: String(q.answer || "A").toUpperCase().trim(),
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
  const q = questions.find((x) => x.id === id);
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

function renderPick() {
  const colors = [
    "bg-rose-200 hover:bg-rose-300",
    "bg-amber-200 hover:bg-amber-300",
    "bg-emerald-200 hover:bg-emerald-300",
    "bg-sky-200 hover:bg-sky-300",
    "bg-violet-200 hover:bg-violet-300",
    "bg-lime-200 hover:bg-lime-300",
  ];

  const hasIds = new Set(questions.map((q) => q.id));
  gridButtons.innerHTML = "";

  for (let id = 1; id <= 6; id++) {
    const exists = hasIds.has(id);
    const locked = lastWrongId === id;

    const btn = document.createElement("button");
    btn.className = `tap h-28 md:h-48 rounded-2xl shadow-lg text-5xl md:text-7xl font-extrabold flex items-center justify-center ${colors[id - 1]}`;

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
// Choice logic
// =====================
function handleChoice(choice) {
  const q = questions.find((x) => x.id === selectedId);
  if (!q) return;

  // prevent double tap
  choiceBtns.forEach((b) => (b.disabled = true));

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
    // remove shake class after animation time
    setTimeout(() => btnBack.classList.remove("shake"), 650);
  } else {
    btnBack.className =
      "tap h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold";
    btnBack.textContent = "다른 문제 선택";
  }
}

// =====================
// Buttons
// =====================
btnBack.addEventListener("click", () => goPick());

btnRetry.addEventListener("click", () => {
  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setSpinEnabled(false);
  choiceBtns.forEach((b) => (b.disabled = false));
});

btnConnect.addEventListener("click", async () => {
  try {
    await bleConnect();
    setStatus("✅ BLE 연결됨");
  } catch (e) {
    console.error(e);
    alert(`연결 실패: ${e.message || e}`);
    setStatus("연결 실패");
    bleReset();
  }
});

btnDisconnect.addEventListener("click", async () => {
  await bleDisconnect();
});

btnSpin.addEventListener("click", async () => {
  if (!canSpin) return;

  if (!bleConnected || !pinChar) {
    alert("BLE 연결이 필요합니다. 상단 [연결]을 눌러 주세요.");
    return;
  }

  try {
    btnSpin.disabled = true;
    setStatus("🎡 룰렛 신호 전송 중…");
    await triggerSpin();
    setStatus("🎡 룰렛 신호 전송!");
    // re-enable after short delay (UX)
    setTimeout(() => {
      setStatus("✅ BLE 연결됨");
      btnSpin.disabled = false;
    }, 1200);
  } catch (e) {
    console.error(e);
    alert("전송 실패. BLE 연결 상태를 확인해 주세요.");
    setStatus("전송 실패");
    await bleDisconnect();
  }
});

// =====================
// BLE core
// =====================
async function bleConnect() {
  if (!navigator.bluetooth) {
    throw new Error("이 브라우저는 Web Bluetooth를 지원하지 않습니다.");
  }

  setStatus("장치 선택 중…");

  // ✅ 가장 안전한 방식: IO 서비스 가진 micro:bit만 검색
bleDevice = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "BBC micro:bit" }],
    optionalServices: [MB_IO_SERVICE]
  });

  bleDevice.addEventListener("gattserverdisconnected", onBleDisconnected);

  setStatus("연결 중…");
  bleServer = await bleDevice.gatt.connect();

  setStatus("IO 서비스 연결 중…");
  ioService = await bleServer.getPrimaryService(MB_IO_SERVICE);

  setStatus("핀 특성 연결 중…");
  pinChar = await ioService.getCharacteristic(MB_PIN_DATA);

  bleConnected = true;
  btnConnect.classList.add("hidden");
  btnDisconnect.classList.remove("hidden");
}

async function bleDisconnect() {
  try {
    if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
    }
  } catch {}
  onBleDisconnected();
}

function onBleDisconnected() {
  bleReset();
  setStatus("대기 중 (연결 끊김)");
}

function bleReset() {
  bleConnected = false;
  bleDevice = null;
  bleServer = null;
  ioService = null;
  pinChar = null;

  btnDisconnect.classList.add("hidden");
  btnConnect.classList.remove("hidden");
}

async function triggerSpin() {
  // P2를 1로 올렸다가 0으로 내리기
  await writeDigital(TRIGGER_PIN, 1);
  await sleep(150);
  await writeDigital(TRIGGER_PIN, 0);
}

// micro:bit PinData payload:
// [pin, valueLow, valueHigh, mode]
// mode: 1=digital (호환성 목적)
async function writeDigital(pin, value) {
  if (!pinChar) throw new Error("핀 특성 연결이 없습니다.");
  const v = value ? 1 : 0;
  const data = new Uint8Array([pin & 0xff, v, 0x00, 0x01]);
  await pinChar.writeValue(data);
}

// =====================
// Utils
// =====================
function setStatus(t) {
  elStatus.textContent = t;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

