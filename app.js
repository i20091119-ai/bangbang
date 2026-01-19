/*************************************************
 * Quiz Roulette – Desktop Wired Version
 * - Target: Laptop (Windows/Mac) + Chrome
 * - Feature: Web Serial API (No Filter)
 *************************************************/

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

// 시리얼 통신 변수
let port, writer;
let isConnected = false;

// 게임 상태 변수
let questions = [];
let selectedId = null;
let lastWrongId = null; // 틀린 문제 잠금용
let canSpin = false;

// DOM
const elStatusText = document.getElementById("statusText");
const elStatusIndicator = document.querySelector("#statusIndicator div");
const btnConnect = document.getElementById("btnConnect");
const screenPick = document.getElementById("screenPick");
const screenQuiz = document.getElementById("screenQuiz");
const gridButtons = document.getElementById("gridButtons");
const quizNo = document.getElementById("quizNo");
const questionText = document.getElementById("questionText");
const feedback = document.getElementById("feedback");
const choiceBtns = document.querySelectorAll(".choiceBtn");
const choiceTexts = document.querySelectorAll(".choiceText");
const btnSpin = document.getElementById("btnSpin");
const btnBack = document.getElementById("btnBack");
const btnRetry = document.getElementById("btnRetry");

// === 초기화 ===
if (!navigator.serial) {
    alert("이 브라우저는 USB 연결을 지원하지 않습니다.\n크롬(Chrome)이나 엣지(Edge)를 사용해주세요.");
    btnConnect.disabled = true;
    elStatusText.textContent = "브라우저 미지원";
}

loadQuestions();
goPick();

// === 1. 문항 로드 ===
function loadQuestions() {
    window[JSONP_CALLBACK] = (data) => {
        questions = normalizeQuestions(data);
        console.log("문항 로드 완료:", questions.length);
        renderPick();
    };
    const s = document.createElement("script");
    s.src = `${APPS_SCRIPT_URL}?callback=${JSONP_CALLBACK}&_=${Date.now()}`;
    document.body.appendChild(s);
}

function normalizeQuestions(data) {
    return (Array.isArray(data) ? data : [])
        .filter(q => q && q.enabled === true)
        .map(q => ({
            id: Number(q.id),
            question: q.question,
            choices: {A: q.choiceA, B: q.choiceB, C: q.choiceC, D: q.choiceD},
            answer: String(q.answer).toUpperCase().trim()
        }))
        .sort((a,b)=>a.id-b.id);
}

// === 2. 화면 전환 ===
function goPick() {
    screenQuiz.classList.add("hidden");
    screenPick.classList.remove("hidden");
    renderPick();
    resetQuizState();
}

function goQuiz(id) {
    const q = questions.find(x => x.id === id);
    if (!q) return;

    selectedId = id;
    screenPick.classList.add("hidden");
    screenQuiz.classList.remove("hidden");

    quizNo.textContent = `문제 ${q.id}`;
    questionText.textContent = q.question;
    
    // 보기 설정
    choiceBtns.forEach((btn, idx) => {
        const key = btn.dataset.choice;
        choiceTexts[idx].textContent = q.choices[key];
        btn.disabled = false;
        btn.onclick = () => checkAnswer(key, q.answer);
        
        // 스타일 초기화
        btn.className = "choiceBtn btn-shadow bg-white border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-left p-6 rounded-2xl transition-colors group w-full";
    });

    resetQuizState();
}

function resetQuizState() {
    feedback.textContent = "";
    btnSpin.disabled = true;
    canSpin = false;
    btnRetry.classList.add("hidden");
    btnSpin.className = "bg-slate-300 text-white px-12 py-4 rounded-xl text-3xl font-bold flex items-center gap-3 opacity-50 cursor-not-allowed transition-all";
}

