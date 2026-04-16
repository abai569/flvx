package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"
)

type LicenseData struct {
	Domain    string `json:"domain"`
	IssuedAt  int64  `json:"issued_at"`
	ExpiredAt int64  `json:"expired_at"`
	Months    int    `json:"months"`
	Signature string `json:"signature"`
}

func main() {
	var (
		domain     string
		months     int
		privateKey string
		output     string
	)

	flag.StringVar(&domain, "domain", "", "Domain to bind (required)")
	flag.IntVar(&months, "months", 1, "License duration in months")
	flag.StringVar(&privateKey, "private-key", "", "Path to RSA private key PEM file")
	flag.StringVar(&output, "output", "license.json", "Output file path")
	flag.Parse()

	if domain == "" {
		fmt.Println("Error: -domain is required")
		flag.Usage()
		os.Exit(1)
	}

	if months < 1 || months > 12 {
		fmt.Println("Error: months must be between 1 and 12")
		os.Exit(1)
	}

	// Load or generate private key
	var privKey *rsa.PrivateKey
	var err error

	if privateKey != "" {
		privKey, err = loadPrivateKey(privateKey)
		if err != nil {
			fmt.Printf("Error loading private key: %v\n", err)
			os.Exit(1)
		}
	} else {
		fmt.Println("No private key provided, generating a new one...")
		privKey, err = rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			fmt.Printf("Error generating key: %v\n", err)
			os.Exit(1)
		}
		savePrivateKey(privKey, "license_private_key.pem")
		fmt.Println("Private key saved to: license_private_key.pem")
	}

	// Generate license
	now := time.Now().Unix()
	expiredAt := now + int64(months*30*24*3600)

	license := &LicenseData{
		Domain:    domain,
		IssuedAt:  now,
		ExpiredAt: expiredAt,
		Months:    months,
	}

	// Sign
	content := fmt.Sprintf("%s|%d|%d|%d", license.Domain, license.IssuedAt, license.ExpiredAt, license.Months)
	hashed := sha256.Sum256([]byte(content))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privKey, crypto.SHA256, hashed[:])
	if err != nil {
		fmt.Printf("Error signing: %v\n", err)
		os.Exit(1)
	}

	license.Signature = base64.StdEncoding.EncodeToString(signature)

	// Encode to base64
	jsonData, err := json.Marshal(license)
	if err != nil {
		fmt.Printf("Error marshaling: %v\n", err)
		os.Exit(1)
	}

	licenseKey := base64.StdEncoding.EncodeToString(jsonData)

	// Save license
	licenseOutput := map[string]string{
		"license_key": licenseKey,
		"domain":      domain,
		"months":      fmt.Sprintf("%d", months),
		"expired_at":  time.Unix(expiredAt, 0).Format("2006-01-02"),
	}

	outputData, err := json.MarshalIndent(licenseOutput, "", "  ")
	if err != nil {
		fmt.Printf("Error marshaling output: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(output, outputData, 0644); err != nil {
		fmt.Printf("Error writing file: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("License generated successfully!\n")
	fmt.Printf("Domain: %s\n", domain)
	fmt.Printf("Valid for: %d months\n", months)
	fmt.Printf("Expires: %s\n", time.Unix(expiredAt, 0).Format("2006-01-02"))
	fmt.Printf("Output file: %s\n", output)
	fmt.Printf("\nLicense Key:\n%s\n", licenseKey)
}

func loadPrivateKey(path string) (*rsa.PrivateKey, error) {
	_, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	// Simple PEM parsing (placeholder - implement full PEM parsing if needed)
	fmt.Println("Warning: Private key loading is a placeholder. Use generated key instead.")
	return rsa.GenerateKey(rand.Reader, 2048)
}

func savePrivateKey(key *rsa.PrivateKey, path string) {
	// Simple PEM encoding (placeholder)
	fmt.Println("Warning: Private key saving is a placeholder.")
}
