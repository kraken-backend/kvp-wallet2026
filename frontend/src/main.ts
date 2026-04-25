import "./style.css";

type UserProfile = { email: string; passphrase: string; address: string };
type Lamp = "green" | "yellow" | "red";

const cfg = {
  backendUrl: (import.meta.env.VITE_WALLET_BACKEND_URL as string | undefined) || "http://localhost:8098",
  walletPublicHealth: (import.meta.env.VITE_WALLET_PUBLIC_HEALTH_URL as string | undefined) || "https://cognitive-wave-fewer-purchase.trycloudflare.com/api/health",
};

const USERS_KEY = "wallet_users_2026";
const SESSION_KEY = "wallet_session_2026";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<main class="layout">
  <section class="card">
    <h1 class="title">KVC Wallet</h1>
    <p class="muted">Wallet FE -> Wallet BE (Go) -> KVC</p>
  </section>

  <section class="card">
    <div class="monitor-bar">
      <strong>Wallet BE Monitor</strong>
      <button id="refresh-monitor" class="ghost" type="button">Refresh</button>
    </div>
    <div class="monitor-list">
      <div class="monitor-item">
        <strong>Wallet Public</strong>
        <div class="state"><span id="lamp-public" class="lamp yellow"></span><span id="text-public">Checking...</span></div>
      </div>
      <div class="monitor-item">
        <strong>Wallet Local</strong>
        <div class="state"><span id="lamp-local" class="lamp yellow"></span><span id="text-local">Checking...</span></div>
      </div>
    </div>
  </section>

  <section id="signup-card" class="card">
    <strong>Create Wallet</strong>
    <label>Email <input id="signup-email" placeholder="you@domain.com" /></label>
    <button id="signup-btn" type="button">Generate Passphrase</button>
    <pre id="signup-output"></pre>
    <div class="actions">
      <button id="copy-passphrase" type="button">Copy Passphrase</button>
      <button id="go-login" class="ghost" type="button">Go Login</button>
    </div>
  </section>

  <section id="login-card" class="card hidden">
    <strong>Login</strong>
    <label>Email <input id="login-email" placeholder="you@domain.com" /></label>
    <label>Passphrase <input id="login-passphrase" placeholder="enter passphrase" /></label>
    <button id="login-btn" type="button">Login Wallet</button>
    <pre id="login-output"></pre>
  </section>

  <section id="dashboard-card" class="card hidden">
    <strong>Wallet Dashboard</strong>
    <p id="active-user" class="muted"></p>
    <label>Backend URL <input id="backend-url" /></label>
    <button id="backend-health-btn" type="button">Check Backend Health</button>
    <pre id="health-output"></pre>
    <label>Address <input id="wallet-address" /></label>
    <button id="load-wallet-btn" type="button">Load Wallet</button>
    <pre id="wallet-output"></pre>

    <strong>Transfer</strong>
    <label>From <input id="tx-from" /></label>
    <label>To <input id="tx-to" value="kvp:wallet:destination" /></label>
    <label>Asset <select id="tx-asset"><option value="tKVC">tKVC</option><option value="KVC">KVC</option></select></label>
    <label>Amount <input id="tx-amount" value="10" /></label>
    <button id="transfer-btn" type="button">Submit Transfer</button>
    <pre id="transfer-output"></pre>
    <button id="logout-btn" class="ghost" type="button">Logout</button>
  </section>
</main>`;

function readUsers(): UserProfile[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as UserProfile[]; } catch { return []; }
}

function saveUsers(users: UserProfile[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function activeSessionEmail(): string {
  return (localStorage.getItem(SESSION_KEY) || "").trim().toLowerCase();
}

function setSession(email: string) {
  localStorage.setItem(SESSION_KEY, email);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function setFlow(flow: "signup" | "login" | "dashboard") {
  document.querySelector("#signup-card")!.classList.toggle("hidden", flow !== "signup");
  document.querySelector("#login-card")!.classList.toggle("hidden", flow !== "login");
  document.querySelector("#dashboard-card")!.classList.toggle("hidden", flow !== "dashboard");
}

function randomWalletAddress() {
  return `kvp:wallet:${Math.random().toString(36).slice(2, 10)}`;
}

function randomPassphrase() {
  const words = ["kraken","wallet","protocol","ledger","node","state","mint","stake","chain","secure","nexus","route"];
  return Array.from({ length: 12 }, () => words[Math.floor(Math.random() * words.length)]).join(" ");
}

function backendBase() {
  const raw = (document.querySelector<HTMLInputElement>("#backend-url")!.value || cfg.backendUrl).trim();
  return raw.replace(/\/+$/, "");
}

async function callJson(path: string, options: RequestInit = {}) {
  const response = await fetch(`${backendBase()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const text = await response.text();
  try { return { ok: response.ok, status: response.status, body: JSON.parse(text) }; } catch { return { ok: response.ok, status: response.status, body: text }; }
}

function setLamp(id: "public" | "local", lamp: Lamp, text: string) {
  const lampNode = document.querySelector<HTMLElement>(`#lamp-${id}`)!;
  const textNode = document.querySelector<HTMLElement>(`#text-${id}`)!;
  lampNode.classList.remove("green", "yellow", "red");
  lampNode.classList.add(lamp);
  textNode.textContent = text;
}

async function ping(url: string) {
  const started = performance.now();
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  return { ok: res.ok, status: res.status, ms: Math.round(performance.now() - started) };
}

