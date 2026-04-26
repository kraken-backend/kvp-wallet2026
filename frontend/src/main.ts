import "./style.css";

type WalletPage =
  | "dashboard"
  | "onchain"
  | "staking"
  | "minting"
  | "crosschain"
  | "bridge"
  | "statistics"
  | "history"
  | "notifications"
  | "profile";

type Profile = { email: string; passkey: string; address: string };
type TxKind = "onchain-send";
type TxItem = {
  txHash: string;
  kind: TxKind;
  status: "pending" | "success";
  amount: string;
  asset: string;
  createdAt: string;
  note: string;
};
type WalletResponse = {
  address: string;
  nonce: number;
  balances: Array<{ asset: string; amount: string }>;
};
type TransferResponse = {
  txHash?: string;
  status?: string;
  message?: string;
};
type AssetCatalogItem = {
  symbol: string;
  isNative: boolean;
  transferable: boolean;
};
type AssetCatalogResponse = {
  network: string;
  items: AssetCatalogItem[];
};
type AuthResponse = {
  status: string;
  userId: string;
  sessionId: string;
  accounts: Array<{ address: string; label: string }>;
  activeAddress: string;
};
type AuthMeResponse = {
  status: string;
  userId: string;
  email: string;
  sessionId: string;
  accounts: Array<{ address: string; label: string }>;
  activeAddress: string;
};
type AddAccountResponse = {
  status: string;
  address: string;
  label: string;
};
type BurnResponse = {
  status: string;
  asset: string;
  amount: string;
  from: string;
  txHash: string;
  note: string;
};
type MintResponse = {
  status: string;
  asset: string;
  amount: string;
  to: string;
  txHash: string;
  note: string;
};
type ActivityItem = {
  txHash: string;
  txType: string;
  from: string;
  to: string;
  asset: string;
  amount: string;
  timestampUnix: number;
  status: string;
};
type ActivityResponse = {
  sessionId: string;
  activityCount: number;
  items: ActivityItem[];
};
type SessionStatusResponse = {
  sessionId: string;
  userId: string;
  status: "active" | "expired";
  expiresAt: string;
};

const SESSION_KEY = "kvp_wallet_simple_session";
const TX_KEY = "kvp_wallet_simple_txs";
const MAIN_EXPLORER_URL = (import.meta.env.VITE_MAIN_EXPLORER_URL as string | undefined)?.trim() || "https://krakenum.vercel.app/";
const EXPLORER_BASE = MAIN_EXPLORER_URL;
const BACKEND_BASE_RAW = (import.meta.env.VITE_WALLET_BACKEND_URL as string | undefined) || "";

function normalizeBackendBase(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return "";
  // Allow common misconfiguration where health endpoint is used as base URL.
  if (value.endsWith("/api/health")) return value.slice(0, -"/api/health".length);
  if (value.endsWith("/health")) return value.slice(0, -"/health".length);
  // Allow base values ending with /api (we append /api/... in request paths).
  if (value.endsWith("/api")) return value.slice(0, -"/api".length);
  return value;
}

const BACKEND_BASE = normalizeBackendBase(BACKEND_BASE_RAW);

