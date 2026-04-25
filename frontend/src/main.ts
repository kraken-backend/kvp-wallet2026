import "./style.css";

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
`;

const landingScreen = document.querySelector<HTMLElement>("#landing-screen")!;
const authPanel = document.querySelector<HTMLElement>("#auth-panel")!;
const authTitle = document.querySelector<HTMLElement>("#auth-title")!;
const createView = document.querySelector<HTMLElement>("#create-view")!;
const loginView = document.querySelector<HTMLElement>("#login-view")!;

type Profile = { email: string; passkey: string };
const USERS_KEY = "kvp_wallet_simple_users";

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
}

function showCreate() {
  landingScreen.classList.add("hidden");
  authPanel.classList.remove("hidden");
  createView.classList.remove("hidden");
  loginView.classList.add("hidden");
  authTitle.textContent = "Create Wallet";
}

function showLogin() {
  landingScreen.classList.add("hidden");
  authPanel.classList.remove("hidden");
  createView.classList.add("hidden");
  loginView.classList.remove("hidden");
  authTitle.textContent = "Log In";
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
  existing.push({ email, passkey });
  saveUsers(existing);
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
  out.textContent = "Login success.";
});
