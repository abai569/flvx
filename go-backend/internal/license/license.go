package license

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// LicenseData represents the decoded license payload
type LicenseData struct {
	Domain    string `json:"domain"`
	IssuedAt  int64  `json:"issued_at"`
	ExpiredAt int64  `json:"expired_at"`
	Months    int    `json:"months"`
	Signature string `json:"signature"`
}

// ValidateResult represents the result of license validation
type ValidateResult struct {
	Valid         bool
	Domain        string
	ExpiredAt     int64
	DaysRemaining int64
	Status        int // 0=invalid, 1=active, 2=expired
}

var (
	ErrInvalidFormat    = errors.New("invalid license format")
	ErrInvalidSignature = errors.New("invalid license signature")
	ErrExpired          = errors.New("license expired")
	ErrDomainMismatch   = errors.New("domain mismatch")
)

// ParseLicense decodes and validates a license key
func ParseLicense(licenseKey string) (*LicenseData, error) {
	data, err := base64.StdEncoding.DecodeString(licenseKey)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidFormat, err)
	}

	var license LicenseData
	if err := json.Unmarshal(data, &license); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidFormat, err)
	}

	return &license, nil
}

// VerifySignature verifies the RSA signature of the license
func VerifySignature(license *LicenseData, pubKey *rsa.PublicKey) error {
	content := fmt.Sprintf("%s|%d|%d|%d",
		license.Domain,
		license.IssuedAt,
		license.ExpiredAt,
		license.Months,
	)

	hashed := sha256.Sum256([]byte(content))

	signature, err := base64.StdEncoding.DecodeString(license.Signature)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidSignature, err)
	}

	if err := rsa.VerifyPKCS1v15(pubKey, crypto.SHA256, hashed[:], signature); err != nil {
		return ErrInvalidSignature
	}

	return nil
}

// ValidateLicense performs full validation of a license
func ValidateLicense(license *LicenseData, currentDomain string, pubKey *rsa.PublicKey) (*ValidateResult, error) {
	if err := VerifySignature(license, pubKey); err != nil {
		return nil, err
	}

	now := time.Now().Unix()

	result := &ValidateResult{
		Domain:    license.Domain,
		ExpiredAt: license.ExpiredAt,
	}

	if now > license.ExpiredAt {
		result.Status = 2
		result.Valid = false
		return result, ErrExpired
	}

	if !ValidateDomain(license.Domain, currentDomain) {
		result.Status = 0
		result.Valid = false
		return result, ErrDomainMismatch
	}

	result.DaysRemaining = (license.ExpiredAt - now) / 86400
	result.Status = 1
	result.Valid = true

	return result, nil
}

// ValidateDomain checks if the license domain matches the request domain
func ValidateDomain(licenseDomain, requestDomain string) bool {
	licenseDomain = NormalizeDomain(licenseDomain)
	requestDomain = NormalizeDomain(requestDomain)

	if licenseDomain == requestDomain {
		return true
	}

	if len(licenseDomain) > 2 && strings.HasPrefix(licenseDomain, "*.") {
		suffix := licenseDomain[1:]
		if len(requestDomain) > len(suffix) && strings.HasSuffix(requestDomain, suffix) {
			return true
		}
	}

	return false
}

// NormalizeDomain normalizes a domain string
func NormalizeDomain(domain string) string {
	domain = strings.TrimSpace(domain)
	domain = strings.ToLower(domain)
	return domain
}

// GenerateLicense creates a new license (used by license-gen tool)
func GenerateLicense(domain string, months int, privKey *rsa.PrivateKey) (string, error) {
	now := time.Now().Unix()
	expiredAt := now + int64(months*30*24*3600)

	license := &LicenseData{
		Domain:    domain,
		IssuedAt:  now,
		ExpiredAt: expiredAt,
		Months:    months,
	}

	content := fmt.Sprintf("%s|%d|%d|%d",
		license.Domain,
		license.IssuedAt,
		license.ExpiredAt,
		license.Months,
	)

	hashed := sha256.Sum256([]byte(content))

	signature, err := rsa.SignPKCS1v15(rand.Reader, privKey, crypto.SHA256, hashed[:])
	if err != nil {
		return "", fmt.Errorf("sign license failed: %v", err)
	}

	license.Signature = base64.StdEncoding.EncodeToString(signature)

	data, err := json.Marshal(license)
	if err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(data), nil
}
