/*************************************************
 *  Quiz Roulette – BLE (Web Bluetooth) Version
 *  micro:bit UART → "SPIN\n"
 *************************************************/

// =====================
// DOM
// =====================
const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const btnSpin = document.getElementById("btnSpin");
const btnRetry = document.getElementById("btnRetry");
const statusText = document.getElementById("statusText");

// =====================
// BLE (Web Bluetooth)
// =====================
let bleDevice = null;
let bleServer = null;
let uartService = null;
let uartRX = null;
let uartTX = null;

const encoder = new TextEncoder();

// Nordic UART Service (micro:bit)
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write
const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // notify

// =====================
// BLE 연결
// =====================
async function bleConnect() {
  if (!navigator.bluetooth) {
    alert("이 브라우저는 Web Bluetooth를 지원하지 않습니다. (Android Chrome 권장)");
    return;
  }

  statusText.textContent = "BLE 장치 선택 중…";

  bleDevice = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "micro:bit" }], // 또는 "ROULETTE-"
    optionalServices: [NUS_SERVICE],
  });

  bleDevice.addEventListener("gattserverdisconnected", onBleDisconnected);

  bleServer = await bleDevice.gatt.connect();
  uartService = await bleServer.getPrimaryService(NUS_SERVICE);

  uartRX = await uartService.getCharacteristic(NUS_RX);
  uartTX = await uartService.getCharacteristic(NUS_TX);

  // (선택) micro:bit 로그 수신
  try {
    await uartTX.startNotifications();
    uartTX.addEventListener("characteristicvaluechanged", (e) => {
      const msg = new TextDecoder().decode(e.target.value);
      console.log("[micro:bit]", msg);
    });
  } catch (e) {
    console.warn("TX notify 실패 (무시 가능)", e);
  }

  statusText.textContent = "✅ BLE 연결됨";
  btnDisconnect.classList.remove("hidden");
}

function onBleDisconnected() {
  statusText.textContent = "❌ BLE 연결 끊김";
  bleDevice = null;
  bleServer = null;
  uartService = null;
  uartRX = null;
  uartTX = null;
  btnDisconnect.classList.add("hidden");
}

async function bleDisconnect() {
  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
  }
  onBleDisconnected();
}

// =====================
// SPIN 전송
// =====================
async function sendSpin() {
  if (!uartRX) {
    alert("BLE 연결이 필요합니다.");
    return;
  }
  await uartRX.writeValue(encoder.encode("SPIN\n"));
}

// =====================
// UI 효과 (오답 흔들기)
// =====================
function shakeRetryButton() {
  btnRetry.classList.add("shake", "bg-red-400", "text-white");
  setTimeout(() => {
    btnRetry.classList.remove("shake", "bg-red-400", "text-white");
  }, 600);
}

// =====================
// 이벤트 연결
// =====================
btnConnect?.addEventListener("click", async () => {
  try {
    await bleConnect();
  } catch (e) {
    console.error(e);
    alert("BLE 연결 실패. 위치/권한/다른 앱 연결 여부 확인");
    statusText.textContent = "연결 실패";
  }
});

btnDisconnect?.addEventListener("click", bleDisconnect);

// 정답 → 룰렛
btnSpin?.addEventListener("click", async () => {
  try {
    await sendSpin();
    statusText.textContent = "🎡 룰렛 회전 중!";
    btnSpin.disabled = true;
  } catch (e) {
    console.error(e);
    alert("전송 실패");
  }
});

// 오답 → 다른 문제 선택 강조
btnRetry?.addEventListener("click", () => {
  shakeRetryButton();
});

// =====================
// CSS (JS에서 주입 – app.js만으로 완결)
// =====================
const style = document.createElement("style");
style.textContent = `
@keyframes shake {
  0% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
  100% { transform: translateX(0); }
}
.shake {
  animation: shake 0.4s ease-in-out;
}
`;
document.head.appendChild(style);
