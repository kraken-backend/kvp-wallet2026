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
type TxKind = "onchain-send" | "onchain-receive" | "staking" | "minting";
type TxItem = {
  txHash: string;
  kind: TxKind;
  status: "pending" | "success";
  amount: string;
  asset: string;
  createdAt: string;
  note: string;
};

const USERS_KEY = "kvp_wallet_simple_users";
const SESSION_KEY = "kvp_wallet_simple_session";
const TX_KEY = "kvp_wallet_simple_txs";
const EXPLORER_BASE =
  (import.meta.env.VITE_MAIN_EXPLORER_URL as string | undefined) ||
  "https://kvp2026.vercel.app";

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
        <input id="create-email" type="email" placeholder="you@domain.com" />
      </label>
      <button id="generate-passkey" class="btn btn-primary auth-btn" type="button">Generate Passkey</button>
      <pre id="create-output"></pre>
      <button id="copy-passkey" class="btn btn-secondary auth-btn" type="button">Copy Passkey</button>
      <button id="switch-login" class="link-btn" type="button">I already have an account</button>
    </div>

    <div id="login-view" class="hidden">
      <label>Email
        <input id="login-email" type="email" placeholder="you@domain.com" />
      </label>
      <label>Passkey
        <input id="login-passkey" type="text" placeholder="paste your passkey" />
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
      <button id="wallet-logout" class="btn btn-secondary wallet-logout-btn" type="button">Logout</button>
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
          <strong>Transaction Crosschain</strong><span>Send/Receive - Coming Soon</span>
        </button>
        <button data-open-page="bridge" class="feature-card" type="button">
          <strong>Transaction Bridge</strong><span>Swap Onchain/Crosschain - Coming Soon</span>
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
          <label>To Address <input id="onchain-send-to" placeholder="kvp:wallet:destination" /></label>
          <label>Amount <input id="onchain-send-amount" value="10" /></label>
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
        <label>Amount tKVC <input id="stake-amount" value="25" /></label>
        <button id="btn-stake" class="btn btn-primary auth-btn" type="button">Submit Staking</button>
      </article>
      <p id="staking-note" class="auth-message"></p>
    </div>

    <div id="wallet-minting-page" class="wallet-page hidden">
      <article class="panel-card">
        <h3>Minting</h3>
        <label>Token Symbol <input id="mint-symbol" value="KRT" /></label>
        <label>Amount <input id="mint-amount" value="1000" /></label>
        <button id="btn-mint" class="btn btn-primary auth-btn" type="button">Submit Minting</button>
      </article>
      <p id="minting-note" class="auth-message"></p>
    </div>

    <div id="wallet-crosschain-page" class="wallet-page hidden">
      <article class="panel-card coming-card">
        <h3>Transaction Crosschain</h3>
        <p>Send/Receive crosschain is <strong>Coming Soon</strong> for KVC wallet.</p>
      </article>
    </div>

    <div id="wallet-bridge-page" class="wallet-page hidden">
      <article class="panel-card coming-card">
        <h3>Transaction Bridge</h3>
        <p>Swap Onchain and Swap Crosschain are <strong>Coming Soon</strong>.</p>
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
        <ul class="notice-list">
          <li>Wallet login activity detected.</li>
          <li>Latest onchain transaction confirmed.</li>
          <li>New staking campaign will open soon.</li>
        </ul>
      </article>
    </div>

    <div id="wallet-profile-page" class="wallet-page hidden">
      <article class="panel-card">
        <h3>Profile</h3>
        <label>Email <input id="profile-email" readonly /></label>
        <label>Wallet Address <input id="profile-address" readonly /></label>
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

function users(): Profile[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as Profile[];
  } catch {
    return [];
  }
}

function saveUsers(next: Profile[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(next));
}

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

