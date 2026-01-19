/*************************************************
 * Quiz Roulette – Final Wired Version (Web Serial)
 * - Target: Android Tablet + Chrome + OTG Adapter
 * - Stability: 100% (No Bluetooth pairing needed)
 *************************************************/

// 구글 스프레드시트 Apps Script URL (기존 동일)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

// =====================
// 유선 통신(Serial) 관련 변수
// =====================
let port = null;   // 연결된 USB 포트 객체
let writer = null; // 데이터를 내보낼 쓰기 스트림
let isConnected = false; // 연결 상태 플래그

// =====================
// 퀴즈 상태 변수
// =====================
let questions = [];
let selectedId = null;
let lastWrongId = null;
let canSpin = false;

// =====================
// DOM 요소 가져오기
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
// 초기화 실행
// =====================
// 브라우저 호환성 사전 체크
if (!navigator.serial) {
  alert("⚠️ 중요 ⚠️\n현재 브라우저는 유선 연결을 지원하지 않습니다.\n반드시 'Chrome(크롬)' 앱으로 실행해주세요.");
  setStatus("브라우저 호환성 오류 (Chrome 필요)");
} else {
  setStatus("상단의 [🔌 USB 연결] 버튼을 눌러주세요.");
}

updateLockText();
setSpinEnabled(false);
setBackHint(false);
goPick();
loadQuestions(); // 문항 불러오기 시작

// =====================
// [로직 1] 문항 데이터 로드 (JSONP)
// =====================
function loadQuestions() {
  // setStatus("문항 데이터 불러오는 중..."); // 초기 상태 유지를 위해 주석 처리
  
  window[JSONP_CALLBACK] = (data) => {
    questions = normalizeQuestions(data);
    console.log(`${questions.length}개 문항 로드 완료`);
    renderPick(); // 번호판 그리기
  };

  // 캐시 방지를 위해 타임스탬프 추가
  const s = document.createElement("script");
  s.src = `${APPS_SCRIPT_URL}?callback=${JSONP_CALLBACK}&_=${Date.now()}`;
  s.onerror = () => {
      alert("문항을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.");
      setStatus("문항 로드 실패 (인터넷 확인)");
  }
  document.body.appendChild(s);
}

// 데이터 정제 함수
function normalizeQuestions(data) {
  return (Array.isArray(data) ? data : [])
    .filter(q => q && q.enabled === true) // 활성화된 문제만
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
// [로직 2] 퀴즈 UI 및 흐름 제어
// =====================
// 화면 전환: 문제 고르기 화면으로
function goPick() {
  selectedId = null; canSpin = false; setSpinEnabled(false);
  feedback.textContent = ""; btnRetry.classList.add("hidden"); setBackHint(false);
  screenQuiz.classList.add("hidden"); screenPick.classList.remove("hidden");
  renderPick(); updateLockText();
}

// 화면 전환: 문제 풀기 화면으로
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
    btn.disabled = false; // 버튼 다시 활성화
    btn.onclick = () => handleChoice(c);
  });
}

// 번호판 그리기
function renderPick() {
  const colors = ["bg-rose-200 text-rose-800","bg-amber-200 text-amber-800","bg-emerald-200 text-emerald-800","bg-sky-200 text-sky-800","bg-violet-200 text-violet-800","bg-lime-200 text-lime-800"];
  const hasIds = new Set(questions.map(q=>q.id));
  gridButtons.innerHTML = "";
  for(let id=1; id<=6; id++) {
    const exists = hasIds.has(id);
    const locked = (lastWrongId === id);
    const btn = document.createElement("button");
    btn.className = `tap h-28 md:h-40 rounded-2xl shadow-md hover:shadow-lg text-5xl md:text-6xl font-black flex items-center justify-center transition-all ${colors[id-1]||"bg-gray-200"}`;
    if(!exists || locked) { btn.disabled = true; btn.classList.add("disabled-look"); }
    btn.textContent = String(id);
    btn.onclick = () => goQuiz(id);
    gridButtons.appendChild(btn);
  }
}

function updateLockText() { elLock.textContent = lastWrongId ? `${lastWrongId}번` : "없음"; }

