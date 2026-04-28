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
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type app struct {
	kvcBase      string
	db           *sql.DB
	mintTreasury string
	burnSink     string
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

type burnRequest struct {
	SessionID string `json:"sessionId"`
	Asset     string `json:"asset"`
	Amount    string `json:"amount"`
}

type walletPolicyResponse struct {
	Active struct {
		PolicyHash         string `json:"policyHash"`
		Stage              string `json:"stage"`
		MintEnabled        bool   `json:"mintEnabled"`
		BurnEnabled        bool   `json:"burnEnabled"`
		KVCTransferEnabled bool   `json:"kvcTransferEnabled"`
	} `json:"active"`
}

func defaultWalletPolicy() walletPolicyResponse {
	var p walletPolicyResponse
	p.Active.PolicyHash = "policy:unknown"
	p.Active.Stage = "bootstrap-open"
	p.Active.MintEnabled = true
	p.Active.BurnEnabled = true
	p.Active.KVCTransferEnabled = true
	return p
}

func (a *app) fetchWalletPolicy() (walletPolicyResponse, string) {
	body, code, err := proxyRequest(http.MethodGet, fmt.Sprintf("%s/gateway/policy/active?mode=api", a.kvcBase), nil)
	if err != nil {
		return defaultWalletPolicy(), err.Error()
	}
	if code != http.StatusOK {
		return defaultWalletPolicy(), fmt.Sprintf("policy endpoint returned %d", code)
	}
	var policy walletPolicyResponse
	if err := json.Unmarshal(body, &policy); err != nil {
		return defaultWalletPolicy(), "invalid policy payload"
	}
	return policy, ""
}

type transferPayload struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Asset  string `json:"asset"`
	Amount string `json:"amount"`
}

type transferResult struct {
	TxHash string `json:"txHash"`
	Status string `json:"status"`
	Message string `json:"message"`
}

type recentTx struct {
	TxHash        string `json:"txHash"`
	TxType        string `json:"txType"`
	From          string `json:"from"`
	To            string `json:"to"`
	Asset         string `json:"asset"`
	Amount        string `json:"amount"`
	TimestampUnix uint64 `json:"timestampUnix"`
	Status        string `json:"status"`
}

type sessionEvent struct {
	EventID   int64  `json:"eventId"`
	SessionID string `json:"sessionId"`
	UserID    string `json:"userId"`
	EventType string `json:"eventType"`
	Detail    string `json:"detail"`
	CreatedAt string `json:"createdAt"`
}

func sessionIdleTimeout() time.Duration {
	raw := strings.TrimSpace(os.Getenv("SESSION_IDLE_MINUTES"))
	if raw == "" {
		return 60 * time.Minute
	}
	minutes, err := strconv.Atoi(raw)
	if err != nil || minutes <= 0 {
		return 60 * time.Minute
	}
	return time.Duration(minutes) * time.Minute
}

