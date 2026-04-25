const backendInput = document.getElementById("backend-url");
const healthOutput = document.getElementById("health-output");
const walletOutput = document.getElementById("wallet-output");
const transferOutput = document.getElementById("transfer-output");
const signupOutput = document.getElementById("signup-output");
const loginOutput = document.getElementById("login-output");
const monitorToggleBtn = document.getElementById("btn-monitor-toggle");
const cfg = window.__WALLET_CONFIG__ || {};

const signupScreen = document.getElementById("signup-screen");
const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const activeUser = document.getElementById("active-user");

const USERS_KEY = "kvp_wallet_users_v1";
const SESSION_KEY = "kvp_wallet_session_v1";
const MONITOR_AUTO_MS = 15000;
let monitorAutoOn = true;
let monitorTimer = null;

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function setSession(email) {
  localStorage.setItem(SESSION_KEY, email);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function getSessionEmail() {
  return (localStorage.getItem(SESSION_KEY) || "").trim().toLowerCase();
}

function setFlow(flow) {
  signupScreen.classList.toggle("hidden", flow !== "signup");
  loginScreen.classList.toggle("hidden", flow !== "login");
  dashboardScreen.classList.toggle("hidden", flow !== "dashboard");
}

function createWalletAddress() {
  return `kvp:wallet:${Math.random().toString(36).slice(2, 10)}`;
}

function generatePassphrase() {
  const words = ["kraken", "velocity", "protocol", "wallet", "node", "ledger", "stake", "mint", "route", "secure", "nexus", "state"];
  return Array.from({ length: 12 }, () => words[Math.floor(Math.random() * words.length)]).join(" ");
}

const monitors = [
  {
    id: "wallet-public",
    url: `${(cfg.WALLET_PUBLIC_TUNNEL_URL || "https://cognitive-wave-fewer-purchase.trycloudflare.com").replace(/\/+$/, "")}/api/health`,
  },
  {
    id: "wallet-local",
    url: `${(cfg.WALLET_BACKEND_URL || "http://localhost:8098").replace(/\/+$/, "")}/api/health`,
  },
];

function setLamp(id, colorClass, text) {
  const lamp = document.getElementById(`lamp-${id}`);
  const textNode = document.getElementById(`text-${id}`);
  lamp.classList.remove("lamp-green", "lamp-yellow", "lamp-red");
  lamp.classList.add(colorClass);
  textNode.textContent = text;
}

async function pingMonitor(target) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(target.url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const ms = Math.round(performance.now() - started);
    if (!response.ok) {
      setLamp(target.id, "lamp-red", `DOWN (HTTP ${response.status})`);
      return;
    }
    if (ms > 1200) {
      setLamp(target.id, "lamp-yellow", `SLOW (${ms} ms)`);
      return;
    }
    setLamp(target.id, "lamp-green", `UP (${ms} ms)`);
  } catch (error) {
    clearTimeout(timeout);
    setLamp(target.id, "lamp-red", `DOWN (${String(error).slice(0, 60)})`);
  }
}

async function runMonitor() {
  await Promise.all(monitors.map((m) => pingMonitor(m)));
}

function setupMonitorAutoRefresh() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
  if (!monitorAutoOn) return;
  monitorTimer = setInterval(runMonitor, MONITOR_AUTO_MS);
}

function backendBase() {
  return (backendInput.value || cfg.WALLET_BACKEND_URL || "http://localhost:8098").trim().replace(/\/+$/, "");
}

async function callJson(path, options = {}) {
  const response = await fetch(`${backendBase()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, body: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, body: { raw: text } };
  }
}

document.getElementById("btn-health").addEventListener("click", async () => {
  healthOutput.textContent = "Loading...";
  try {
    const result = await callJson("/api/health");
    healthOutput.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    healthOutput.textContent = String(error);
  }
});

document.getElementById("btn-monitor-now").addEventListener("click", runMonitor);
monitorToggleBtn.addEventListener("click", () => {
  monitorAutoOn = !monitorAutoOn;
  monitorToggleBtn.textContent = monitorAutoOn ? "Auto Refresh: ON" : "Auto Refresh: OFF";
  setupMonitorAutoRefresh();
});

document.getElementById("btn-signup").addEventListener("click", () => {
  const emailInput = document.getElementById("signup-email");
  const email = (emailInput.value || "").trim().toLowerCase();
  if (!email.includes("@")) {
    signupOutput.textContent = "Please enter a valid email.";
    return;
  }

  const users = readUsers();
  if (users.some((u) => u.email === email)) {
    signupOutput.textContent = "Email already registered. Please login.";
    return;
  }

  const passphrase = generatePassphrase();
  const address = createWalletAddress();
  users.push({ email, passphrase, address });
  saveUsers(users);
  signupOutput.textContent = `Email: ${email}\nAddress: ${address}\nPassphrase: ${passphrase}`;
  document.getElementById("login-email").value = email;
});

document.getElementById("btn-copy-passphrase").addEventListener("click", async () => {
  const text = signupOutput.textContent || "";
  const marker = "Passphrase:";
  const index = text.indexOf(marker);
  if (index === -1) return;
  const passphrase = text.slice(index + marker.length).trim();
  if (!passphrase) return;
  await navigator.clipboard.writeText(passphrase);
});

document.getElementById("btn-go-login").addEventListener("click", () => {
  setFlow("login");
});

document.getElementById("btn-login").addEventListener("click", () => {
  const email = (document.getElementById("login-email").value || "").trim().toLowerCase();
  const passphrase = (document.getElementById("login-passphrase").value || "").trim();
  const users = readUsers();
  const user = users.find((u) => u.email === email && u.passphrase === passphrase);
  if (!user) {
    loginOutput.textContent = "Invalid email or passphrase.";
    return;
  }
  setSession(user.email);
  activeUser.textContent = `Logged in as: ${user.email}`;
  document.getElementById("wallet-address").value = user.address;
  document.getElementById("tx-from").value = user.address;
  loginOutput.textContent = "Login success.";
  setFlow("dashboard");
});

document.getElementById("btn-logout").addEventListener("click", () => {
  clearSession();
  activeUser.textContent = "";
  setFlow("login");
});

document.getElementById("btn-load-wallet").addEventListener("click", async () => {
  const address = (document.getElementById("wallet-address").value || "").trim();
  walletOutput.textContent = "Loading...";
  try {
    const result = await callJson(`/api/kvc/wallet/${encodeURIComponent(address)}`);
    walletOutput.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    walletOutput.textContent = String(error);
  }
});

document.getElementById("btn-transfer").addEventListener("click", async () => {
  const payload = {
    from: (document.getElementById("tx-from").value || "").trim(),
    to: (document.getElementById("tx-to").value || "").trim(),
    asset: document.getElementById("tx-asset").value,
    amount: (document.getElementById("tx-amount").value || "").trim(),
  };
  transferOutput.textContent = "Submitting...";
  try {
    const result = await callJson("/api/kvc/transfer", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    transferOutput.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    transferOutput.textContent = String(error);
  }
});

(function bootstrapFlow() {
  backendInput.value = cfg.WALLET_BACKEND_URL || backendInput.value || "http://localhost:8098";
  runMonitor();
  setupMonitorAutoRefresh();
  const email = getSessionEmail();
  const users = readUsers();
  const user = users.find((u) => u.email === email);
  if (!user) {
    setFlow("signup");
    return;
  }
  activeUser.textContent = `Logged in as: ${user.email}`;
  document.getElementById("wallet-address").value = user.address;
  document.getElementById("tx-from").value = user.address;
  setFlow("dashboard");
})();
