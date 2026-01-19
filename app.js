/*************************************************
 * Quiz Roulette – WIRED USB Final (No Filter)
 * - Target: Android Tablet + Chrome + OTG
 * - Fix: Removed filters to show ALL serial devices
 *************************************************/

// 구글 스프레드시트 Apps Script URL
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

// =====================
// 유선 통신(Serial) 변수
// =====================
let port = null;
let writer = null;
let isConnected = false;

// =====================
// 퀴즈 상태 변수
// =====================
let questions = [];
let selectedId = null;
let lastWrongId = null;
let canSpin = false;

// =====================
// DOM 요소
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
// 초기화
// =====================
// 브라우저 지원 확인
if (!navigator.serial) {
  alert("⚠️ 크롬(Chrome) 브라우저에서 실행해주세요.\n현재 브라우저는 USB 연결을 지원하지 않습니다.");
  setStatus("브라우저 호환성 오류");
} else {
  setStatus("상단의 [🔌 USB 연결] 버튼을 눌러주세요.");
}

updateLockText();
setSpinEnabled(false);
setBackHint(false);
goPick();
loadQuestions();

// =====================
// 1. 문항 데이터 로드
// =====================
function loadQuestions() {
  window[JSONP_CALLBACK] = (data) => {
    questions = normalizeQuestions(data);
    console.log(`${questions.length}개 문항 로드 완료`);
    renderPick();
  };

  const s = document.createElement("script");
  s.src = `${APPS_SCRIPT_URL}?callback=${JSONP_CALLBACK}&_=${Date.now()}`;
  s.onerror = () => {
      setStatus("문항 로드 실패 (인터넷 확인 필요)");
  }
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
// 2. 화면 로직 (퀴즈)
// =====================
function goPick() {
  selectedId = null; canSpin = false; setSpinEnabled(false);
  feedback.textContent = ""; btnRetry.classList.add("hidden"); setBackHint(false);
  screenQuiz.classList.add("hidden"); screenPick.classList.remove("hidden");
  renderPick(); updateLockText();
}

function goQuiz(id) {
  const q = questions.find(x => x.id === id);
  if(!q) return;
  selectedId = id; canSpin = false; setSpinEnabled(false);
  feedback.textContent = ""; btnRetry.classList.add("hidden"); setBackHint(false);
  screenPick.classList.add("hidden"); screenQuiz.classList.remove("hidden");
  
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
  const colors = ["bg-rose-200 text-rose-800","bg-amber-200 text-amber-800","bg-emerald-200 text-emerald-800","bg-sky-200 text-sky-800","bg-violet-200 text-violet-800","bg-lime-200 text-lime-800"];
  const hasIds = new Set(questions.map(q=>q.id));
  gridButtons.innerHTML = "";
  for(let id=1; id<=6; id++) {
    const exists = hasIds.has(id);
    const locked = (lastWrongId === id);
    const btn = document.createElement("button");
    btn.className = `tap h-28 md:h-40 rounded-2xl shadow-md text-5xl md:text-6xl font-black flex items-center justify-center ${colors[id-1]||"bg-gray-200"}`;
    if(!exists || locked) { btn.disabled = true; btn.classList.add("disabled-look"); }
    btn.textContent = String(id);
    btn.onclick = () => goQuiz(id);
    gridButtons.appendChild(btn);
  }
}

function updateLockText() { elLock.textContent = lastWrongId ? `${lastWrongId}번` : "없음"; }

function handleChoice(choice) {
  const q = questions.find(x => x.id === selectedId);
  if(!q) return;
  choiceBtns.forEach(b => b.disabled=true);
  
  if(choice === q.answer) {
    feedback.innerHTML = "🎉 정답입니다!<br>룰렛을 돌려주세요.";
    feedback.className = "text-emerald-600 animate-bounce";
    lastWrongId = null; updateLockText(); canSpin = true; setSpinEnabled(true);
  } else {
    feedback.innerHTML = "앗, 오답입니다.<br>다른 문제를 선택해주세요.";
    feedback.className = "text-rose-500 shake";
    lastWrongId = selectedId; updateLockText(); canSpin = false; setSpinEnabled(false);
    btnRetry.classList.remove("hidden"); setBackHint(true);
  }
}

function setSpinEnabled(enabled) {
  btnSpin.disabled = !enabled;
  if(enabled) {
    btnSpin.className = "tap h-14 px-8 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-xl flex justify-center items-center gap-3 shadow-lg";
  } else {
    btnSpin.className = "h-14 px-8 rounded-2xl bg-slate-200 text-slate-400 font-black text-xl flex justify-center items-center gap-3 cursor-not-allowed opacity-70";
  }
}

function setBackHint(isWrong) {
  if(isWrong) {
    btnBack.className = "shrink-0 tap h-12 px-6 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-lg shake";
    btnBack.textContent = "🔙 다른 문제 선택";
    setTimeout(()=>btnBack.classList.remove("shake"), 650);
  } else {
    btnBack.className = "shrink-0 tap h-12 px-6 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg";
    btnBack.textContent = "다른 문제";
  }
}

// =====================
// 3. 🔥 유선 연결 (핵심 수정됨) 🔥
// =====================
btnConnect.addEventListener("click", async () => {
  if (!navigator.serial) {
    alert("크롬(Chrome) 앱에서 실행해주세요.");
    return;
  }

  try {
    setStatus("장치 선택 팝업을 확인해주세요...");
    
    // 🚨 [핵심 수정] filters: [] 
    // 빈 필터를 쓰거나 아예 빈 객체({})를 넘기면 
    // 크롬은 연결 가능한 '모든' 시리얼 포트를 보여줍니다.
    // 안드로이드에서 이름이 이상하게 뜨는 장치도 다 잡힙니다.
    port = await navigator.serial.requestPort({});
    
    setStatus("장치에 연결하는 중...");

    // 통신 속도 115200 (마이크로비트 표준)
    await port.open({ baudRate: 115200 });

    const textEncoder = new TextEncoderStream();
    const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    writer = textEncoder.writable.getWriter();

    isConnected = true;
    setStatus("✅ 유선 연결 성공! (준비 완료)");
    
    btnConnect.classList.add("hidden");
    btnDisconnect.classList.remove("hidden");

    // 진동 피드백
    if(navigator.vibrate) navigator.vibrate(100);

  } catch (e) {
    console.error(e);
    // 사용자가 취소한 경우는 에러 아님
    if (e.name !== "NotFoundError") {
        alert(`연결 실패:\n${e.message}\n\nOTG 젠더가 꽉 꽂혔는지 확인하세요.`);
    }
    setStatus("연결이 취소되었거나 실패했습니다.");
    disconnectSerial();
  }
});

btnDisconnect.addEventListener("click", async () => {
  await disconnectSerial();
  alert("연결이 해제되었습니다.");
});

async function disconnectSerial() {
  if (writer) {
    await writer.close();
    writer = null;
  }
  if (port) {
    await port.close();
    port = null;
  }
  isConnected = false;
  setStatus("상단의 [🔌 USB 연결] 버튼을 눌러주세요.");
  btnDisconnect.classList.add("hidden");
  btnConnect.classList.remove("hidden");
}

// =====================
// 4. 신호 전송 (SPIN)
// =====================
btnSpin.addEventListener("click", async () => {
  if(!canSpin) return;
  
  if(!isConnected || !writer) {
    alert("마이크로비트가 연결되지 않았습니다.\n먼저 [🔌 USB 연결]을 해주세요.");
    return;
  }
  
  try {
    btnSpin.disabled = true;
    setStatus("⚡ 신호 전송 중...");
    
    // "SPIN" 문자열과 줄바꿈(\n) 전송
    await writer.write("SPIN\n");
    
    setStatus("✅ 신호 전송 완료!");
    
    setTimeout(() => {
      if(isConnected) setStatus("✅ 유선 연결 성공! (준비 완료)");
      btnSpin.disabled = false;
    }, 2000);
    
  } catch(e) {
    console.error(e);
    alert("전송 실패. 케이블을 확인하세요.");
    setStatus("전송 오류");
    disconnectSerial();
  }
});

// 유틸
btnBack.addEventListener("click", () => goPick());
btnRetry.addEventListener("click", () => {
  feedback.textContent = ""; btnRetry.classList.add("hidden");
  setSpinEnabled(false); choiceBtns.forEach(b => b.disabled=false);
});
function setStatus(t) { elStatus.textContent = t; }

// 페이지 종료 시 연결 해제 시도
window.addEventListener('beforeunload', async () => {
    if(isConnected) await disconnectSerial();
});
