/*************************************************
 * Quiz Roulette – Final Fix for Android
 * - Key Logic: Scan by namePrefix "BBC micro:bit"
 * - Service: IO Pin Service (P2 trigger)
 *************************************************/

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

// =====================
// BLE UUIDs
// =====================
const MB_IO_SERVICE = "e95d127b-251d-470a-a062-fa1922dfa9a8";
const MB_PIN_DATA   = "e95d8d00-251d-470a-a062-fa1922dfa9a8";
const TRIGGER_PIN = 2; // P2

// =====================
// Global State
// =====================
let questions = [];
let selectedId = null;
let lastWrongId = null;
let canSpin = false;

// BLE Objects
let bleDevice = null;
let bleServer = null;
let ioService = null;
let pinChar = null;
let bleConnected = false;

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
const btnRetry = document.getElementById("btnRetry");
const btnSpin = document.getElementById("btnSpin");
const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const choiceBtns = Array.from(document.querySelectorAll(".choiceBtn"));
const choiceTexts = Array.from(document.querySelectorAll(".choiceText"));

// =====================
// Initialization
// =====================
setStatus("대기 중");
updateLockText();
setSpinEnabled(false);
setBackHint(false);
goPick();
loadQuestions();

// =====================
// Logic: JSONP Load
// =====================
function loadQuestions() {
  setStatus("문항 불러오는 중…");
  window[JSONP_CALLBACK] = (data) => {
    questions = normalizeQuestions(data);
    setStatus(`문항 ${questions.length}개 로드 완료`);
    renderPick();
  };
  const s = document.createElement("script");
  s.src = `${APPS_SCRIPT_URL}?callback=${JSONP_CALLBACK}&_=${Date.now()}`;
  s.onerror = () => setStatus("문항 로드 실패");
  document.body.appendChild(s);
}

function normalizeQuestions(data) {
  return (Array.isArray(data) ? data : [])
    .filter(q => q && q.enabled === true)
    .map(q => ({
      id: Number(q.id),
      question: String(q.question||""),
      choiceA: String(q.choiceA||""),
      choiceB: String(q.choiceB||""),
      choiceC: String(q.choiceC||""),
      choiceD: String(q.choiceD||""),
      answer: String(q.answer||"A").toUpperCase().trim()
    }))
    .sort((a,b)=>a.id-b.id);
}

// =====================
// Logic: Quiz Flow
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
  if(!q) return;
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
  const choices = {A:q.choiceA, B:q.choiceB, C:q.choiceC, D:q.choiceD};
  choiceBtns.forEach((btn, idx) => {
    const c = btn.dataset.choice;
    choiceTexts[idx].textContent = choices[c]||"";
    btn.disabled = false;
    btn.onclick = () => handleChoice(c);
  });
}

function renderPick() {
  const colors = ["bg-rose-200","bg-amber-200","bg-emerald-200","bg-sky-200","bg-violet-200","bg-lime-200"];
  const hasIds = new Set(questions.map(q=>q.id));
  gridButtons.innerHTML = "";
  for(let id=1; id<=6; id++) {
    const exists = hasIds.has(id);
    const locked = (lastWrongId === id);
    const btn = document.createElement("button");
    btn.className = `tap h-28 md:h-48 rounded-2xl shadow-lg text-5xl md:text-7xl font-extrabold flex items-center justify-center ${colors[id-1]||"bg-gray-200"}`;
    if(!exists || locked) {
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

function handleChoice(choice) {
  const q = questions.find(x => x.id === selectedId);
  if(!q) return;
  choiceBtns.forEach(b => b.disabled=true);
  
  if(choice === q.answer) {
    feedback.textContent = "✅ 정답! 룰렛을 돌릴 수 있어요.";
    feedback.className = "mt-5 text-xl font-extrabold text-emerald-600";
    lastWrongId = null;
    updateLockText();
    canSpin = true;
    setSpinEnabled(true);
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
  if(isWrong) {
    btnBack.className = "tap h-11 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold shadow shake";
    btnBack.textContent = "다른 문제 선택하기";
    setTimeout(()=>btnBack.classList.remove("shake"), 650);
  } else {
    btnBack.className = "tap h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold";
    btnBack.textContent = "다른 문제 선택";
  }
}

// =====================
// Logic: BLE Connection (THE FIX)
// =====================
btnConnect.addEventListener("click", async () => {
  try {
    if (!navigator.bluetooth) throw new Error("Web Bluetooth 미지원 브라우저");

    setStatus("장치 검색 중...");
    
    // [핵심 수정] 서비스 UUID가 아닌 '이름(Prefix)'으로 검색
    // 안드로이드에서 Empty List 문제를 해결하는 가장 확실한 방법
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "BBC micro:bit" }],
      optionalServices: [MB_IO_SERVICE]
    });

    bleDevice.addEventListener("gattserverdisconnected", onBleDisconnected);

    setStatus("GATT 연결 중...");
    bleServer = await bleDevice.gatt.connect();

    setStatus("서비스 찾는 중...");
    ioService = await bleServer.getPrimaryService(MB_IO_SERVICE);

    setStatus("특성 연결 중...");
    pinChar = await ioService.getCharacteristic(MB_PIN_DATA);

    bleConnected = true;
    setStatus("✅ 연결 성공!");
    btnConnect.classList.add("hidden");
    btnDisconnect.classList.remove("hidden");

  } catch (e) {
    console.error(e);
    alert(`연결 실패: ${e.message}`);
    setStatus("연결 실패");
    bleReset();
  }
});

btnDisconnect.addEventListener("click", () => {
  if(bleDevice && bleDevice.gatt.connected) bleDevice.gatt.disconnect();
});

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

// =====================
// Logic: Trigger Spin
// =====================
btnSpin.addEventListener("click", async () => {
  if(!canSpin) return;
  if(!bleConnected || !pinChar) {
    alert("먼저 연결 버튼을 눌러주세요.");
    return;
  }
  
  try {
    btnSpin.disabled = true;
    setStatus("🎡 신호 전송...");
    
    // P2 HIGH (1) -> 150ms -> LOW (0)
    // Uint8Array: [pin, value, 0, 1] (mode 1=digital)
    await pinChar.writeValue(new Uint8Array([TRIGGER_PIN, 1, 0, 1]));
    await new Promise(r => setTimeout(r, 150));
    await pinChar.writeValue(new Uint8Array([TRIGGER_PIN, 0, 0, 1]));
    
    setStatus("✅ 전송 완료!");
    setTimeout(() => {
      setStatus("✅ 연결 성공!");
      btnSpin.disabled = false;
    }, 1000);
    
  } catch(e) {
    console.error(e);
    alert("전송 중 오류 발생. 다시 연결해주세요.");
    setStatus("전송 오류");
    bleDisconnect(); // 안전하게 연결 해제 후 재시도 유도
  }
});

// Event Listeners
btnBack.addEventListener("click", () => goPick());
btnRetry.addEventListener("click", () => {
  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setSpinEnabled(false);
  choiceBtns.forEach(b => b.disabled=false);
});

function setStatus(t) { elStatus.textContent = t; }