function setSession(email: string) {
  localStorage.setItem(SESSION_KEY, email);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function sessionEmail() {
  return (localStorage.getItem(SESSION_KEY) || "").trim().toLowerCase();
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

function generateAddress() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let part = "";
  for (let i = 0; i < 12; i += 1) {
    part += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `kvp:wallet:${part}`;
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
  return `${EXPLORER_BASE}/?search=${encodeURIComponent(hash)}`;
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

function ensureInitialTxSeed() {
  if (txs().length > 0) return;
  saveTxs([
    {
      txHash: generateTxHash(),
      kind: "onchain-receive",
      status: "success",
      amount: "100",
      asset: "tKVC",
      createdAt: new Date().toISOString(),
      note: "Initial wallet funding",
    },
  ]);
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
  const existing = users();
  if (existing.some((item) => item.email === email)) {
    output.textContent = "Email already exists. Use Sign In.";
    return;
  }
  const passkey = generatePasskey();
  const address = generateAddress();
  existing.push({ email, passkey, address });
  saveUsers(existing);
  output.textContent = `Email: ${email}\nPasskey: ${passkey}\nAddress: ${address}`;
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
});

document.querySelector<HTMLButtonElement>("#login-btn")!.addEventListener("click", () => {
  const email = (document.querySelector<HTMLInputElement>("#login-email")!.value || "").trim().toLowerCase();
  const passkey = (document.querySelector<HTMLInputElement>("#login-passkey")!.value || "").trim();
  const out = document.querySelector<HTMLElement>("#login-output")!;
  const found = users().find((item) => item.email === email && item.passkey === passkey);
  if (!found) {
    out.textContent = "Invalid email or passkey.";
    return;
  }
  setSession(found.email);
  out.textContent = "";
  ensureInitialTxSeed();
  showWalletMain(found);
});

document.querySelector<HTMLButtonElement>("#wallet-logout")!.addEventListener("click", () => {
  clearSession();
  showLanding();
});

document.querySelector<HTMLButtonElement>("#copy-address")!.addEventListener("click", async () => {
  const addr = document.querySelector<HTMLInputElement>("#wallet-main-address")!.value;
  if (!addr) return;
  await navigator.clipboard.writeText(addr);
  document.querySelector<HTMLElement>("#wallet-main-note")!.textContent = "Address copied.";
});

document.querySelector<HTMLButtonElement>("#btn-onchain-send")!.addEventListener("click", () => {
  const to = (document.querySelector<HTMLInputElement>("#onchain-send-to")!.value || "").trim();
  const amount = (document.querySelector<HTMLInputElement>("#onchain-send-amount")!.value || "").trim();
  const note = document.querySelector<HTMLElement>("#onchain-note")!;
  if (!to.startsWith("kvp:wallet:")) {
    note.textContent = "Destination must use kvp:wallet: format.";
    return;
  }
  if (!Number(amount) || Number(amount) <= 0) {
    note.textContent = "Amount must be greater than 0.";
    return;
  }
  const tx = addTx("onchain-send", amount, "tKVC", `Send to ${to}`);
  note.textContent = `Send submitted. TxHash: ${tx.txHash.slice(0, 18)}...`;
});

document.querySelector<HTMLButtonElement>("#btn-stake")!.addEventListener("click", () => {
  const amount = (document.querySelector<HTMLInputElement>("#stake-amount")!.value || "").trim();
  const note = document.querySelector<HTMLElement>("#staking-note")!;
  if (!Number(amount) || Number(amount) <= 0) {
    note.textContent = "Staking amount must be greater than 0.";
    return;
  }
  const tx = addTx("staking", amount, "tKVC", "Staking transaction");
  note.textContent = `Staking submitted. TxHash: ${tx.txHash.slice(0, 18)}...`;
});

document.querySelector<HTMLButtonElement>("#btn-mint")!.addEventListener("click", () => {
  const symbol = (document.querySelector<HTMLInputElement>("#mint-symbol")!.value || "").trim();
  const amount = (document.querySelector<HTMLInputElement>("#mint-amount")!.value || "").trim();
  const note = document.querySelector<HTMLElement>("#minting-note")!;
  if (!symbol) {
    note.textContent = "Token symbol is required.";
    return;
  }
  if (!Number(amount) || Number(amount) <= 0) {
    note.textContent = "Minting amount must be greater than 0.";
    return;
  }
  const tx = addTx("minting", amount, symbol.toUpperCase(), `Mint ${symbol.toUpperCase()}`);
  note.textContent = `Minting submitted. TxHash: ${tx.txHash.slice(0, 18)}...`;
});

for (const button of quickPageButtons) {
  button.addEventListener("click", () => {
    const page = (button.dataset.openPage || "dashboard") as WalletPage;
    openWalletPage(page);
  });
}

(function bootstrap() {
  const active = sessionEmail();
  if (!active) {
    showLanding();
    return;
  }
  const profile = users().find((item) => item.email === active);
  if (!profile) {
    clearSession();
    showLanding();
    return;
  }
  ensureInitialTxSeed();
  showWalletMain(profile);
})();
