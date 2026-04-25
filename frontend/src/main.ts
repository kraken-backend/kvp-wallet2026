import "./style.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<main class="landing">
  <div class="overlay"></div>
  <section class="content">
    <img class="logo" src="/assets/kvp-logo.png" alt="KVP Logo" />
    <p class="label">KRAKENUM</p>
    <h1>Krakenum Wallet</h1>
  </section>
</main>
`;
