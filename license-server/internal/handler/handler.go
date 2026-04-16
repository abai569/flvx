package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"license-server/internal/license"
)

type Handler struct {
	Generator  *license.Generator
	Storage    license.Storage
	KeyManager *license.KeyManager
	AdminToken string
}

// NewRouter creates a new HTTP router
func NewRouter(h *Handler) *http.ServeMux {
	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/v1/generate", adminAuth(h.AdminToken, h.generateLicense))
	mux.HandleFunc("/api/v1/list", adminAuth(h.AdminToken, h.listLicenses))
	mux.HandleFunc("/api/v1/revoke", adminAuth(h.AdminToken, h.revokeLicense))
	mux.HandleFunc("/api/v1/reactivate", adminAuth(h.AdminToken, h.reactivateLicense))
	mux.HandleFunc("/api/v1/stats", adminAuth(h.AdminToken, h.getStats))
	mux.HandleFunc("/api/v1/public-key", h.getPublicKey)

	return mux
}

func adminAuth(token string, handler func(http.ResponseWriter, *http.Request)) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if token != "" {
			authToken := r.Header.Get("X-Admin-Token")
			if authToken != token {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
		}
		handler(w, r)
	}
}

func (h *Handler) generateLicense(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Domain string `json:"domain"`
		Months int    `json:"months"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	result, err := h.Generator.Generate(req.Domain, req.Months)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    result,
	})
}

func (h *Handler) listLicenses(w http.ResponseWriter, r *http.Request) {
	licenses, err := h.Storage.GetAll()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"licenses": licenses,
	})
}

func (h *Handler) revokeLicense(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	if err := h.Generator.Revoke(uint(id)); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func (h *Handler) reactivateLicense(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	if err := h.Generator.Reactivate(uint(id)); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func (h *Handler) getStats(w http.ResponseWriter, r *http.Request) {
	count, err := h.Storage.Count()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	licenses, err := h.Storage.GetAll()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	activeCount := 0
	revokedCount := 0
	for _, lic := range licenses {
		if lic.Status == 1 {
			activeCount++
		} else {
			revokedCount++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"stats": map[string]interface{}{
			"total":   count,
			"active":  activeCount,
			"revoked": revokedCount,
		},
	})
}

func (h *Handler) getPublicKey(w http.ResponseWriter, r *http.Request) {
	pubKey, err := h.KeyManager.GetPublicKeyPEM()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"public_key": pubKey,
	})
}