async function refreshMonitor() {
  try {
    const p = await ping(cfg.walletPublicHealth);
    if (!p.ok) setLamp("public", "red", `DOWN (HTTP ${p.status})`);
    else if (p.ms > 1200) setLamp("public", "yellow", `SLOW (${p.ms} ms)`);
    else setLamp("public", "green", `UP (${p.ms} ms)`);
  } catch (error) {
    setLamp("public", "red", `DOWN (${String(error).slice(0, 40)})`);
  }

  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    setLamp("local", "yellow", "N/A on hosted site");
    return;
  }
  try {
    const localHealthUrl = `${backendBase()}/api/health`;
    const l = await ping(localHealthUrl);
    if (!l.ok) setLamp("local", "red", `DOWN (HTTP ${l.status})`);
    else if (l.ms > 1200) setLamp("local", "yellow", `SLOW (${l.ms} ms)`);
    else setLamp("local", "green", `UP (${l.ms} ms)`);
  } catch (error) {
    setLamp("local", "red", `DOWN (${String(error).slice(0, 40)})`);
  }
}

document.querySelector<HTMLButtonElement>("#refresh-monitor")!.addEventListener("click", () => void refreshMonitor());

document.querySelector<HTMLButtonElement>("#signup-btn")!.addEventListener("click", () => {
  const email = (document.querySelector<HTMLInputElement>("#signup-email")!.value || "").trim().toLowerCase();
  const out = document.querySelector<HTMLElement>("#signup-output")!;
  if (!email.includes("@")) { out.textContent = "Please enter valid email."; return; }
  const users = readUsers();
  if (users.some((u) => u.email === email)) { out.textContent = "Email already exists. Please login."; return; }
  const passphrase = randomPassphrase();
  const address = randomWalletAddress();
  users.push({ email, passphrase, address });
  saveUsers(users);
  out.textContent = `Email: ${email}\nAddress: ${address}\nPassphrase: ${passphrase}`;
  document.querySelector<HTMLInputElement>("#login-email")!.value = email;
});

document.querySelector<HTMLButtonElement>("#copy-passphrase")!.addEventListener("click", async () => {
  const text = document.querySelector<HTMLElement>("#signup-output")!.textContent || "";
  const marker = "Passphrase:";
  const i = text.indexOf(marker);
  if (i < 0) return;
  const pass = text.slice(i + marker.length).trim();
  if (!pass) return;
  await navigator.clipboard.writeText(pass);
});

document.querySelector<HTMLButtonElement>("#go-login")!.addEventListener("click", () => setFlow("login"));

document.querySelector<HTMLButtonElement>("#login-btn")!.addEventListener("click", () => {
  const email = (document.querySelector<HTMLInputElement>("#login-email")!.value || "").trim().toLowerCase();
  const pass = (document.querySelector<HTMLInputElement>("#login-passphrase")!.value || "").trim();
  const out = document.querySelector<HTMLElement>("#login-output")!;
  const user = readUsers().find((u) => u.email === email && u.passphrase === pass);
  if (!user) { out.textContent = "Invalid email/passphrase."; return; }
  setSession(email);
  document.querySelector<HTMLElement>("#active-user")!.textContent = `Logged in as: ${email}`;
  document.querySelector<HTMLInputElement>("#wallet-address")!.value = user.address;
  document.querySelector<HTMLInputElement>("#tx-from")!.value = user.address;
  setFlow("dashboard");
});

document.querySelector<HTMLButtonElement>("#logout-btn")!.addEventListener("click", () => {
  clearSession();
  setFlow("login");
});

document.querySelector<HTMLButtonElement>("#backend-health-btn")!.addEventListener("click", async () => {
  const out = document.querySelector<HTMLElement>("#health-output")!;
  out.textContent = "Loading...";
  try { out.textContent = JSON.stringify(await callJson("/api/health"), null, 2); } catch (error) { out.textContent = String(error); }
});

document.querySelector<HTMLButtonElement>("#load-wallet-btn")!.addEventListener("click", async () => {
  const address = (document.querySelector<HTMLInputElement>("#wallet-address")!.value || "").trim();
  const out = document.querySelector<HTMLElement>("#wallet-output")!;
  if (!address.startsWith("kvp:")) { out.textContent = "Address must use kvp: prefix."; return; }
  out.textContent = "Loading...";
  try { out.textContent = JSON.stringify(await callJson(`/api/kvc/wallet/${encodeURIComponent(address)}`), null, 2); } catch (error) { out.textContent = String(error); }
});

document.querySelector<HTMLButtonElement>("#transfer-btn")!.addEventListener("click", async () => {
  const payload = {
    from: (document.querySelector<HTMLInputElement>("#tx-from")!.value || "").trim(),
    to: (document.querySelector<HTMLInputElement>("#tx-to")!.value || "").trim(),
    asset: document.querySelector<HTMLSelectElement>("#tx-asset")!.value,
    amount: (document.querySelector<HTMLInputElement>("#tx-amount")!.value || "").trim(),
  };
  const out = document.querySelector<HTMLElement>("#transfer-output")!;
  out.textContent = "Submitting...";
  try {
    out.textContent = JSON.stringify(await callJson("/api/kvc/transfer", { method: "POST", body: JSON.stringify(payload) }), null, 2);
  } catch (error) {
    out.textContent = String(error);
  }
});

document.querySelector<HTMLInputElement>("#backend-url")!.value = cfg.backendUrl;

(function bootstrap() {
  const email = activeSessionEmail();
  const user = readUsers().find((u) => u.email === email);
  if (!user) setFlow("signup");
  else {
    document.querySelector<HTMLElement>("#active-user")!.textContent = `Logged in as: ${user.email}`;
    document.querySelector<HTMLInputElement>("#wallet-address")!.value = user.address;
    document.querySelector<HTMLInputElement>("#tx-from")!.value = user.address;
    setFlow("dashboard");
  }
  void refreshMonitor();
  setInterval(() => { void refreshMonitor(); }, 15000);
})();
