package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type app struct {
	kvcBase string
	db      *sql.DB
}

type authRequest struct {
	Email      string `json:"email"`
	Passphrase string `json:"passphrase"`
}

type authResponse struct {
	Status        string          `json:"status"`
	UserID        string          `json:"userId"`
	SessionID     string          `json:"sessionId"`
	Accounts      []walletAccount `json:"accounts"`
	ActiveAddress string          `json:"activeAddress"`
}

type walletAccount struct {
	Address string `json:"address"`
	Label   string `json:"label"`
}

type accountAddRequest struct {
	SessionID string `json:"sessionId"`
	Label     string `json:"label"`
}

type credentialRegisterRequest struct {
	SessionID    string `json:"sessionId"`
	CredentialID string `json:"credentialId"`
	PublicKey    string `json:"publicKey"`
}

type mintRequest struct {
	SessionID string `json:"sessionId"`
	Asset     string `json:"asset"`
	Amount    string `json:"amount"`
}

func main() {
	kvcBase := getenv("KVC_API_BASE", "http://localhost:8090")
	port := getenv("PORT", "8088")
	db, err := openDB()
	if err != nil {
		log.Fatal(err)
	}
	if err := runMigrations(db); err != nil {
		log.Fatal(err)
	}
	a := &app{kvcBase: kvcBase, db: db}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":        true,
			"service":   "wallet-kvp-backend",
			"kvcBase":   kvcBase,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})
	mux.HandleFunc("POST /api/auth/signup", a.signup)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("GET /api/auth/session/", a.getSession)
	mux.HandleFunc("GET /api/auth/me", a.me)
	mux.HandleFunc("POST /api/auth/account/add", a.addAccount)
	mux.HandleFunc("POST /api/auth/credential/register", a.registerCredential)
	mux.HandleFunc("GET /api/minting/policy", a.mintingPolicy)
	mux.HandleFunc("POST /api/minting/request", a.mintingRequest)

	mux.HandleFunc("GET /api/kvc/status", func(w http.ResponseWriter, r *http.Request) {
		body, code, err := proxyRequest(http.MethodGet, fmt.Sprintf("%s/gateway/status?mode=api", a.kvcBase), nil)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
			return
		}
		writeRawJSON(w, code, body)
	})
	mux.HandleFunc("GET /api/kvc/assets", func(w http.ResponseWriter, r *http.Request) {
		body, code, err := proxyRequest(http.MethodGet, fmt.Sprintf("%s/gateway/assets?mode=api", a.kvcBase), nil)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
			return
		}
		writeRawJSON(w, code, body)
	})
	mux.HandleFunc("GET /api/kvc/wallet/", func(w http.ResponseWriter, r *http.Request) {
		address := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/api/kvc/wallet/"))
		if address == "" || !strings.HasPrefix(address, "kvp:") {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "address must use kvp: prefix"})
			return
		}
		target := fmt.Sprintf("%s/gateway/wallet/%s?mode=api", a.kvcBase, address)
		body, code, err := proxyRequest(http.MethodGet, target, nil)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
			return
		}
		writeRawJSON(w, code, body)
	})
	mux.HandleFunc("POST /api/kvc/transfer", func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON payload"})
			return
		}
		target := fmt.Sprintf("%s/gateway/tx/simulate-transfer?mode=api", a.kvcBase)
		body, code, err := proxyRequest(http.MethodPost, target, payload)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
			return
		}
		writeRawJSON(w, code, body)
	})

	handler := withCORS(mux)
	log.Printf("wallet backend running on :%s (KVC_API_BASE=%s)", port, kvcBase)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}

func openDB() (*sql.DB, error) {
	dbPath := getenv("WALLET_DB_PATH", filepath.Join("..", "data", "wallet.db"))
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}
	return sql.Open("sqlite", dbPath)
}

