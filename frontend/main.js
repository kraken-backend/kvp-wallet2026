const backendInput = document.getElementById("backend-url");
const healthOutput = document.getElementById("health-output");
const walletOutput = document.getElementById("wallet-output");
const transferOutput = document.getElementById("transfer-output");

function backendBase() {
  return (backendInput.value || "").trim().replace(/\/+$/, "");
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