function buildBackendUrl(path: string): string {
  if (!BACKEND_BASE) throw new Error("VITE_WALLET_BACKEND_URL is not configured");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_BASE}${normalizedPath}`;
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<main id="landing-screen" class="landing">
  <img class="phones" src="/assets/landing-phones.png" alt="Wallet preview" />
  <div class="overlay"></div>
  <section class="content">
    <img class="logo" src="/assets/kvp-logo.png" alt="KVP Logo" />
    <p class="label">KRAKENUM</p>
    <h1>Krakenum Wallet</h1>
    <div class="hero-actions">
      <button id="open-create" class="btn btn-primary" type="button">Create Wallet</button>
      <button id="open-login" class="btn btn-secondary" type="button">Sign In</button>
      <a href="${MAIN_EXPLORER_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" type="button">Back to KVP Explorer</a>
    </div>
  </section>
</main>

<section id="auth-panel" class="auth-shell hidden">
  <div class="auth-card">
    <button id="back-landing" class="back-btn" type="button">←</button>
    <h2 id="auth-title">Create Wallet</h2>
    <p class="auth-subtitle">Krakenum account access</p>

    <div id="create-view">
      <label>Email
        <input id="create-email" type="email" />
      </label>
      <button id="generate-passkey" class="btn btn-primary auth-btn" type="button">Generate Passkey</button>
      <pre id="create-output"></pre>
      <button id="copy-passkey" class="btn btn-secondary auth-btn" type="button">Copy Passkey</button>
      <button id="switch-login" class="link-btn" type="button">I already have an account</button>
    </div>

    <div id="login-view" class="hidden">
      <label>Email
        <input id="login-email" type="email" />
      </label>
      <label>Passkey
        <input id="login-passkey" type="text" />
      </label>
      <button id="login-btn" class="btn btn-primary auth-btn" type="button">Login</button>
      <p id="login-output" class="auth-message"></p>
      <button id="switch-create" class="link-btn" type="button">I don't have an account</button>
    </div>
  </div>
</section>

<section id="wallet-main" class="wallet-main hidden">
  <div class="wallet-main-shell">
    <div class="wallet-main-head">
      <div>
        <p class="wallet-main-kicker">KRAKENUM WALLET</p>
        <h2 id="wallet-main-title">Dashboard</h2>
      </div>
      <div class="wallet-main-actions">
        <a href="${MAIN_EXPLORER_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary wallet-explorer-link">KVP Explorer</a>
        <button id="wallet-logout" class="btn btn-secondary wallet-logout-btn" type="button">Logout</button>
      </div>
    </div>

    <div id="wallet-dashboard-page" class="wallet-page">
      <article class="wallet-summary">
        <p class="wallet-summary-label">Available Balance</p>
        <strong id="wallet-balance-main">0.00 tKVC</strong>
        <small id="wallet-main-email">-</small>
      </article>
      <div class="quick-actions">
        <button data-open-page="onchain" class="quick-btn" type="button">Onchain Send/Receive</button>
        <button data-open-page="staking" class="quick-btn" type="button">Staking</button>
        <button data-open-page="minting" class="quick-btn" type="button">Minting</button>
      </div>
      <div class="feature-grid">
        <button data-open-page="crosschain" class="feature-card" type="button">
          <strong>Transaction Crosschain</strong><span>Menunggu endpoint backend</span>
        </button>
        <button data-open-page="bridge" class="feature-card" type="button">
          <strong>Transaction Bridge</strong><span>Menunggu endpoint backend</span>
        </button>
        <button data-open-page="statistics" class="feature-card" type="button">
          <strong>Statistic Transaction</strong><span>Volume, count, status summary</span>
        </button>
        <button data-open-page="history" class="feature-card" type="button">
          <strong>History & Receipt</strong><span>TxHash linked to Explorer</span>
        </button>
      </div>
    </div>

    <div id="wallet-onchain-page" class="wallet-page hidden">
      <div class="panel-grid">
        <article class="panel-card">
          <h3>Send (Onchain)</h3>
          <label>To Address <input id="onchain-send-to" /></label>
          <label>Asset
            <select id="onchain-asset-select"></select>
          </label>
          <label>Amount <input id="onchain-send-amount" /></label>
          <button id="btn-onchain-send" class="btn btn-primary auth-btn" type="button">Submit Send</button>
        </article>
        <article class="panel-card">
          <h3>Receive (Onchain)</h3>
          <label>Your Address <input id="wallet-main-address" readonly /></label>
          <button id="copy-address" class="btn btn-secondary auth-btn" type="button">Copy Address</button>
        </article>
      </div>
      <p id="onchain-note" class="auth-message"></p>
    </div>

    <div id="wallet-staking-page" class="wallet-page hidden">
      <article class="panel-card">
        <h3>Staking</h3>
        <label>Asset
          <select id="stake-asset-select"></select>
        </label>
        <label>Amount <input id="stake-amount" /></label>
        <button id="btn-stake" class="btn btn-primary auth-btn" type="button">Submit Staking</button>
      </article>
      <p id="staking-note" class="auth-message"></p>
    </div>

    <div id="wallet-minting-page" class="wallet-page hidden">
      <article class="panel-card">
        <h3>Minting</h3>
        <label>Token / Coin
          <select id="mint-asset-select"></select>
        </label>
        <label>Amount <input id="mint-amount" /></label>
        <button id="btn-mint" class="btn btn-primary auth-btn" type="button">Submit Minting</button>
      </article>
      <article class="panel-card">
        <h3>Burning</h3>
        <label>Token / Coin
          <select id="burn-asset-select"></select>
        </label>
        <label>Amount <input id="burn-amount" /></label>
        <button id="btn-burn" class="btn btn-primary auth-btn" type="button">Submit Burning</button>
      </article>
      <p id="minting-note" class="auth-message"></p>
      <p id="burning-note" class="auth-message"></p>
    </div>

    <div id="wallet-crosschain-page" class="wallet-page hidden">
      <article class="panel-card coming-card">
        <h3>Transaction Crosschain</h3>
        <p>Fitur ini belum bisa dijalankan karena endpoint backend belum tersedia.</p>
      </article>
    </div>

    <div id="wallet-bridge-page" class="wallet-page hidden">
      <article class="panel-card coming-card">
        <h3>Transaction Bridge</h3>
        <p>Fitur ini belum bisa dijalankan karena endpoint backend belum tersedia.</p>
      </article>
    </div>

    <div id="wallet-statistics-page" class="wallet-page hidden">
      <div class="stats-mini-grid">
        <article class="mini-stat"><span>Total Tx</span><strong id="stat-total-tx">0</strong></article>
        <article class="mini-stat"><span>Success Tx</span><strong id="stat-success-tx">0</strong></article>
        <article class="mini-stat"><span>Pending Tx</span><strong id="stat-pending-tx">0</strong></article>
        <article class="mini-stat"><span>Total Volume</span><strong id="stat-total-volume">0 tKVC</strong></article>
      </div>
    </div>

    <div id="wallet-history-page" class="wallet-page hidden">
      <article class="panel-card">
        <h3>History</h3>
        <div id="history-list" class="history-list"></div>
      </article>
      <article class="panel-card">
        <h3>Receipt</h3>
        <div id="receipt-view" class="receipt-view">Select transaction history first.</div>
      </article>
    </div>

    <div id="wallet-notifications-page" class="wallet-page hidden">
      <article class="panel-card">
        <h3>Notifications</h3>
        <div id="notifications-list"></div>
      </article>
    </div>

    <div id="wallet-profile-page" class="wallet-page hidden">
      <article class="panel-card">
        <h3>Profile</h3>
        <label>Email <input id="profile-email" readonly /></label>
        <label>Wallet Address <input id="profile-address" readonly /></label>
        <label>New Account Label <input id="profile-account-label" placeholder="Account 2" /></label>
        <button id="profile-add-account-btn" class="btn btn-primary auth-btn" type="button">Add Account</button>
        <p id="profile-add-account-note" class="auth-message"></p>
      </article>
    </div>

    <nav class="wallet-bottom-nav">
      <button data-open-page="dashboard" class="wallet-nav-btn active" type="button">Dashboard</button>
      <button data-open-page="history" class="wallet-nav-btn" type="button">History</button>
      <button data-open-page="notifications" class="wallet-nav-btn" type="button">Notification</button>
      <button data-open-page="profile" class="wallet-nav-btn" type="button">Profile</button>
    </nav>
    <p id="wallet-main-note" class="auth-message"></p>
  </div>
</section>
`;