func runMigrations(db *sql.DB) error {
	stmts := []string{
		`create table if not exists users (user_id text primary key,email text unique,created_at timestamptz not null default current_timestamp)`,
		`create table if not exists wallet_auth (user_id text primary key references users(user_id) on delete cascade, pass_hash text not null)`,
		`create table if not exists wallet_accounts (wallet_account_id text primary key,user_id text not null references users(user_id) on delete cascade,address text not null,label text,created_at timestamptz not null default current_timestamp)`,
		`create table if not exists sessions (session_id text primary key,user_id text not null references users(user_id) on delete cascade,token_hash text not null,expires_at timestamptz not null,created_at timestamptz not null default current_timestamp)`,
		`create table if not exists webauthn_credentials (credential_id text primary key,user_id text not null references users(user_id) on delete cascade,public_key text not null,created_at timestamptz not null default current_timestamp)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

func (a *app) signup(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid payload"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || !strings.Contains(email, "@") || strings.TrimSpace(req.Passphrase) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "email and passphrase are required"})
		return
	}
	ctx := context.Background()
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to open tx"})
		return
	}
	defer tx.Rollback()
	userID := "user_" + randomID(10)
	address := "kvp:wallet:" + randomID(10)
	if _, err := tx.ExecContext(ctx, `insert into users(user_id,email) values(?,?)`, userID, email); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "email already registered"})
		return
	}
	if _, err := tx.ExecContext(ctx, `insert into wallet_auth(user_id,pass_hash) values(?,?)`, userID, hashString(req.Passphrase)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to save auth"})
		return
	}
	if _, err := tx.ExecContext(ctx, `insert into wallet_accounts(wallet_account_id,user_id,address,label) values(?,?,?,?)`, "wa_"+randomID(10), userID, address, "Account 1"); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to create wallet account"})
		return
	}
	sessionID := "sess_" + randomID(12)
	exp := time.Now().UTC().Add(24 * time.Hour)
	if _, err := tx.ExecContext(ctx, `insert into sessions(session_id,user_id,token_hash,expires_at) values(?,?,?,?)`, sessionID, userID, hashString(sessionID), exp); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to create session"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to commit"})
		return
	}
	writeJSON(w, http.StatusOK, authResponse{
		Status:        "created",
		UserID:        userID,
		SessionID:     sessionID,
		Accounts:      []walletAccount{{Address: address, Label: "Account 1"}},
		ActiveAddress: address,
	})
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid payload"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || strings.TrimSpace(req.Passphrase) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "email and passphrase are required"})
		return
	}
	ctx := context.Background()
	var userID, passHash string
	err := a.db.QueryRowContext(ctx, `select u.user_id, a.pass_hash from users u join wallet_auth a on a.user_id=u.user_id where lower(u.email)=lower(?)`, email).
		Scan(&userID, &passHash)
	if errors.Is(err, sql.ErrNoRows) || passHash != hashString(req.Passphrase) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid email or passphrase"})
		return
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failure"})
		return
	}
	rows, err := a.db.QueryContext(ctx, `select address, coalesce(label,'Account') from wallet_accounts where user_id=? order by created_at asc`, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "accounts query failure"})
		return
	}
	defer rows.Close()
	accounts := []walletAccount{}
	for rows.Next() {
		var account walletAccount
		if rows.Scan(&account.Address, &account.Label) == nil {
			accounts = append(accounts, account)
		}
	}
	if len(accounts) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "no wallet account"})
		return
	}
	sessionID := "sess_" + randomID(12)
	exp := time.Now().UTC().Add(24 * time.Hour)
	if _, err := a.db.ExecContext(ctx, `insert into sessions(session_id,user_id,token_hash,expires_at) values(?,?,?,?)`, sessionID, userID, hashString(sessionID), exp); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "session create failure"})
		return
	}
	writeJSON(w, http.StatusOK, authResponse{
		Status:        "authenticated",
		UserID:        userID,
		SessionID:     sessionID,
		Accounts:      accounts,
		ActiveAddress: accounts[0].Address,
	})
}

func (a *app) getSession(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimPrefix(r.URL.Path, "/api/auth/session/")
	if strings.TrimSpace(sessionID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "session id required"})
		return
	}
	var userID string
	var expires time.Time
	err := a.db.QueryRow(`select user_id, expires_at from sessions where session_id=?`, sessionID).Scan(&userID, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "session not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "session query failure"})
		return
	}
	status := "active"
	if time.Now().UTC().After(expires) {
		status = "expired"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sessionId": sessionID,
		"userId":    userID,
		"status":    status,
		"expiresAt": expires,
	})
}

func (a *app) me(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	userID, err := a.requireSession(sessionID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": err.Error()})
		return
	}
	var email string
	if err := a.db.QueryRow(`select email from users where user_id=?`, userID).Scan(&email); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "user lookup failed"})
		return
	}
	rows, err := a.db.Query(`select address, coalesce(label,'Account') from wallet_accounts where user_id=? order by created_at asc`, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "accounts query failure"})
		return
	}
	defer rows.Close()
	accounts := []walletAccount{}
	for rows.Next() {
		var account walletAccount
		if rows.Scan(&account.Address, &account.Label) == nil {
			accounts = append(accounts, account)
		}
	}
	activeAddress := ""
	if len(accounts) > 0 {
		activeAddress = accounts[0].Address
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":        "active",
		"userId":        userID,
		"email":         email,
		"sessionId":     sessionID,
		"accounts":      accounts,
		"activeAddress": activeAddress,
	})
}

func (a *app) requireSession(sessionID string) (string, error) {
	if strings.TrimSpace(sessionID) == "" {
		return "", errors.New("session id required")
	}
	var userID string
	var expires time.Time
	err := a.db.QueryRow(`select user_id, expires_at from sessions where session_id=?`, sessionID).Scan(&userID, &expires)
	if err != nil {
		return "", errors.New("invalid session")
	}
	if time.Now().UTC().After(expires) {
		return "", errors.New("session expired")
	}
	return userID, nil
}

func (a *app) addAccount(w http.ResponseWriter, r *http.Request) {
	var req accountAddRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid payload"})
		return
	}
	userID, err := a.requireSession(req.SessionID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": err.Error()})
		return
	}
	label := strings.TrimSpace(req.Label)
	if label == "" {
		label = "Account"
	}
	address := "kvp:wallet:" + randomID(10)
	_, err = a.db.Exec(`insert into wallet_accounts(wallet_account_id,user_id,address,label) values(?,?,?,?)`, "wa_"+randomID(10), userID, address, label)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to create account"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "created",
		"address": address,
		"label":   label,
	})
}

func (a *app) registerCredential(w http.ResponseWriter, r *http.Request) {
	var req credentialRegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid payload"})
		return
	}
	userID, err := a.requireSession(req.SessionID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": err.Error()})
		return
	}
	if strings.TrimSpace(req.CredentialID) == "" || strings.TrimSpace(req.PublicKey) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "credentialId and publicKey are required"})
		return
	}
	_, err = a.db.Exec(`insert into webauthn_credentials(credential_id,user_id,public_key) values(?,?,?)`, req.CredentialID, userID, req.PublicKey)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "failed to register credential"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "registered", "credentialId": req.CredentialID})
}

func (a *app) mintingPolicy(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "coming-soon",
		"scope":     "wallet-minting",
		"note":      "Minting policy execution will open after community phase gate.",
		"dbReady":   true,
		"apiReady":  true,
		"chainReady": false,
	})
}

func (a *app) mintingRequest(w http.ResponseWriter, r *http.Request) {
	var req mintRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid payload"})
		return
	}
	if _, err := a.requireSession(req.SessionID); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "coming-soon",
		"asset":  req.Asset,
		"amount": req.Amount,
		"note":   "Minting request recorded at wallet layer; chain activation is not open yet.",
	})
}

func proxyRequest(method, url string, payload any) ([]byte, int, error) {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, err
		}
		body = bytes.NewBuffer(data)
	}
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	out, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}
	return out, resp.StatusCode, nil
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, code int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeRawJSON(w http.ResponseWriter, code int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_, _ = w.Write(body)
}

func getenv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func hashString(v string) string {
	sum := sha256.Sum256([]byte(v))
	return hex.EncodeToString(sum[:])
}

func randomID(length int) string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}
