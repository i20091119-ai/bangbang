/***********************
 * 설정
 ***********************/
// ✅ 여기에 STEP 1에서 나온 Apps Script "웹앱 URL" 넣기
// 예: https://script.google.com/macros/s/XXXXX/exec
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";

// JSONP 콜백 이름
const JSONP_CALLBACK = "onQuestionsLoaded";

// Web Serial로 micro:bit에 보낼 명령(다음 STEP에서 micro:bit 코드가 이걸 받음)
const SPIN_COMMAND = "SPIN\n";

/***********************
 * 상태
 ***********************/
let questions = [];            // [{id, enabled, question, choiceA..D, answer}]
let selectedId = null;
let lastWrongId = null;        // 직전 오답 문항 잠금
let canSpin = false;

// Serial
let port = null;
let writer = null;

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

btnBack.addEventListener("click", () => {
  // 다른 문제 선택으로 이동
  goPick();
});

btnRetry.addEventListener("click", () => {
  // 현재 문제 다시 풀기(오답 후)
  feedback.textContent = "";
  btnRetry.classList.add("hidden");
  setSpinEnabled(false);
});

btnSpin.addEventListener("click", async () => {
  // 정답일 때만 활성화
  if (!canSpin) return;

  // 유선 연결이 안 되어 있으면 안내만
  if (!port || !writer) {
    alert("micro:bit(USB) 연결이 필요해요. 상단의 [연결] 버튼을 눌러 주세요.");
    return;
  }

  try {
    await writer.write(SPIN_COMMAND);
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
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("PUT_YOUR_WEBAPP_URL_HERE")) {
    elStatus.textContent = "⚠️ APPS_SCRIPT_URL을 app.js에 입력해 주세요.";
    return;
  }

  // JSONP 콜백을 전역에 등록
  window[JSONP_CALLBACK] = (data) => {
    try {
      questions = normalizeQuestions(data);
      elStatus.textContent = `문항 ${questions.length}개 로드 완료`;
      lastWrongId = null;
      updateLockText();
      renderPick();
    } catch (e) {
      console.error(e);
      elStatus.textContent = "문항 로드 실패(형식 오류)";
    }
  };

  // JSONP 스크립트 삽입
  const script = document.createElement("script");
  script.src = `${APPS_SCRIPT_URL}?callback=${JSONP_CALLBACK}&_=${Date.now()}`;
  script.onerror = () => {
    elStatus.textContent = "문항 로드 실패(네트워크/URL 확인)";
  };
  document.body.appendChild(script);
}

function normalizeQuestions(data) {
  if (!Array.isArray(data)) throw new Error("Invalid data");

  // id 1~6만 사용(정렬)
  const list = data
    .filter(q => q && typeof q.id !== "undefined")
    .map(q => ({
      id: Number(q.id),
      enabled: Boolean(q.enabled),
      question: String(q.question || ""),
      choiceA: String(q.choiceA || ""),
      choiceB: String(q.choiceB || ""),
      choiceC: String(q.choiceC || ""),
      choiceD: String(q.choiceD || ""),
      answer: String(q.answer || "A").toUpperCase().trim()
    }))
    .filter(q => q.enabled === true)
    .sort((a, b) => a.id - b.id);

  // 6문항이 기본이지만, enabled로 줄어들 수 있음
  return list;
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
  const q = questions.find(x => x.id === id);
  if (!q) return;

  selectedId = id;
  canSpin = false;
  setSpinEnabled(false);

  screenPick.classList.add("hidden");
  screenQuiz.classList.remove("hidden");

  // 렌더
  quizNo.textContent = `문제 ${q.id}번`;
  questionText.textContent = q.question;

  const btns = document.querySelectorAll(".choiceBtn");
  btns.forEach(btn => {
    const c = btn.dataset.choice;
    btn.textContent =
      c === "A" ? q.choiceA :
      c === "B" ? q.choiceB :
      c === "C" ? q.choiceC :
      q.choiceD;
    btn.disabled = false;
    btn.classList.remove("opacity-50");
  });

  feedback.textContent = "";
  btnRetry.classList.add("hidden");

  // 선택 이벤트
  btns.forEach(btn => {
    btn.onclick = () => handleChoice(btn.dataset.choice);
  });
}

/***********************
 * 선택 화면 렌더
 ***********************/
function renderPick() {
  // 6개 버튼을 항상 보여주되, 문항이 없는 id는 비활성 처리
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
    const cls = colors[(id - 1) % colors.length];

    const btn = document.createElement("button");
    btn.className =
      `h-24 md:h-40 rounded-2xl shadow-lg text-4xl md:text-6xl font-extrabold ` +
      `flex items-center justify-center ${cls}`;

    // 존재하지 않거나 잠금이면 비활성
    if (!exists || locked) {
      btn.className += " opacity-40";
      btn.disabled = true;
      btn.title = !exists ? "문항이 비활성/없음" : "직전 오답 문항은 잠깐 잠금";
    }

    btn.textContent = String(id);

    btn.addEventListener("click", () => goQuiz(id));
    gridButtons.appendChild(btn);
  }

  updateLockText();
}

/***********************
 * 채점 로직
 ***********************/
function handleChoice(choice) {
  const q = questions.find(x => x.id === selectedId);
  if (!q) return;

  // 버튼 비활성(중복 클릭 방지)
  document.querySelectorAll(".choiceBtn").forEach(b => b.disabled = true);

  const correct = (choice === q.answer);

  if (correct) {
    feedback.textContent = "✅ 정답! 룰렛을 돌릴 수 있어요.";
    feedback.className = "mt-5 text-lg md:text-xl font-extrabold text-emerald-600";

    // 정답이면 잠금 해제
    lastWrongId = null;
    updateLockText();

    canSpin = true;
    setSpinEnabled(true);
    btnRetry.classList.add("hidden");
  } else {
    feedback.textContent = "❌ 오답! 다시 풀거나 다른 문제를 선택하세요.";
    feedback.className = "mt-5 text-lg md:text-xl font-extrabold text-rose-600";

    // 오답이면 직전 오답 잠금 설정
    lastWrongId = selectedId;
    updateLockText();

    canSpin = false;
    setSpinEnabled(false);

    // 다시 풀기 활성화
    btnRetry.classList.remove("hidden");
  }
}

function setSpinEnabled(enabled) {
  btnSpin.disabled = !enabled;
  if (enabled) {
    btnSpin.className = "h-12 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg shadow";
  } else {
    btnSpin.className = "h-12 px-5 rounded-xl bg-slate-200 text-slate-600 font-extrabold text-lg shadow";
  }
}

function updateLockText() {
  elLock.textContent = lastWrongId ? `${lastWrongId}번` : "없음";
}

/***********************
 * Web Serial (유선 연결)
 ***********************/
btnConnect.addEventListener("click", async () => {
  if (!("serial" in navigator)) {
    alert("이 브라우저는 Web Serial을 지원하지 않아요. (갤럭시 크롬 최신버전 권장)");
    return;
  }
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    writer = port.writable.getWriter();

    btnDisconnect.classList.remove("hidden");
    elStatus.textContent = "✅ micro:bit 유선 연결됨";

  } catch (e) {
    console.error(e);
    alert("연결 실패. OTG/케이블/권한을 확인해 주세요.");
  }
});

btnDisconnect.addEventListener("click", async () => {
  try {
    if (writer) {
      writer.releaseLock();
      writer = null;
    }
    if (port) {
      await port.close();
      port = null;
    }
  } catch (e) {
    console.error(e);
  } finally {
    btnDisconnect.classList.add("hidden");
    elStatus.textContent = "연결 해제됨";
  }
});
