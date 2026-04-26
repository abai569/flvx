package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go-backend/internal/app"
	"go-backend/internal/config"
	"go-backend/internal/middleware"
)

func main() {
	cfg := config.FromEnv()
	if cfg.JWTSecret == "" {
		log.Println("warning: JWT_SECRET is empty")
	}
	
	// 授权验证
	if cfg.LicenseServerURL != "" && cfg.LicenseKey != "" {
		log.Printf("🔐 开始验证授权...")
		domain := middleware.GetServerDomain()
		if err := middleware.StartLicenseVerification(cfg.LicenseServerURL, cfg.LicenseKey, domain); err != nil {
			log.Printf("⚠️  授权验证失败：%v", err)
		} else {
			valid, expireTime, reason := middleware.GetLicenseState()
			if valid {
				log.Printf("✅ 授权验证成功，有效期至：%s", time.UnixMilli(expireTime).Format("2006-01-02"))
			} else {
				log.Printf("⚠️  授权无效：%s", reason)
			}
		}
	} else {
		log.Println("⚠️  未配置授权服务，跳过验证")
	}
	
	log.Printf("starting go-backend on %s (db=%s)", cfg.Addr, cfg.DBPath)

	a, err := app.New(cfg)
	if err != nil {
		log.Fatalf("failed to create app: %v", err)
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- a.Run()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		log.Printf("received signal %s, shutting down", sig)
	case runErr := <-errCh:
		if runErr != nil && !errors.Is(runErr, http.ErrServerClosed) {
			log.Fatalf("server stopped unexpectedly: %v", runErr)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := a.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown failed: %v", err)
	}
}
