package license

import (
	"net/http"
	"strings"
)

// ExtractDomain extracts domain from HTTP request
func ExtractDomain(r *http.Request) string {
	domain := r.Header.Get("X-Forwarded-Host")
	if domain != "" {
		return NormalizeDomain(domain)
	}

	domain = r.Header.Get("X-Real-IP")
	if domain != "" {
		return NormalizeDomain(domain)
	}

	domain = r.Host
	if domain != "" {
		host, _, err := splitHostPort(domain)
		if err == nil {
			return NormalizeDomain(host)
		}
		return NormalizeDomain(domain)
	}

	return ""
}

func splitHostPort(hostport string) (string, string, error) {
	colonIndex := strings.LastIndex(hostport, ":")
	if colonIndex != -1 {
		return hostport[:colonIndex], hostport[colonIndex+1:], nil
	}
	return hostport, "", nil
}

// NormalizeDomain normalizes a domain string by trimming whitespace and converting to lowercase
func NormalizeDomain(domain string) string {
	domain = strings.TrimSpace(domain)
	domain = strings.ToLower(domain)
	return domain
}
