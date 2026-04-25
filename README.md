# WalletKVP2026

Wallet project khusus KVC dengan:
- Backend: Go (`backend-go`)
- Frontend: Vite + TypeScript (`frontend`)
- Integrasi: Backend proxy ke KVC API (`KVC_API_BASE`)

## 1) Backend (Go)

Masuk folder:

```powershell
cd D:\upwork\KVP\Codes\WalletKVP2026\backend-go
```

Set env (PowerShell):

```powershell
$env:PORT="8098"
$env:KVC_API_BASE="http://localhost:8090"
```

Run:

```powershell
go run .
```

Endpoints:
- `GET /api/health`
- `GET /api/kvc/status`
- `GET /api/kvc/wallet/{address}`
- `POST /api/kvc/transfer`

## 2) Frontend (Vite + TS)

Masuk folder:

```powershell
cd D:\upwork\KVP\Codes\WalletKVP2026\frontend
```

Install:

```powershell
npm install
```

Run dev:

```powershell
npm run dev
```

Build:

```powershell
npm run build
```

Frontend membaca environment dari Vite:
- `VITE_WALLET_BACKEND_URL`
- `VITE_WALLET_PUBLIC_HEALTH_URL`

Flow FE:
- Step 1: Create Wallet (email -> generate passphrase -> copy)
- Step 2: Login (email + passphrase)
- Step 3: Wallet Dashboard (load wallet, transfer, logout)

## 3) Catatan Koneksi KVC

- Wallet backend ini tidak menyimpan ledger sendiri.
- Data wallet/transfer diproxy ke KVC node melalui:
  - `KVC_API_BASE/gateway/wallet/{address}?mode=api`
  - `KVC_API_BASE/gateway/tx/simulate-transfer?mode=api`

Jika endpoint KVC berbeda, tinggal ganti `KVC_API_BASE`.

## 4) One-click backend+tunnel launcher

File:

`D:\upwork\KVP\Codes\run_all_be_and_tunnels.bat`

Yang dijalankan:
- Rust blockchain node
- Go blockchain gateway
- Tunnel blockchain (`localhost:8090`)
- Go wallet backend (`localhost:8098`)
- Tunnel wallet (`localhost:8098`)

## 5) Environment files

- `.env.local` -> local runtime values
- `.env.local.example` -> template