const landingScreen = document.querySelector<HTMLElement>("#landing-screen")!;
const authPanel = document.querySelector<HTMLElement>("#auth-panel")!;
const walletMain = document.querySelector<HTMLElement>("#wallet-main")!;
const createView = document.querySelector<HTMLElement>("#create-view")!;
const loginView = document.querySelector<HTMLElement>("#login-view")!;
const authTitle = document.querySelector<HTMLElement>("#auth-title")!;
const walletMainTitle = document.querySelector<HTMLElement>("#wallet-main-title")!;
const allWalletPages = Array.from(document.querySelectorAll<HTMLElement>(".wallet-page"));
const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".wallet-nav-btn"));
const quickPageButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-open-page]")
);
let selectedTxHash = "";
let assetCatalog: AssetCatalogItem[] = [];
let sessionMonitorTimer: number | null = null;
const notifications: string[] = [];

function txs(): TxItem[] {
  try {
    return JSON.parse(localStorage.getItem(TX_KEY) || "[]") as TxItem[];
  } catch {
    return [];
  }
}

function saveTxs(next: TxItem[]) {
  localStorage.setItem(TX_KEY, JSON.stringify(next));
}

function setSession(data: AuthResponse & { email: string; passkey: string }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function isSessionErrorMessage(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes("invalid session") || text.includes("session expired") || text.includes("http 401");
}

function pushNotification(message: string) {
  const stamped = `[${new Date().toLocaleString()}] ${message}`;
  notifications.unshift(stamped);
  if (notifications.length > 20) notifications.length = 20;
  renderNotifications();
}

function renderNotifications() {
  const host = document.querySelector<HTMLElement>("#notifications-list");
  if (!host) return;
  if (notifications.length === 0) {
    host.innerHTML = `<p class="muted-line">No notification yet.</p>`;
    return;
  }
  host.innerHTML = `<ul class="notice-list">${notifications
    .map((item) => `<li>${item}</li>`)
    .join("")}</ul>`;
}

function clearSessionMonitor() {
  if (sessionMonitorTimer !== null) {
    window.clearInterval(sessionMonitorTimer);
    sessionMonitorTimer = null;
  }
}

async function syncSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
  return getJson<SessionStatusResponse>(`/api/auth/session/${encodeURIComponent(sessionId)}`);
}

function formatExpiryText(raw: string): string {
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleString();
}

