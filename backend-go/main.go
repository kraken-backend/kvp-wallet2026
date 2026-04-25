package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type walletResponse struct {
	Address  string `json:"address"`
	Nonce    int64  `json:"nonce"`
	Balances []struct {
		Asset  string `json:"asset"`
		Amount string `json:"amount"`
	} `json:"balances"`
}

func main() {
	kvcBase := getenv("KVC_API_BASE", "http://localhost:8090")
	port := getenv("PORT", "8088")

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":        true,
			"service":   "wallet-kvp-backend",
			"kvcBase":   kvcBase,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	mux.HandleFunc("GET /api/kvc/status", func(w http.ResponseWriter, r *http.Request) {
		body, code, err := proxyRequest(http.MethodGet, fmt.Sprintf("%s/gateway/status?mode=api", kvcBase), nil)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
			return
		}
		writeRawJSON(w, code, body)
	})

	mux.HandleFunc("GET /api/kvc/wallet/", func(w http.ResponseWriter, r *http.Request) {
		address := strings.TrimPrefix(r.URL.Path, "/api/kvc/wallet/")
		address = strings.TrimSpace(address)
		if address == "" || !strings.HasPrefix(address, "kvp:") {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "address must use kvp: prefix"})
			return
		}

		target := fmt.Sprintf("%s/gateway/wallet/%s?mode=api", kvcBase, address)
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
		from, _ := payload["from"].(string)
		to, _ := payload["to"].(string)
		asset, _ := payload["asset"].(string)

		if !strings.HasPrefix(from, "kvp:") || !strings.HasPrefix(to, "kvp:") {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "from/to must use kvp: address"})
			return
		}
		if asset != "tKVC" && asset != "KVC" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "asset must be tKVC or KVC"})
			return
		}

		target := fmt.Sprintf("%s/gateway/tx/simulate-transfer?mode=api", kvcBase)
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