func nextSessionExpiry() time.Time {
	return time.Now().UTC().Add(sessionIdleTimeout())
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
	a := &app{
		kvcBase:      kvcBase,
		db:           db,
		mintTreasury: getenv("WALLET_MINT_TREASURY_ADDRESS", "kvp:demo:user1"),
		burnSink:     getenv("WALLET_BURN_SINK_ADDRESS", "kvp:burn:sink"),
	}

	mux := http.NewServeMux()

loggedMux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("[REQUEST] %s %s", r.Method, r.URL.Path)
		mux.ServeHTTP(w, r)
		log.Printf("[RESPONSE] %s %s - %v", r.Method, r.URL.Path, time.Since(start))
	})

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
	mux.HandleFunc("GET /api/auth/session/events/", a.getSessionEvents)
	mux.HandleFunc("GET /api/auth/me", a.me)
	mux.HandleFunc("POST /api/auth/account/add", a.addAccount)
	mux.HandleFunc("POST /api/auth/credential/register", a.registerCredential)
	mux.HandleFunc("GET /api/minting/policy", a.mintingPolicy)
	mux.HandleFunc("POST /api/minting/request", a.mintingRequest)
	mux.HandleFunc("POST /api/burning/request", a.burningRequest)
	mux.HandleFunc("GET /api/activity/session/", a.activityBySession)

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

	handler := withCORS(loggedMux)
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
		`create table if not exists session_events (event_id integer primary key autoincrement,session_id text not null,user_id text not null,event_type text not null,detail text,created_at timestamptz not null default current_timestamp)`,
		`create table if not exists webauthn_credentials (credential_id text primary key,user_id text not null references users(user_id) on delete cascade,public_key text not null,created_at timestamptz not null default current_timestamp)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

func (a *app) recordSessionEvent(sessionID, userID, eventType, detail string) {
	_, err := a.db.Exec(
		`insert into session_events(session_id,user_id,event_type,detail) values(?,?,?,?)`,
		sessionID,
		userID,
		eventType,
		detail,
	)
	if err != nil {
		log.Printf("session event insert failed: %v", err)
	}
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
	exp := nextSessionExpiry()
	if _, err := tx.ExecContext(ctx, `insert into sessions(session_id,user_id,token_hash,expires_at) values(?,?,?,?)`, sessionID, userID, hashString(sessionID), exp.Format(time.RFC3339)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to create session"})
		return
	}
	a.recordSessionEvent(sessionID, userID, "created", "signup")
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
	exp := nextSessionExpiry()
	if _, err := a.db.ExecContext(ctx, `insert into sessions(session_id,user_id,token_hash,expires_at) values(?,?,?,?)`, sessionID, userID, hashString(sessionID), exp.Format(time.RFC3339)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "session create failure"})
		return
	}
	a.recordSessionEvent(sessionID, userID, "created", "login")
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
	var expiresRaw string
	err := a.db.QueryRow(`select user_id, expires_at from sessions where session_id=?`, sessionID).Scan(&userID, &expiresRaw)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "session not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "session query failure"})
		return
	}
	expires, err := parseSessionExpiry(expiresRaw)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "session expiry parse failure"})
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

func (a *app) getSessionEvents(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/api/auth/session/events/"))
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "session id required"})
		return
	}
	rows, err := a.db.Query(
		`select event_id, session_id, user_id, event_type, coalesce(detail,''), coalesce(created_at,'') from session_events where session_id=? order by event_id desc limit 100`,
		sessionID,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "session events query failure"})
		return
	}
	defer rows.Close()
	events := []sessionEvent{}
	for rows.Next() {
		var e sessionEvent
		if rows.Scan(&e.EventID, &e.SessionID, &e.UserID, &e.EventType, &e.Detail, &e.CreatedAt) == nil {
			events = append(events, e)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessionId": sessionID, "events": events})
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
	var expiresRaw string
	err := a.db.QueryRow(`select user_id, expires_at from sessions where session_id=?`, sessionID).Scan(&userID, &expiresRaw)
	if err != nil {
		a.recordSessionEvent(sessionID, "", "invalid", "session lookup failed")
		return "", errors.New("invalid session")
	}
	expires, err := parseSessionExpiry(expiresRaw)
	if err != nil {
		a.recordSessionEvent(sessionID, userID, "invalid", "expiry parse failed")
		return "", errors.New("invalid session")
	}
	if time.Now().UTC().After(expires) {
		a.recordSessionEvent(sessionID, userID, "expired", "idle timeout reached")
		return "", errors.New("session expired")
	}
	// Sliding session: keep session alive while there is valid activity.
	renewedExpiry := nextSessionExpiry().Format(time.RFC3339)
	if _, err := a.db.Exec(`update sessions set expires_at=? where session_id=? and user_id=?`, renewedExpiry, sessionID, userID); err != nil {
		return "", errors.New("session refresh failed")
	}
	a.recordSessionEvent(sessionID, userID, "renewed", "valid activity")
	return userID, nil
}

func parseSessionExpiry(raw string) (time.Time, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return time.Time{}, errors.New("empty expiry")
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05-07:00",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, v); err == nil {
			return parsed.UTC(), nil
		}
	}
	return time.Time{}, errors.New("unsupported expiry format")
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
	policy, warning := a.fetchWalletPolicy()
	status := "disabled"
	note := "Minting is disabled by active chain policy."
	if policy.Active.MintEnabled {
		status = "active"
		note = "Minting is active and routed to onchain treasury transfer."
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      status,
		"scope":       "wallet-minting",
		"policyHash":  policy.Active.PolicyHash,
		"stage":       policy.Active.Stage,
		"mintEnabled": policy.Active.MintEnabled,
		"apiReady":    true,
		"chainReady":  true,
		"note":        note,
		"warning":     warning,
	})
}

func (a *app) mintingRequest(w http.ResponseWriter, r *http.Request) {
	var req mintRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid payload"})
		return
	}
	userID, err := a.requireSession(req.SessionID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": err.Error()})
		return
	}
	assetInput := strings.TrimSpace(req.Asset)
	if assetInput == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "asset is required"})
		return
	}
	asset := assetInput
	switch strings.ToLower(assetInput) {
	case "tkvc":
		asset = "tKVC"
	case "kvc":
		asset = "KVC"
	}
	amount := strings.TrimSpace(req.Amount)
	if amount == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "amount is required"})
		return
	}
	var targetAddress string
	if err := a.db.QueryRow(
		`select address from wallet_accounts where user_id=? order by created_at asc limit 1`,
		userID,
	).Scan(&targetAddress); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "wallet account not found"})
		return
	}
	policyEnforced := strings.EqualFold(getenv("WALLET_POLICY_ENFORCEMENT", "false"), "true")
	policy, policyWarning := a.fetchWalletPolicy()
	if policyEnforced && !policy.Active.MintEnabled {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":      "minting disabled by active policy",
			"policyHash": policy.Active.PolicyHash,
			"stage":      policy.Active.Stage,
		})
		return
	}

	payload := transferPayload{
		From:   a.mintTreasury,
		To:     targetAddress,
		Asset:  asset,
		Amount: amount,
	}
	body, code, err := proxyRequest(
		http.MethodPost,
		fmt.Sprintf("%s/gateway/tx/simulate-transfer?mode=api", a.kvcBase),
		payload,
	)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	if code != http.StatusOK {
		writeRawJSON(w, code, body)
		return
	}
	var tx transferResult
	if err := json.Unmarshal(body, &tx); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "invalid mint tx payload"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":          tx.Status,
		"asset":           asset,
		"amount":          amount,
		"to":              targetAddress,
		"txHash":          tx.TxHash,
		"note":            "Minting executed via onchain treasury transfer.",
		"treasury":        a.mintTreasury,
		"policyHash":      policy.Active.PolicyHash,
		"policyStage":     policy.Active.Stage,
		"mintEnabled":     policy.Active.MintEnabled,
		"policyEnforced":  policyEnforced,
		"policyWarning":   policyWarning,
	})
}

func (a *app) burningRequest(w http.ResponseWriter, r *http.Request) {
	var req burnRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid payload"})
		return
	}
	userID, err := a.requireSession(req.SessionID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": err.Error()})
		return
	}
	assetInput := strings.TrimSpace(req.Asset)
	if assetInput == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "asset is required"})
		return
	}
	asset := assetInput
	switch strings.ToLower(assetInput) {
	case "tkvc":
		asset = "tKVC"
	case "kvc":
		asset = "KVC"
	}
	amount := strings.TrimSpace(req.Amount)
	if amount == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "amount is required"})
		return
	}
	var fromAddress string
	if err := a.db.QueryRow(
		`select address from wallet_accounts where user_id=? order by created_at asc limit 1`,
		userID,
	).Scan(&fromAddress); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "wallet account not found"})
		return
	}
	policyEnforced := strings.EqualFold(getenv("WALLET_POLICY_ENFORCEMENT", "false"), "true")
	policy, policyWarning := a.fetchWalletPolicy()
	if policyEnforced && !policy.Active.BurnEnabled {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":      "burning disabled by active policy",
			"policyHash": policy.Active.PolicyHash,
			"stage":      policy.Active.Stage,
		})
		return
	}
	payload := transferPayload{
		From:   fromAddress,
		To:     a.burnSink,
		Asset:  asset,
		Amount: amount,
	}
	body, code, err := proxyRequest(
		http.MethodPost,
		fmt.Sprintf("%s/gateway/tx/simulate-transfer?mode=api", a.kvcBase),
		payload,
	)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	if code != http.StatusOK {
		writeRawJSON(w, code, body)
		return
	}
	var tx transferResult
	if err := json.Unmarshal(body, &tx); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "invalid burn tx payload"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":          tx.Status,
		"asset":           asset,
		"amount":          amount,
		"from":            fromAddress,
		"txHash":          tx.TxHash,
		"note":            "Burning executed via onchain transfer to burn sink.",
		"burnSink":        a.burnSink,
		"policyHash":      policy.Active.PolicyHash,
		"policyStage":     policy.Active.Stage,
		"burnEnabled":     policy.Active.BurnEnabled,
		"policyEnforced":  policyEnforced,
		"policyWarning":   policyWarning,
	})
}

func (a *app) activityBySession(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/api/activity/session/"))
	userID, err := a.requireSession(sessionID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": err.Error()})
		return
	}
	rows, err := a.db.Query(`select address from wallet_accounts where user_id=?`, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "accounts query failure"})
		return
	}
	defer rows.Close()
	owned := map[string]bool{}
	for rows.Next() {
		var addr string
		if rows.Scan(&addr) == nil {
			owned[addr] = true
		}
	}
	body, code, err := proxyRequest(http.MethodGet, fmt.Sprintf("%s/gateway/tx/recent?mode=api", a.kvcBase), nil)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	if code != http.StatusOK {
		writeRawJSON(w, code, body)
		return
	}
	var txs []recentTx
	if err := json.Unmarshal(body, &txs); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "invalid tx payload"})
		return
	}
	out := make([]recentTx, 0, len(txs))
	for _, tx := range txs {
		if owned[tx.From] || owned[tx.To] {
			out = append(out, tx)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sessionId":    sessionID,
		"walletCount":  len(owned),
		"activityCount": len(out),
		"items":        out,
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