function redirectToLoginForSession(session: { email: string; passkey: string }, message: string) {
  clearSessionMonitor();
  clearSession();
  showLogin();
  document.querySelector<HTMLInputElement>("#login-email")!.value = session.email || "";
  document.querySelector<HTMLInputElement>("#login-passkey")!.value = session.passkey || "";
  document.querySelector<HTMLElement>("#login-output")!.textContent = message;
  pushNotification(message);
}

function sessionData(): (AuthResponse & { email: string; passkey: string }) | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthResponse & { email: string; passkey: string };
  } catch {
    return null;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(buildBackendUrl(path));
  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      detail = payload.error || payload.message || "";
    } catch {
      try {
        detail = (await response.text()).trim();
      } catch {
        detail = "";
      }
    }
    throw new Error(detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(buildBackendUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.error || body.message || "";
    } catch {
      try {
        detail = (await response.text()).trim();
      } catch {
        detail = "";
      }
    }
    throw new Error(detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function generatePasskey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let token = "kvp-";
  for (let i = 0; i < 24; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
    if ((i + 1) % 6 === 0 && i < 23) token += "-";
  }
  return token;
}

function showLanding() {
  landingScreen.classList.remove("hidden");
  authPanel.classList.add("hidden");
  walletMain.classList.add("hidden");
}

function showCreate() {
  landingScreen.classList.add("hidden");
  authPanel.classList.remove("hidden");
  walletMain.classList.add("hidden");
  createView.classList.remove("hidden");
  loginView.classList.add("hidden");
  authTitle.textContent = "Create Wallet";
}

function showLogin() {
  landingScreen.classList.add("hidden");
  authPanel.classList.remove("hidden");
  walletMain.classList.add("hidden");
  createView.classList.add("hidden");
  loginView.classList.remove("hidden");
  authTitle.textContent = "Log In";
}

function showWalletMain(profile: Profile) {
  landingScreen.classList.add("hidden");
  authPanel.classList.add("hidden");
  walletMain.classList.remove("hidden");
  document.querySelector<HTMLElement>("#wallet-main-email")!.textContent = profile.email;
  document.querySelector<HTMLInputElement>("#wallet-main-address")!.value = profile.address;
  document.querySelector<HTMLInputElement>("#profile-email")!.value = profile.email;
  document.querySelector<HTMLInputElement>("#profile-address")!.value = profile.address;
  document.querySelector<HTMLElement>("#wallet-main-note")!.textContent = "";
  openWalletPage("dashboard");
  renderStatistics();
  renderHistory();
  renderNotifications();
}

function titleFromPage(page: WalletPage) {
  switch (page) {
    case "dashboard":
      return "Dashboard";
    case "onchain":
      return "Transaction Onchain";
    case "staking":
      return "Staking";
    case "minting":
      return "Minting";
    case "crosschain":
      return "Transaction Crosschain";
    case "bridge":
      return "Transaction Bridge";
    case "statistics":
      return "Statistic Transaction";
    case "history":
      return "History & Receipt";
    case "notifications":
      return "Notifications";
    case "profile":
      return "Profile";
    default:
      return "Dashboard";
  }
}

function openWalletPage(page: WalletPage) {
  walletMainTitle.textContent = titleFromPage(page);
  for (const el of allWalletPages) {
    el.classList.add("hidden");
  }
  document.querySelector<HTMLElement>(`#wallet-${page}-page`)!.classList.remove("hidden");
  for (const btn of navButtons) {
    btn.classList.toggle("active", btn.dataset.openPage === page);
  }
}

function generateTxHash() {
  const alphabet = "abcdef0123456789";
  let hash = "0x";
  for (let i = 0; i < 64; i += 1) {
    hash += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return hash;
}

function explorerTxUrl(hash: string) {
  return `${EXPLORER_BASE}/?tx=${encodeURIComponent(hash)}`;
}

function addTx(kind: TxKind, amount: string, asset: string, note: string) {
  const record: TxItem = {
    txHash: generateTxHash(),
    kind,
    status: "success",
    amount,
    asset,
    createdAt: new Date().toISOString(),
    note,
  };
  const next = [record, ...txs()];
  saveTxs(next);
  selectedTxHash = record.txHash;
  renderHistory();
  renderStatistics();
  return record;
}

function mapActivityToTx(items: ActivityItem[]): TxItem[] {
  return items.map((item) => ({
    txHash: item.txHash,
    kind: "onchain-send",
    status: item.status === "success" ? "success" : "pending",
    amount: item.amount,
    asset: item.asset,
    createdAt: new Date((item.timestampUnix || 0) * 1000).toISOString(),
    note: `${item.txType}: ${item.from} -> ${item.to}`,
  }));
}

async function syncActivityFromBackend(sessionId: string) {
  const payload = await getJson<ActivityResponse>(`/api/activity/session/${encodeURIComponent(sessionId)}`);
  saveTxs(mapActivityToTx(payload.items || []));
  renderHistory();
  renderStatistics();
}

function renderHistory() {
  const list = document.querySelector<HTMLElement>("#history-list")!;
  const records = txs();
  if (records.length === 0) {
    list.innerHTML = `<p class="muted-line">No transaction yet.</p>`;
    document.querySelector<HTMLElement>("#receipt-view")!.textContent =
      "No receipt yet.";
    return;
  }

  list.innerHTML = records
    .map(
      (item) => `
      <button class="history-item ${selectedTxHash === item.txHash ? "active" : ""}" data-tx-hash="${item.txHash}" type="button">
        <strong>${item.kind}</strong>
        <span>${item.amount} ${item.asset}</span>
        <small>${new Date(item.createdAt).toLocaleString()}</small>
      </button>`
    )
    .join("");

  const selected = records.find((item) => item.txHash === selectedTxHash) || records[0];
  selectedTxHash = selected.txHash;
  document.querySelector<HTMLElement>("#receipt-view")!.innerHTML = `
    <p><strong>Type:</strong> ${selected.kind}</p>
    <p><strong>Status:</strong> ${selected.status}</p>
    <p><strong>Amount:</strong> ${selected.amount} ${selected.asset}</p>
    <p><strong>Note:</strong> ${selected.note}</p>
    <p><strong>TxHash:</strong> <a href="${explorerTxUrl(selected.txHash)}" target="_blank" rel="noreferrer">${selected.txHash}</a></p>
  `;

  for (const button of Array.from(list.querySelectorAll<HTMLButtonElement>(".history-item"))) {
    button.addEventListener("click", () => {
      selectedTxHash = button.dataset.txHash || "";
      renderHistory();
    });
  }
}

function renderStatistics() {
  const records = txs();
  const total = records.length;
  const success = records.filter((item) => item.status === "success").length;
  const pending = records.filter((item) => item.status === "pending").length;
  const totalVolume = records.reduce((acc, item) => {
    const n = Number(item.amount);
    if (Number.isFinite(n)) return acc + n;
    return acc;
  }, 0);
  document.querySelector<HTMLElement>("#stat-total-tx")!.textContent = String(total);
  document.querySelector<HTMLElement>("#stat-success-tx")!.textContent = String(success);
  document.querySelector<HTMLElement>("#stat-pending-tx")!.textContent = String(pending);
  document.querySelector<HTMLElement>("#stat-total-volume")!.textContent = `${totalVolume.toFixed(
    2
  )} tKVC`;
}

async function refreshWalletState(address: string) {
  const noteEl = document.querySelector<HTMLElement>("#wallet-main-note")!;
  const onchainNote = document.querySelector<HTMLElement>("#onchain-note")!;
  await loadAssetCatalog();

  try {
    const wallet = await getJson<WalletResponse>(`/api/kvc/wallet/${encodeURIComponent(address)}`);
    const primaryBalance = wallet.balances.find((item) => item.asset === "tKVC") || wallet.balances[0];
    document.querySelector<HTMLElement>("#wallet-balance-main")!.textContent = primaryBalance
      ? `${primaryBalance.amount} ${primaryBalance.asset}`
      : "0";
    noteEl.textContent = "";
    onchainNote.textContent = "";
  } catch (error) {
    const msg = (error as Error).message;
    document.querySelector<HTMLElement>("#wallet-balance-main")!.textContent = "N/A";
    noteEl.textContent = `Gagal load wallet dari backend: ${msg}`;
  }
}

function renderAssetSelect(selectId: string, preferredSymbol = "tKVC") {
  const select = document.querySelector<HTMLSelectElement>(`#${selectId}`);
  if (!select) return;
  if (!assetCatalog.length) {
    select.innerHTML = "";
    return;
  }
  select.innerHTML = assetCatalog
    .map((item) => `<option value="${item.symbol}">${item.symbol}${item.transferable ? "" : " (locked)"}</option>`)
    .join("");
  const preferred =
    assetCatalog.find((item) => item.symbol === preferredSymbol && item.transferable) ||
    assetCatalog.find((item) => item.transferable) ||
    assetCatalog[0];
  select.value = preferred.symbol;
}

async function loadAssetCatalog() {
  const noteEl = document.querySelector<HTMLElement>("#wallet-main-note")!;
  try {
    const payload = await getJson<AssetCatalogResponse>("/api/kvc/assets");
    assetCatalog = payload.items || [];
    renderAssetSelect("onchain-asset-select");
    renderAssetSelect("stake-asset-select");
    renderAssetSelect("mint-asset-select");
    renderAssetSelect("burn-asset-select");
  } catch (error) {
    assetCatalog = [];
    renderAssetSelect("onchain-asset-select");
    renderAssetSelect("stake-asset-select");
    renderAssetSelect("mint-asset-select");
    renderAssetSelect("burn-asset-select");
    noteEl.textContent = `Gagal load asset catalog dari backend: ${(error as Error).message}`;
  }
}

document.querySelector<HTMLButtonElement>("#open-create")!.addEventListener("click", showCreate);
document.querySelector<HTMLButtonElement>("#open-login")!.addEventListener("click", showLogin);
document.querySelector<HTMLButtonElement>("#back-landing")!.addEventListener("click", showLanding);
document.querySelector<HTMLButtonElement>("#switch-login")!.addEventListener("click", showLogin);
document.querySelector<HTMLButtonElement>("#switch-create")!.addEventListener("click", showCreate);

document.querySelector<HTMLButtonElement>("#generate-passkey")!.addEventListener("click", () => {
  const email = (document.querySelector<HTMLInputElement>("#create-email")!.value || "").trim().toLowerCase();
  const output = document.querySelector<HTMLElement>("#create-output")!;
  if (!email || !email.includes("@")) {
    output.textContent = "Please enter a valid email.";
    return;
  }
  const passkey = generatePasskey();
  output.textContent = `Email: ${email}\nPasskey: ${passkey}`;
  document.querySelector<HTMLInputElement>("#login-email")!.value = email;
  document.querySelector<HTMLInputElement>("#login-passkey")!.value = passkey;
});

document.querySelector<HTMLButtonElement>("#copy-passkey")!.addEventListener("click", async () => {
  const content = document.querySelector<HTMLElement>("#create-output")!.textContent || "";
  const marker = "Passkey:";
  const at = content.indexOf(marker);
  if (at < 0) return;
  const passkey = content.slice(at + marker.length).trim();
  if (!passkey) return;
  await navigator.clipboard.writeText(passkey);
  const email = (document.querySelector<HTMLInputElement>("#create-email")!.value || "").trim().toLowerCase();
  if (!email) return;
  const out = document.querySelector<HTMLElement>("#create-output")!;
  try {
    const created = await postJson<AuthResponse>("/api/auth/signup", { email, passphrase: passkey });
    out.textContent = `${content}\nBackend: account created (${created.activeAddress}).`;
  } catch (error) {
    out.textContent = `${content}\nBackend: ${(error as Error).message}`;
  }
});

document.querySelector<HTMLButtonElement>("#login-btn")!.addEventListener("click", async () => {
  const email = (document.querySelector<HTMLInputElement>("#login-email")!.value || "").trim().toLowerCase();
  const passkey = (document.querySelector<HTMLInputElement>("#login-passkey")!.value || "").trim();
  const out = document.querySelector<HTMLElement>("#login-output")!;
  try {
    const auth = await postJson<AuthResponse>("/api/auth/login", { email, passphrase: passkey });
    const profile: Profile = {
      email,
      passkey,
      address: auth.activeAddress || auth.accounts[0]?.address || "",
    };
    if (!profile.address) {
      out.textContent = "No wallet account returned by backend.";
      return;
    }
    setSession({ ...auth, email, passkey });
    const status = await syncSessionStatus(auth.sessionId);
    if (status.status !== "active") {
      redirectToLoginForSession({ email, passkey }, "Session is not active. Please login again.");
      return;
    }
    pushNotification(`Session active until ${formatExpiryText(status.expiresAt)}.`);
    clearSessionMonitor();
    sessionMonitorTimer = window.setInterval(() => {
      const current = sessionData();
      if (!current) return;
      void syncSessionStatus(current.sessionId)
        .then((res) => {
          if (res.status !== "active") {
            redirectToLoginForSession(
              { email: current.email, passkey: current.passkey },
              "Session expired. Please login again."
            );
          }
        })
        .catch((err) => {
          if (isSessionErrorMessage((err as Error).message)) {
            redirectToLoginForSession(
              { email: current.email, passkey: current.passkey },
              "Session invalid. Please login again."
            );
          }
        });
    }, 60_000);
    out.textContent = "";
    showWalletMain(profile);
    void refreshWalletState(profile.address);
    void syncActivityFromBackend(auth.sessionId);
  } catch (error) {
    out.textContent = `Login failed: ${(error as Error).message}`;
  }
});

document.querySelector<HTMLButtonElement>("#wallet-logout")!.addEventListener("click", () => {
  clearSessionMonitor();
  clearSession();
  showLanding();
});

document
  .querySelector<HTMLButtonElement>("#profile-add-account-btn")!
  .addEventListener("click", async () => {
    const note = document.querySelector<HTMLElement>("#profile-add-account-note")!;
    const label = (
      document.querySelector<HTMLInputElement>("#profile-account-label")!.value || ""
    ).trim();
    const session = sessionData();
    if (!session) {
      note.textContent = "Session not found. Login again.";
      return;
    }
    try {
      const created = await postJson<AddAccountResponse>("/api/auth/account/add", {
        sessionId: session.sessionId,
        label,
      });
      const me = await getJson<AuthMeResponse>(
        `/api/auth/me?sessionId=${encodeURIComponent(session.sessionId)}`
      );
      const activeAddress = me.activeAddress || me.accounts[0]?.address || created.address;
      setSession({
        ...session,
        email: me.email || session.email,
        accounts: me.accounts,
        activeAddress,
      });
      document.querySelector<HTMLInputElement>("#wallet-main-address")!.value = activeAddress;
      document.querySelector<HTMLInputElement>("#profile-address")!.value = activeAddress;
      note.textContent = `Account created: ${created.address}`;
      await refreshWalletState(activeAddress);
    } catch (error) {
      const message = (error as Error).message;
      if (isSessionErrorMessage(message)) {
        redirectToLoginForSession(
          { email: session.email, passkey: session.passkey },
          "Session expired/invalid while adding account. Please login again."
        );
        note.textContent = "";
        return;
      }
      note.textContent = `Add account failed: ${message}`;
    }
  });

document.querySelector<HTMLButtonElement>("#copy-address")!.addEventListener("click", async () => {
  const addr = document.querySelector<HTMLInputElement>("#wallet-main-address")!.value;
  if (!addr) return;
  await navigator.clipboard.writeText(addr);
  document.querySelector<HTMLElement>("#wallet-main-note")!.textContent = "Address copied.";
});

document.querySelector<HTMLButtonElement>("#btn-onchain-send")!.addEventListener("click", async () => {
  const to = (document.querySelector<HTMLInputElement>("#onchain-send-to")!.value || "").trim();
  const amount = (document.querySelector<HTMLInputElement>("#onchain-send-amount")!.value || "").trim();
  const asset = (document.querySelector<HTMLSelectElement>("#onchain-asset-select")!.value || "").trim();
  const note = document.querySelector<HTMLElement>("#onchain-note")!;
  const from = (document.querySelector<HTMLInputElement>("#wallet-main-address")!.value || "").trim();
  const selectedAsset = assetCatalog.find((item) => item.symbol === asset);
  if (!selectedAsset) {
    note.textContent = "Asset tidak ditemukan di catalog backend.";
    return;
  }
  if (!selectedAsset.transferable) {
    note.textContent = `Asset ${selectedAsset.symbol} masih locked dan belum bisa ditransaksikan.`;
    return;
  }
  if (!to.startsWith("kvp:wallet:")) {
    note.textContent = "Destination must use kvp:wallet: format.";
    return;
  }
  if (!Number(amount) || Number(amount) <= 0) {
    note.textContent = "Amount must be greater than 0.";
    return;
  }
  try {
    const result = await postJson<TransferResponse>("/api/kvc/transfer", {
      from,
      to,
      asset: selectedAsset.symbol,
      amount,
    });
    if (!result.txHash) {
      note.textContent = "Transfer response tidak mengandung txHash.";
      return;
    }
    const tx = addTx("onchain-send", amount, selectedAsset.symbol, `Send to ${to}`);
    tx.txHash = result.txHash;
    tx.status = (result.status === "success" ? "success" : "pending");
    const updated = txs();
    updated[0] = tx;
    saveTxs(updated);
    renderHistory();
    renderStatistics();
    note.textContent = `Send submitted. TxHash: ${result.txHash.slice(0, 18)}...`;
    await refreshWalletState(from);
    const active = sessionData();
    if (active) {
      await syncActivityFromBackend(active.sessionId);
    }
  } catch (error) {
    note.textContent = `Transfer gagal dari backend: ${(error as Error).message}`;
  }
});

document.querySelector<HTMLButtonElement>("#btn-stake")!.addEventListener("click", () => {
  const asset = (document.querySelector<HTMLSelectElement>("#stake-asset-select")!.value || "").trim();
  const note = document.querySelector<HTMLElement>("#staking-note")!;
  const selectedAsset = assetCatalog.find((item) => item.symbol === asset);
  if (!selectedAsset) {
    note.textContent = "Asset tidak ditemukan di catalog backend.";
    return;
  }
  note.textContent = `Endpoint staking belum tersedia di backend (asset terpilih: ${selectedAsset.symbol}).`;
});

document.querySelector<HTMLButtonElement>("#btn-mint")!.addEventListener("click", async () => {
  const symbol = (document.querySelector<HTMLSelectElement>("#mint-asset-select")!.value || "").trim();
  const amount = (document.querySelector<HTMLInputElement>("#mint-amount")!.value || "").trim();
  const note = document.querySelector<HTMLElement>("#minting-note")!;
  if (!symbol) {
    note.textContent = "Asset tidak ditemukan di catalog backend.";
    return;
  }
  if (!Number(amount) || Number(amount) <= 0) {
    note.textContent = "Amount must be greater than 0.";
    return;
  }
  const session = sessionData();
  if (!session) {
    note.textContent = "Session not found. Login again.";
    return;
  }
  try {
    const result = await postJson<MintResponse>("/api/minting/request", {
      sessionId: session.sessionId,
      asset: symbol,
      amount,
    });
    note.textContent = `${result.status}: ${result.note} (tx: ${result.txHash})`;
    await syncActivityFromBackend(session.sessionId);
  } catch (error) {
    const message = (error as Error).message;
    if (isSessionErrorMessage(message)) {
      redirectToLoginForSession(
        { email: session.email, passkey: session.passkey },
        "Session expired/invalid while minting. Please login again."
      );
      note.textContent = "";
      return;
    }
    note.textContent = `Minting request failed: ${message}`;
  }
});

document.querySelector<HTMLButtonElement>("#btn-burn")!.addEventListener("click", async () => {
  const symbol = (document.querySelector<HTMLSelectElement>("#burn-asset-select")!.value || "").trim();
  const amount = (document.querySelector<HTMLInputElement>("#burn-amount")!.value || "").trim();
  const note = document.querySelector<HTMLElement>("#burning-note")!;
  if (!symbol) {
    note.textContent = "Asset tidak ditemukan di catalog backend.";
    return;
  }
  if (!Number(amount) || Number(amount) <= 0) {
    note.textContent = "Amount must be greater than 0.";
    return;
  }
  const session = sessionData();
  if (!session) {
    note.textContent = "Session not found. Login again.";
    return;
  }
  try {
    const result = await postJson<BurnResponse>("/api/burning/request", {
      sessionId: session.sessionId,
      asset: symbol,
      amount,
    });
    note.textContent = `${result.status}: ${result.note} (tx: ${result.txHash})`;
    await syncActivityFromBackend(session.sessionId);
  } catch (error) {
    const message = (error as Error).message;
    if (isSessionErrorMessage(message)) {
      redirectToLoginForSession(
        { email: session.email, passkey: session.passkey },
        "Session expired/invalid while burning. Please login again."
      );
      note.textContent = "";
      return;
    }
    note.textContent = `Burning request failed: ${message}`;
  }
});

for (const button of quickPageButtons) {
  button.addEventListener("click", () => {
    const page = (button.dataset.openPage || "dashboard") as WalletPage;
    openWalletPage(page);
  });
}

(function bootstrap() {
  const active = sessionData();
  if (!active) {
    showLanding();
    return;
  }
  void (async () => {
    try {
      const me = await getJson<AuthMeResponse>(`/api/auth/me?sessionId=${encodeURIComponent(active.sessionId)}`);
      const profile: Profile = {
        email: me.email || active.email,
        passkey: active.passkey,
        address: me.activeAddress || me.accounts[0]?.address || "",
      };
      if (!profile.address) throw new Error("no wallet account");
      setSession({
        ...active,
        email: profile.email,
        activeAddress: profile.address,
        accounts: me.accounts,
      });
      try {
        const status = await syncSessionStatus(active.sessionId);
        if (status.status === "active") {
          pushNotification(`Session active until ${formatExpiryText(status.expiresAt)}.`);
          clearSessionMonitor();
          sessionMonitorTimer = window.setInterval(() => {
            const current = sessionData();
            if (!current) return;
            void syncSessionStatus(current.sessionId)
              .then((res) => {
                if (res.status !== "active") {
                  redirectToLoginForSession(
                    { email: current.email, passkey: current.passkey },
                    "Session expired. Please login again."
                  );
                }
              })
              .catch((err) => {
                if (isSessionErrorMessage((err as Error).message)) {
                  redirectToLoginForSession(
                    { email: current.email, passkey: current.passkey },
                    "Session invalid. Please login again."
                  );
                }
              });
          }, 60_000);
        }
      } catch {
        // Keep bootstrap resilient; auth/me already proved session usability.
      }
      showWalletMain(profile);
      await refreshWalletState(profile.address);
      await syncActivityFromBackend(active.sessionId);
    } catch {
      clearSession();
      showLanding();
    }
  })();
})();