// === 3. 번호판 렌더링 ===
function renderPick() {
    const colors = ["bg-rose-100 text-rose-600 border-rose-200","bg-orange-100 text-orange-600 border-orange-200","bg-amber-100 text-amber-600 border-amber-200","bg-emerald-100 text-emerald-600 border-emerald-200","bg-cyan-100 text-cyan-600 border-cyan-200","bg-indigo-100 text-indigo-600 border-indigo-200"];
    
    gridButtons.innerHTML = "";
    questions.forEach((q, idx) => {
        const btn = document.createElement("button");
        const colorClass = colors[idx % colors.length];
        const isLocked = (lastWrongId === q.id);
        
        btn.className = `h-40 rounded-3xl text-6xl font-black border-4 btn-shadow transition-transform ${colorClass} ${isLocked ? 'opacity-40 grayscale cursor-not-allowed' : 'hover:-translate-y-1'}`;
        btn.textContent = q.id;
        btn.disabled = isLocked;
        btn.onclick = () => goQuiz(q.id);
        
        gridButtons.appendChild(btn);
    });
}

// === 4. 정답 체크 ===
function checkAnswer(userChoice, correctChoice) {
    // 모든 버튼 비활성화
    choiceBtns.forEach(b => b.disabled = true);

    if (userChoice === correctChoice) {
        // 정답
        feedback.textContent = "🎉 정답입니다! 룰렛을 돌려주세요.";
        feedback.className = "text-3xl font-bold mb-6 h-10 text-emerald-600 animate-bounce-custom";
        lastWrongId = null; // 잠금 해제
        
        // 룰렛 버튼 활성화
        canSpin = true;
        btnSpin.disabled = false;
        btnSpin.className = "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-12 py-4 rounded-xl text-3xl font-bold flex items-center gap-3 shadow-lg transform hover:scale-105 transition-all btn-shadow cursor-pointer";
        
    } else {
        // 오답
        feedback.textContent = "💥 땡! 틀렸습니다.";
        feedback.className = "text-3xl font-bold mb-6 h-10 text-rose-500 shake";
        lastWrongId = selectedId; // 해당 문제 잠금
        
        btnRetry.classList.remove("hidden");
    }
}

// === 5. USB 연결 (Web Serial) ===
btnConnect.addEventListener("click", async () => {
    try {
        // 필터 없이 모든 포트 열기 (노트북은 이게 제일 편함)
        port = await navigator.serial.requestPort({});
        await port.open({ baudRate: 115200 }); // 마이크로비트 통신속도

        const textEncoder = new TextEncoderStream();
        const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
        writer = textEncoder.writable.getWriter();

        isConnected = true;
        updateStatus(true);
        
    } catch (e) {
        console.error(e);
        if (e.name !== 'NotFoundError') alert("연결 실패: " + e.message);
    }
});

function updateStatus(connected) {
    if (connected) {
        elStatusText.textContent = "연결 성공 (준비됨)";
        elStatusText.className = "text-emerald-600 font-bold";
        elStatusIndicator.className = "w-3 h-3 rounded-full bg-emerald-500 animate-pulse";
        btnConnect.classList.add("hidden");
    } else {
        elStatusText.textContent = "연결 끊김";
        elStatusIndicator.className = "w-3 h-3 rounded-full bg-rose-500";
    }
}

// === 6. 룰렛 동작 (신호 전송) ===
btnSpin.addEventListener("click", async () => {
    if (!canSpin) return;

    if (!isConnected || !writer) {
        alert("⚠️ USB 장치가 연결되지 않았습니다.\n상단의 [장치 연결] 버튼을 눌러주세요.");
        return;
    }

    try {
        btnSpin.disabled = true; // 중복 클릭 방지
        
        // "SPIN" + 줄바꿈 전송
        await writer.write("SPIN\n");
        
        // UI 반응
        feedback.textContent = "🚀 룰렛 돌아가는 중...";
        
        setTimeout(() => {
            btnSpin.disabled = false;
            feedback.textContent = "축하합니다! 상품을 확인하세요.";
        }, 4000);
        
    } catch (e) {
        alert("전송 실패. 케이블을 확인하세요.");
        isConnected = false;
        updateStatus(false);
    }
});

// 버튼 이벤트
btnBack.addEventListener("click", goPick);
btnRetry.addEventListener("click", () => {
    resetQuizState();
    choiceBtns.forEach(b => b.disabled = false); // 다시 선택 가능
});
