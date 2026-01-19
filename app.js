/* =========================================================
   Quiz Roulette (PC + Chrome Web Serial + micro:bit USB)
   Protocol:
     PC -> micro:bit: "PING\n", "SPIN\n", "STOP\n"
     micro:bit -> PC: "READY\n", "PONG\n", "DONE\n", "STOPPED\n", "ERR:...\n"
   ========================================================= */

const $ = (sel) => document.querySelector(sel);

const btnConnect = $("#btnConnect");
const btnDisconnect = $("#btnDisconnect");
const btnPing = $("#btnPing");
const btnSpin = $("#btnSpin");
const btnStop = $("#btnStop");
const btnNext = $("#btnNext");

const connDot = $("#connDot");
const connText = $("#connText");
const logEl = $("#log");
const questionEl = $("#question");

// ---- Simple question bank (원하면 여기만 바꾸면 됨) ----
const QUESTIONS = [
  "기후변화의 원인 중 하나를 말해보세요.",
  "해수면 상승이 섬나라에 미치는 영향을 설명해보세요.",
  "산불이 크게 번지는 이유 2가지를 말해보세요.",
  "미디어 리터러시가 왜 중요한가요?",
  "AI를 안전하게 쓰기 위한 규칙 1가지를 말해보세요."
];
let qIndex = 0;

// ---- Web Serial state ----
let port = null;
let writer = null;
let reader = null;
let readLoopAbort = false;

// Text stream helpers
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---------- UI helpers ----------
function log(...args) {
  const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

function setConnectedUI(isConnected) {
  connDot.classList.toggle("on", isConnected);
  connText.textContent = isConnected ? "연결됨" : "미연결";
  btnConnect.disabled = isConnected;
  btnDisconnect.disabled = !isConnected;
  btnPing.disabled = !isConnected;
  btnSpin.disabled = !isConnected;
  btnStop.disabled = !isConnected;
}

function setQuestion() {
  questionEl.textContent = QUESTIONS[qIndex % QUESTIONS.length];
}

// ---------- Serial core ----------
function ensureWebSerialAvailable() {
  if (!window.isSecureContext) {
    throw new Error("보안 컨텍스트가 아닙니다. HTTPS 또는 localhost에서 실행해야 합니다.");
  }
  if (!("serial" in navigator)) {
    throw new Error("navigator.serial이 없습니다. Chrome 탭에서 실행 중인지 확인하세요.");
  }
}

async function connectSerial() {
  ensureWebSerialAvailable();

  log("포트 선택창 열기...");
  // 필터를 걸면 어떤 환경에선 안 잡히는 경우가 있어, 일단 무필터(가장 안정)
  port = await navigator.serial.requestPort();

  log("포트 오픈(115200)...");
  await port.open({ baudRate: 115200 });

  // writer 준비
  writer = port.writable.getWriter();

  // reader 준비 (라인 단위 파싱)
  readLoopAbort = false;
  startReadLoop();

  setConnectedUI(true);
  log("✅ 연결 완료");
}

async function disconnectSerial() {
  readLoopAbort = true;

  try {
    if (reader) {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); } catch {}
      reader = null;
    }
  } catch {}

  try {
    if (writer) {
      try { writer.releaseLock(); } catch {}
      writer = null;
    }
  } catch {}

  try {
    if (port) {
      await port.close();
      port = null;
    }
  } catch {}

  setConnectedUI(false);
  log("🔌 연결 해제");
}

async function writeLine(line) {
  if (!writer) throw new Error("writer가 없습니다. 먼저 연결하세요.");
  const data = encoder.encode(line + "\n");
  await writer.write(data);
  log("➡️ TX:", line);
}

// Read loop: accumulate buffer, split by \n
async function startReadLoop() {
  if (!port?.readable) return;

  reader = port.readable.getReader();
  let buffer = "";

  (async () => {
    try {
      while (!readLoopAbort) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).replace(/\r/g, "").trim();
          buffer = buffer.slice(idx + 1);
          if (line) handleIncomingLine(line);
        }
      }
    } catch (e) {
      if (!readLoopAbort) {
        log("❌ RX 루프 오류:", e?.name || "Error", e?.message || String(e));
      }
    } finally {
      try { reader?.releaseLock(); } catch {}
    }
  })();
}

function handleIncomingLine(line) {
  log("⬅️ RX:", line);

  // micro:bit 응답 기반 UI 반응(원하면 더 확장 가능)
  if (line === "READY") {
    // 부팅 직후
    return;
  }
  if (line === "DONE") {
    log("✅ 룰렛 효과 종료(DONE). 이제 학생에게 질문!");
    return;
  }
  if (line === "STOPPED") {
    log("🛑 효과 중지(STOPPED).");
    return;
  }
  if (line.startsWith("ERR:")) {
    log("⚠️ micro:bit 오류:", line);
    return;
  }
}

// ---------- Events ----------
btnConnect.addEventListener("click", async () => {
  try {
    await connectSerial();
    setQuestion();
  } catch (e) {
    log("❌ 연결 실패:", e?.message || String(e));
    setConnectedUI(false);
  }
});

btnDisconnect.addEventListener("click", async () => {
  await disconnectSerial();
});

btnPing.addEventListener("click", async () => {
  try {
    await writeLine("PING");
  } catch (e) {
    log("❌ PING 실패:", e?.message || String(e));
  }
});

btnSpin.addEventListener("click", async () => {
  try {
    await writeLine("SPIN");
  } catch (e) {
    log("❌ SPIN 실패:", e?.message || String(e));
  }
});

btnStop.addEventListener("click", async () => {
  try {
    await writeLine("STOP");
  } catch (e) {
    log("❌ STOP 실패:", e?.message || String(e));
  }
});

btnNext.addEventListener("click", () => {
  qIndex++;
  setQuestion();
});

// ---------- Init ----------
setConnectedUI(false);
setQuestion();
log("페이지 로드 완료.");
log("조건: HTTPS 또는 localhost, Chrome 탭에서 실행.");
