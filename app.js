/***********************
 * 설정
 ***********************/
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

// ✅ 문자열 → 바이트 변환기 (Android Web Serial 필수)
const encoder = new TextEncoder();

/***********************
 * 상태
 ***********************/
let questions = [];
let selectedId = null;
let lastWrongId = null;
let canSpin = false;

// Web Serial
let port = null;

/***********************
 * DOM
 ***********************/
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

/***********************
 * 시작
 ***********************/
loadQuestions();

btnBack.addEventListener("click", () => goPick());

btnRetry.addEventListener("click", () => {
  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setSpinEnabled(false);
  // 보기 버튼 다시 활성화
  document.querySelectorAll(".choiceBtn").forEach(b => (b.disabled = false));
});

btnSpin.addEventListener("click", async () => {
  if (!canSpin) return;
  if (!port) {
    alert("micro:bit(USB) 연결이 필요해요. 상단의 [연결] 버튼을 눌러 주세요.");
    return;
  }

  try {
    // ✅ 쓸 때마다 writer를 얻고 바로 release (안정성)
    const writer = port.writable.getWriter();
    await writer.write(encoder.encode("SPIN\n"));
    writer.releaseLock();

    feedback.textContent = "🎡 룰렛이 돌아갑니다!";
  } catch (e) {
    console.error(e);
    alert("전송 실패. 케이블/연결 상태를 확인해 주세요.");
  }
});

/***********************
 * 문항 로드(JSONP)
 ***********************/
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
  script.onerror = () => (elStatus.textContent = "문항 로드 실패(URL/네트워크 확인)");
  document.body.appendChild(script);
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

/***********************
 * 화면 전환
 ***********************/
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
  const q = questions.find((x) => x.id === id);
  if (!q) return;

  selectedId = id;
  canSpin = false;
  setSpinEnabled(false);

  screenPick.classList.add("hidden");
  screenQuiz.classList.remove("hidden");

  quizNo.textContent = `문제 ${q.id}번`;
  questionText.textContent = q.question;

  const btns = document.querySelectorAll(".choiceBtn");
  btns.forEach((btn) => {
    const c = btn.dataset.choice;
    btn.textContent =
      c === "A" ? q.choiceA :
      c === "B" ? q.choiceB :
      c === "C" ? q.choiceC :
      q.choiceD;

    btn.disabled = false;
    btn.onclick = () => handleChoice(c);
  });

  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setBackHint(false);
}

/***********************
 * 선택 화면 렌더
 ***********************/
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
    btn.className =
      `h-24 md:h-40 rounded-2xl shadow-lg text-4xl md:text-6xl font-extrabold flex items-center justify-center ${colors[id - 1]}`;

    if (!exists || locked) {
      btn.disabled = true;
      btn.classList.add("opacity-40");
      btn.title = !exists ? "문항이 비활성/없음" : "직전 오답 문항은 잠깐 잠금";
    }

    btn.textContent = String(id);
    btn.onclick = () => goQuiz(id);
    gridButtons.appendChild(btn);
  }

  updateLockText();
}

/***********************
 * 채점
 ***********************/
function handleChoice(choice) {
  const q = questions.find((x) => x.id === selectedId);
  if (!q) return;

  // 중복 클릭 방지
  document.querySelectorAll(".choiceBtn").forEach((b) => (b.disabled = true));

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

/***********************
 * 버튼 상태/힌트
 ***********************/
function setSpinEnabled(enabled) {
  btnSpin.disabled = !enabled;
  btnSpin.className = enabled
    ? "h-12 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow"
    : "h-12 px-5 rounded-xl bg-slate-200 text-slate-600 font-extrabold shadow";
}

function updateLockText() {
  elLock.textContent = lastWrongId ? `${lastWrongId}번` : "없음";
}

// 오답 힌트: 색 + 흔들기 (index.html에 .nudge 애니메이션이 있어야 함)
function setBackHint(isWrong) {
  if (isWrong) {
    btnBack.className =
      "h-11 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold shadow nudge";
    btnBack.textContent = "다른 문제 선택하기";
    setTimeout(() => btnBack.classList.remove("nudge"), 600);
  } else {
    btnBack.className =
      "h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold";
    btnBack.textContent = "다른 문제 선택";
  }
}

/***********************
 * Web Serial 연결/해제
 ***********************/
btnConnect.addEventListener("click", async () => {
  if (!("serial" in navigator)) {
    alert("이 브라우저는 Web Serial을 지원하지 않아요. (Chrome 최신 권장)");
    return;
  }

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    btnDisconnect.classList.remove("hidden");
    elStatus.textContent = "✅ micro:bit 유선 연결됨";
  } catch (e) {
    console.error(e);
    alert("연결 실패. OTG/케이블/권한을 확인해 주세요.");
  }
});

btnDisconnect.addEventListener("click", async () => {
  try {
    if (port) await port.close();
  } catch (e) {
    console.error(e);
  } finally {
    port = null;
    btnDisconnect.classList.add("hidden");
    elStatus.textContent = "연결 해제됨";
  }
});
