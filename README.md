# WalletKVP2026

Wallet project khusus KVC dengan:
- Backend: Go (`backend-go`)
- Frontend: HTML/CSS/JS ringan (`frontend`)
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

## 2) Frontend

Buka file:

`D:\upwork\KVP\Codes\WalletKVP2026\frontend\index.html`

Isi `Wallet Backend URL` dengan URL backend Go (default: `http://localhost:8098`).

## 3) Catatan Koneksi KVC

- Wallet backend ini tidak menyimpan ledger sendiri.
- Data wallet/transfer diproxy ke KVC node melalui:
  - `KVC_API_BASE/gateway/wallet/{address}?mode=api`
  - `KVC_API_BASE/gateway/tx/simulate-transfer?mode=api`

Jika endpoint KVC berbeda, tinggal ganti `KVC_API_BASE`.
