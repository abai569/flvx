package license

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// License represents a generated license
type License struct {
	ID         uint   `gorm:"primaryKey"`
	Domain     string `gorm:"uniqueIndex;not null"`
	LicenseKey string `gorm:"type:text;not null"`
	IssuedAt   int64  `gorm:"not null"`
	ExpiredAt  int64  `gorm:"not null"`
	Months     int    `gorm:"not null"`
	Status     int    `gorm:"default:1"` // 1=active, 0=revoked
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// LicenseData represents the license payload
type LicenseData struct {
	Domain    string `json:"domain"`
	IssuedAt  int64  `json:"issued_at"`
	ExpiredAt int64  `json:"expired_at"`
	Months    int    `json:"months"`
	Signature string `json:"signature"`
}

// Storage defines the interface for license persistence
type Storage interface {
	Save(license *License) error
	GetByDomain(domain string) (*License, error)
	GetAll() ([]License, error)
	GetByID(id uint) (*License, error)
	Update(license *License) error
	Count() (int64, error)
}

// SQLiteStorage implements Storage using SQLite
type SQLiteStorage struct {
	db *gorm.DB
}

// NewSQLiteStorage creates a new SQLite storage
func NewSQLiteStorage(dbPath string) (*SQLiteStorage, error) {
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.AutoMigrate(&License{}); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	return &SQLiteStorage{db: db}, nil
}

func (s *SQLiteStorage) Save(license *License) error {
	return s.db.Create(license).Error
}

func (s *SQLiteStorage) GetByDomain(domain string) (*License, error) {
	var license License
	err := s.db.Where("domain = ?", domain).First(&license).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &license, err
}

func (s *SQLiteStorage) GetAll() ([]License, error) {
	var licenses []License
	err := s.db.Order("created_at DESC").Find(&licenses).Error
	return licenses, err
}

func (s *SQLiteStorage) GetByID(id uint) (*License, error) {
	var license License
	err := s.db.First(&license, id).Error
	return &license, err
}

func (s *SQLiteStorage) Update(license *License) error {
	return s.db.Save(license).Error
}

func (s *SQLiteStorage) Count() (int64, error) {
	var count int64
	err := s.db.Model(&License{}).Count(&count).Error
	return count, err
}

// KeyManager handles RSA key operations
type KeyManager struct {
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	path       string
	mu         sync.RWMutex
}

// NewKeyManager creates or loads an RSA key pair
func NewKeyManager(path string) (*KeyManager, error) {
	km := &KeyManager{path: path}

	// Try to load existing key
	if _, err := os.Stat(path); err == nil {
		if err := km.loadKey(path); err != nil {
			return nil, fmt.Errorf("failed to load key: %w", err)
		}
	} else {
		// Generate new key
		if err := km.generateKey(path); err != nil {
			return nil, fmt.Errorf("failed to generate key: %w", err)
		}
	}

	return km, nil
}

func (km *KeyManager) generateKey(path string) error {
	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}

	km.privateKey = privKey
	km.publicKey = &privKey.PublicKey

	// Save to file (PEM format)
	privBytes := x509.MarshalPKCS1PrivateKey(privKey)
	privBlock := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: privBytes,
	}

	privData := pem.EncodeToMemory(privBlock)
	if err := os.WriteFile(path, privData, 0600); err != nil {
		return err
	}

	log.Printf("Generated new RSA key pair and saved to %s", path)
	return nil
}

func (km *KeyManager) loadKey(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	block, _ := pem.Decode(data)
	if block == nil {
		return errors.New("failed to parse PEM block")
	}

	privKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return err
	}

	km.privateKey = privKey
	km.publicKey = &privKey.PublicKey
	return nil
}

func (km *KeyManager) GetPublicKey() *rsa.PublicKey {
	km.mu.RLock()
	defer km.mu.RUnlock()
	return km.publicKey
}

func (km *KeyManager) GetPublicKeyPEM() (string, error) {
	km.mu.RLock()
	defer km.mu.RUnlock()

	pubBytes, err := x509.MarshalPKIXPublicKey(km.publicKey)
	if err != nil {
		return "", err
	}

	pubBlock := &pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubBytes,
	}

	return string(pem.EncodeToMemory(pubBlock)), nil
}

// Generator creates and manages licenses
type Generator struct {
	storage    Storage
	keyManager *KeyManager
}

// NewGenerator creates a new license generator
func NewGenerator(storage Storage, keyManager *KeyManager) *Generator {
	return &Generator{
		storage:    storage,
		keyManager: keyManager,
	}
}

// GenerateResult represents the result of license generation
type GenerateResult struct {
	LicenseKey  string `json:"license_key"`
	Domain      string `json:"domain"`
	Months      int    `json:"months"`
	ExpiredAt   int64  `json:"expired_at"`
	ExpiredDate string `json:"expired_date"`
}

// Generate creates a new license
func (g *Generator) Generate(domain string, months int) (*GenerateResult, error) {
	if months < 1 || months > 12 {
		return nil, errors.New("months must be between 1 and 12")
	}

	// Check if domain already exists
	existing, err := g.storage.GetByDomain(domain)
	if err != nil {
		return nil, err
	}
	if existing != nil && existing.Status == 1 {
		return nil, errors.New("license already exists for this domain")
	}

	now := time.Now().Unix()
	expiredAt := now + int64(months*30*24*3600)

	licenseData := &LicenseData{
		Domain:    domain,
		IssuedAt:  now,
		ExpiredAt: expiredAt,
		Months:    months,
	}

	// Sign the license
	content := fmt.Sprintf("%s|%d|%d|%d", licenseData.Domain, licenseData.IssuedAt, licenseData.ExpiredAt, licenseData.Months)
	hashed := sha256.Sum256([]byte(content))
	signature, err := rsa.SignPKCS1v15(rand.Reader, g.keyManager.privateKey, crypto.SHA256, hashed[:])
	if err != nil {
		return nil, fmt.Errorf("failed to sign: %w", err)
	}

	licenseData.Signature = base64.StdEncoding.EncodeToString(signature)

	// Encode to base64
	data, err := json.Marshal(licenseData)
	if err != nil {
		return nil, err
	}
	licenseKey := base64.StdEncoding.EncodeToString(data)

	// Save to database
	license := &License{
		Domain:     domain,
		LicenseKey: licenseKey,
		IssuedAt:   now,
		ExpiredAt:  expiredAt,
		Months:     months,
		Status:     1,
	}

	if err := g.storage.Save(license); err != nil {
		return nil, err
	}

	return &GenerateResult{
		LicenseKey:  licenseKey,
		Domain:      domain,
		Months:      months,
		ExpiredAt:   expiredAt,
		ExpiredDate: time.Unix(expiredAt, 0).Format("2006-01-02"),
	}, nil
}

// Revoke revokes a license
func (g *Generator) Revoke(id uint) error {
	license, err := g.storage.GetByID(id)
	if err != nil {
		return err
	}
	if license == nil {
		return errors.New("license not found")
	}

	license.Status = 0
	return g.storage.Update(license)
}

// Reactivate reactivates a revoked license
func (g *Generator) Reactivate(id uint) error {
	license, err := g.storage.GetByID(id)
	if err != nil {
		return err
	}
	if license == nil {
		return errors.New("license not found")
	}

	license.Status = 1
	return g.storage.Update(license)
}
