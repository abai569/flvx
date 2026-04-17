package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"license-server/internal/handler"
	"license-server/internal/license"
	"license-server/internal/middleware"
)

func main() {
	var (
		addr       string
		dataDir    string
		configDir  string
		adminToken string
	)

	flag.StringVar(&addr, "addr", ":8080", "Server listen address")
	flag.StringVar(&dataDir, "data", "./data", "Data directory for SQLite database")
	flag.StringVar(&configDir, "config", "./config", "Config directory for RSA keys")
	flag.StringVar(&adminToken, "admin-token", "", "Admin authentication token (auto-generated if empty)")
	flag.Parse()

	// Ensure directories exist
	for _, dir := range []string{dataDir, configDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Fatalf("Failed to create directory %s: %v", dir, err)
		}
	}

	// Initialize storage
	dbPath := filepath.Join(dataDir, "licenses.db")
	storage, err := license.NewSQLiteStorage(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	log.Printf("Database initialized at %s", dbPath)

	// Initialize key manager
	keyManager, err := license.NewKeyManager(filepath.Join(configDir, "private_key.pem"))
	if err != nil {
		log.Fatalf("Failed to initialize key manager: %v", err)
	}
	log.Printf("RSA keys initialized")

	// Initialize generator
	generator := license.NewGenerator(storage, keyManager)

	// Initialize handlers
	h := &handler.Handler{
		Generator:  generator,
		Storage:    storage,
		KeyManager: keyManager,
		AdminToken: adminToken,
	}

	// Setup router
	router := handler.NewRouter(h)

	// Create main mux with static file serving
	mux := http.NewServeMux()
	mux.Handle("/", router)

	// Serve static files
	staticDir := "./static"
	if _, err := os.Stat(staticDir); err == nil {
		mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))
	}

	log.Printf("Starting license server on %s", addr)
	if err := http.ListenAndServe(addr, middleware.Logger(mux)); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
