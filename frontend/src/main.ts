import "./style.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<main class="landing">
  <img class="phones" src="/assets/landing-phones.png" alt="Wallet preview" />
  <div class="overlay"></div>
  <section class="content">
    <img class="logo" src="/assets/kvp-logo.png" alt="KVP Logo" />
    <p class="label">KRAKENUM</p>
    <h1>Krakenum Wallet</h1>
    <div class="hero-actions">
      <button class="btn btn-primary" type="button">Create Wallet</button>
      <button class="btn btn-secondary" type="button">Sign In</button>
    </div>
  </section>
</main>
`;