// 정답 체크 로직
function handleChoice(choice) {
  const q = questions.find(x => x.id === selectedId);
  if(!q) return;
  choiceBtns.forEach(b => b.disabled=true); // 중복 클릭 방지
  
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

// 룰렛 버튼 활성화/비활성화 스타일 처리
function setSpinEnabled(enabled) {
  btnSpin.disabled = !enabled;
  if(enabled) {
    btnSpin.className = "tap h-14 px-8 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xl flex justify-center items-center gap-3 shadow-lg hover:shadow-xl transition-all";
  } else {
    btnSpin.className = "h-14 px-8 rounded-2xl bg-slate-200 text-slate-400 font-black text-xl flex justify-center items-center gap-3 cursor-not-allowed opacity-70";
  }
}

// 뒤로가기 버튼 스타일 처리
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
// [로직 3] 🔥 유선(Web Serial) 연결 핵심 로직 🔥
// =====================
btnConnect.addEventListener("click", async () => {
  // 1. 브라우저 지원 확인
  if (!navigator.serial) {
    alert("이 브라우저는 유선 연결을 지원하지 않습니다.\n크롬(Chrome) 앱에서 실행해주세요.");
    return;
  }

  try {
    setStatus("장치 선택 팝업을 확인해주세요...");
    
    // 2. 포트 요청 (사용자에게 팝업 표시)
    // 필터를 사용해 micro:bit만 보여주려 했으나, 
    // 안드로이드 호환성을 위해 필터 없이 모든 시리얼 장치를 표시합니다.
    port = await navigator.serial.requestPort({});
    
    setStatus("장치에 연결하는 중...");

    // 3. 포트 열기 (통신 속도 115200bps 필수)
    await port.open({ baudRate: 115200 });

    // 4. 데이터를 편하게 쓰기 위한 스트림 설정 (문자열 -> 바이트 변환)
    const textEncoder = new TextEncoderStream();
    const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    writer = textEncoder.writable.getWriter();

    isConnected = true;
    setStatus("✅ 유선 연결 성공! (준비 완료)");
    
    // 버튼 상태 업데이트
    btnConnect.classList.add("hidden");
    btnDisconnect.classList.remove("hidden");

    // 연결 성공 시 가벼운 진동 피드백 (지원 기기만)
    if(navigator.vibrate) navigator.vibrate(100);

  } catch (e) {
    console.error(e);
    // 사용자가 팝업을 취소한 경우는 에러 메시지 생략
    if (e.name !== "NotFoundError") {
        alert(`연결 실패:\n${e.message}\n\n💡 힌트: OTG 젠더가 태블릿 쪽에 꽂혀있나요?`);
    }
    setStatus("연결이 취소되었거나 실패했습니다.");
    disconnectSerial();
  }
});

// 연결 해제 버튼
btnDisconnect.addEventListener("click", async () => {
  await disconnectSerial();
  alert("유선 연결이 해제되었습니다.");
});

// 연결 해제 처리 함수
async function disconnectSerial() {
  // 쓰기 스트림 닫기
  if (writer) {
    await writer.close();
    writer = null;
  }
  // 포트 닫기
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
// [로직 4] 룰렛 동작 신호 전송
// =====================
btnSpin.addEventListener("click", async () => {
  if(!canSpin) return;
  
  // 연결 체크
  if(!isConnected || !writer) {
    alert("⚠️ 마이크로비트가 연결되지 않았습니다.\n상단의 [🔌 USB 연결] 버튼을 먼저 눌러주세요.");
    return;
  }
  
  try {
    btnSpin.disabled = true; // 중복 전송 방지
    setStatus("⚡ 룰렛 신호 전송 중...");
    
    // 🔥 핵심: "SPIN" 문자열과 줄바꿈(\n)을 함께 전송
    // 마이크로비트는 \n을 받아야 명령의 끝으로 인식합니다.
    await writer.write("SPIN\n");
    
    setStatus("✅ 신호 전송 완료! 룰렛이 돌아갑니다.");
    
    // 버튼 및 상태 복구
    setTimeout(() => {
      if(isConnected) setStatus("✅ 유선 연결 성공! (준비 완료)");
      btnSpin.disabled = false;
    }, 2000);
    
  } catch(e) {
    console.error(e);
    alert("신호 전송 실패!\n케이블이 빠졌는지 확인해주세요.");
    setStatus("전송 오류 (연결 확인 필요)");
    disconnectSerial(); // 안전을 위해 연결 해제 처리
  }
});

// =====================
// 유틸리티 및 이벤트 리스너
// =====================
btnBack.addEventListener("click", () => goPick());

btnRetry.addEventListener("click", () => {
  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setSpinEnabled(false);
  choiceBtns.forEach(b => b.disabled=false);
});

// 상태 텍스트 업데이트 헬퍼
function setStatus(t) {
  elStatus.textContent = t;
}

// (선택사항) 페이지를 벗어날 때 연결 안전하게 종료 시도
window.addEventListener('beforeunload', async () => {
    if(isConnected) await disconnectSerial();
});
