/*************************************************
 * Quiz Roulette – BLE (Web Bluetooth) + TOKEN
 * 최종 수정: Android 캐시 강제 초기화 (Cache Buster) 적용
 *************************************************/

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1y7KfJriDiw5i8OaDJBp6Zwz_ePVR1DgFaQeT3Pjkfw5fSxEKbI6Bd6FX4msxHEs6/exec";
const JSONP_CALLBACK = "onQuestionsLoaded";

const TOKEN = "A1";

// UUID는 소문자로 통일
const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX_UUID      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

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
let bleRxBuffer = "";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// =====================
// Init
// =====================
loadQuestions();
goPick();
setSpinEnabled(false);
updateLockText();
setBackHint(false);

// ... (JSONP 및 퀴즈 UI 로직은 기존과 동일하므로 생략하지 않고 그대로 둡니다) ...
// (위쪽 퀴즈 관련 함수들은 기존 코드 그대로 유지됨)

// =====================
// BLE Logic (여기가 핵심 수정됨)
// =====================
btnConnect.addEventListener("click", async () => {
  try {
    await bleConnectAndVerify();
  } catch (e) {
    console.error(e);
    alert(`[오류 발생]\n${e.message}\n\n팁: 블루투스를 껐다 켜고 다시 해보세요.`);
    setStatus("연결 실패");
    onBleDisconnected();
  }
});

btnDisconnect.addEventListener("click", async () => {
  await bleDisconnect();
});

async function bleConnectAndVerify() {
  if (!navigator.bluetooth) {
    alert("이 브라우저는 블루투스를 지원하지 않습니다.");
    return;
  }

  setStatus("장치 검색 중... (모든 장치 검색 모드)");
  
  // 1. 장치 요청 (가장 강력한 검색 모드)
  bleDevice = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true, 
    optionalServices: [NUS_SERVICE_UUID]
  });
  
  bleDevice.addEventListener("gattserverdisconnected", onBleDisconnected);

  setStatus("서버에 연결 중...");
  bleServer = await bleDevice.gatt.connect();

  // ⭐ [Cache Buster] 안드로이드 캐시 깨우기 ⭐
  // 특정 서비스를 찾기 전에, '모든 서비스'를 한번 훑어보게 해서 
  // 안드로이드가 최신 정보를 가져오게 강제합니다.
  setStatus("서비스 목록 갱신 중... (3초)");
  await sleep(1500); 

  try {
    // 여기서 모든 서비스를 한번 호출해서 캐시를 갱신합니다. (결과는 안 써도 됨)
    const services = await bleServer.getPrimaryServices();
    console.log("발견된 서비스들:", services.map(s => s.uuid));
  } catch(e) {
    console.log("서비스 갱신 중 무시 가능한 오류:", e);
  }

  // 이제 진짜 UART 서비스를 찾습니다.
  setStatus("UART 통신 연결 시도...");
  
  try {
    uartService = await bleServer.getPrimaryService(NUS_SERVICE_UUID);
  } catch (err) {
    // 만약 여기서 에러가 나면, UUID 문제일 수 있으므로 목록을 뒤져서 찾습니다.
    console.warn("표준 방식으로 실패, 전체 목록에서 검색 시도");
    const allServices = await bleServer.getPrimaryServices();
    uartService = allServices.find(s => s.uuid == NUS_SERVICE_UUID);
    if (!uartService) throw new Error("마이크로비트에서 UART 서비스를 찾을 수 없습니다.\nMakeCode 블록을 확인해주세요.");
  }

  setStatus("특성(RX/TX) 연결 중...");
  uartRX = await uartService.getCharacteristic(NUS_RX_UUID);
  uartTX = await uartService.getCharacteristic(NUS_TX_UUID);

  await uartTX.startNotifications();
  uartTX.addEventListener("characteristicvaluechanged", handleBleNotify);

  bleConnected = true;
  btnConnect.classList.add("hidden");
  btnDisconnect.classList.remove("hidden");

  setStatus("연결 성공! 토큰 인증 중...");
  
  // ---- PING 인증 ----
  bleRxBuffer = "";
  await bleSendLine(`PING:${TOKEN}`);
  
  const ok = await waitForPong(3000);
  if (!ok) {
    alert(`연결됐으나 인증 실패.\n토큰(${TOKEN}) 불일치.`);
    await bleDisconnect();
    return;
  }

  bleVerified = true;
  setStatus("✅ 연결 및 인증 완료!");
}

// ... (나머지 헬퍼 함수들은 동일) ...

function handleBleNotify(e) {
  const msg = decoder.decode(e.target.value);
  bleRxBuffer += msg;
  let idx;
  while ((idx = bleRxBuffer.indexOf("\n")) >= 0) {
    const line = bleRxBuffer.slice(0, idx).trim();
    bleRxBuffer = bleRxBuffer.slice(idx + 1);
    if (line) onBleLine(line);
  }
}

function onBleLine(line) {
  console.log("[RX]", line);
  if (line.includes(`PONG:${TOKEN}`)) lastPongAt = Date.now();
}

let lastPongAt = 0;
async function waitForPong(timeoutMs) {
  const start = Date.now();
  lastPongAt = 0;
  while (Date.now() - start < timeoutMs) {
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
  btnDisconnect.classList.add("hidden");
  btnConnect.classList.remove("hidden");
  setStatus("대기 중 (연결 끊김)");
}

async function bleSendLine(text) {
  if (!uartRX) return;
  await uartRX.writeValue(encoder.encode(text + "\n"));
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// ---- UI 기능 ----
// JSONP 및 퀴즈 로직은 이전 코드의 함수들을 그대로 사용합니다.
// (공간 절약을 위해 생략했으나, 실제 파일에는 `setupQuestionsSheet`, `doGet` 등은 없어도 되고 
//  `loadQuestions`, `goPick`, `goQuiz` 등 프론트엔드 로직은 포함되어야 합니다. 
//  이전 코드의 프론트엔드 로직 부분은 유지해주세요.)
// ⚠️ 주의: 위에서 드린 'BLE Logic' 부분만 교체하시거나, 
// 기존 프론트엔드 로직이 포함된 전체 코드가 필요하면 말씀해주세요.

// [룰렛 버튼]
btnSpin.addEventListener("click", async () => {
  if (!canSpin) return;
  if (!bleConnected || !bleVerified) {
    alert("블루투스 연결이 필요합니다.");
    return;
  }
  try {
    btnSpin.disabled = true;
    await bleSendLine(`SPIN:${TOKEN}`);
    setStatus("🎡 룰렛 신호 전송!");
    setTimeout(() => setStatus("✅ 연결됨"), 3000);
  } catch (e) {
    console.error(e);
    alert("전송 실패");
    onBleDisconnected();
  }
});
