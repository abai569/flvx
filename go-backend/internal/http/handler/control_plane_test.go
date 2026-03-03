package handler

import (
	"reflect"
	"testing"
)

func TestBuildForwardControlServiceNamesPauseResume(t *testing.T) {
	base := "12_34_56"
	want := []string{base + "_tcp", base + "_udp"}

	for _, command := range []string{"PauseService", "ResumeService"} {
		got := buildForwardControlServiceNames(base, command)
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("command %s expected %v, got %v", command, want, got)
		}
	}
}

func TestBuildForwardControlServiceNamesDelete(t *testing.T) {
	base := "12_34_56"
	want := []string{base, base + "_tcp", base + "_udp"}
	got := buildForwardControlServiceNames(base, " DeleteService ")
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestBuildForwardServiceBaseCandidates(t *testing.T) {
	got := buildForwardServiceBaseCandidates(12, 34, 56, []int64{56, 78, 90})
	want := []string{"12_34_56", "12_34_78", "12_34_90", "12_34_0"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestBuildForwardServiceBaseCandidatesWithZeroPreferred(t *testing.T) {
	got := buildForwardServiceBaseCandidates(12, 34, 0, []int64{78, 0, 90})
	want := []string{"12_34_0", "12_34_78", "12_34_90"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestShouldTryLegacySingleService(t *testing.T) {
	if !shouldTryLegacySingleService("PauseService") {
		t.Fatalf("PauseService should require legacy fallback")
	}
	if !shouldTryLegacySingleService("resumeService") {
		t.Fatalf("ResumeService should require legacy fallback")
	}
	if shouldTryLegacySingleService("DeleteService") {
		t.Fatalf("DeleteService should not require legacy fallback")
	}
}

func TestIsAlreadyExistsMessage(t *testing.T) {
	if !isAlreadyExistsMessage("service demo already exists") {
		t.Fatalf("expected already exists message to be tolerated")
	}
	if !isAlreadyExistsMessage("服务已存在") {
		t.Fatalf("expected Chinese already exists message to be tolerated")
	}
	if isAlreadyExistsMessage("listen tcp [::]:10001: bind: address already in use") {
		t.Fatalf("address already in use must not be treated as already exists")
	}
}

func TestBuildForwardServiceConfigs_UsesBindIPForListen(t *testing.T) {
	forward := &forwardRecord{RemoteAddr: "1.2.3.4:80", Strategy: "fifo", TunnelID: 7}
	node := &nodeRecord{TCPListenAddr: "[::]", UDPListenAddr: "[::]"}
	services := buildForwardServiceConfigs("1_2_0", forward, nil, node, 22000, "10.9.8.7", nil, false)
	if len(services) != 2 {
		t.Fatalf("expected 2 services, got %d", len(services))
	}
	for _, svc := range services {
		addr, _ := svc["addr"].(string)
		if addr != "10.9.8.7:22000" {
			t.Fatalf("expected bind IP address 10.9.8.7:22000, got %q", addr)
		}
	}
}

func TestBuildForwardServiceConfigs_DefaultListenAddrWhenBindIPEmpty(t *testing.T) {
	forward := &forwardRecord{RemoteAddr: "1.2.3.4:80", Strategy: "fifo", TunnelID: 7}
	node := &nodeRecord{TCPListenAddr: "0.0.0.0", UDPListenAddr: "[::]"}
	services := buildForwardServiceConfigs("1_2_0", forward, nil, node, 22001, "", nil, false)
	if len(services) != 2 {
		t.Fatalf("expected 2 services, got %d", len(services))
	}
	tcpAddr, _ := services[0]["addr"].(string)
	udpAddr, _ := services[1]["addr"].(string)
	if tcpAddr != "0.0.0.0:22001" {
		t.Fatalf("expected tcp addr 0.0.0.0:22001, got %q", tcpAddr)
	}
	if udpAddr != "[::]:22001" {
		t.Fatalf("expected udp addr [::]:22001, got %q", udpAddr)
	}
}

func TestBuildForwardServiceConfigs_BindIPAlreadyContainsPort(t *testing.T) {
	forward := &forwardRecord{RemoteAddr: "1.2.3.4:80", Strategy: "fifo", TunnelID: 7}
	node := &nodeRecord{TCPListenAddr: "[::]", UDPListenAddr: "[::]"}
	services := buildForwardServiceConfigs("1_2_0", forward, nil, node, 55555, "3.3.3.3:12345", nil, false)
	if len(services) != 2 {
		t.Fatalf("expected 2 services, got %d", len(services))
	}
	for _, svc := range services {
		addr, _ := svc["addr"].(string)
		if addr != "3.3.3.3:12345" {
			t.Fatalf("expected bind IP with port 3.3.3.3:12345, got %q", addr)
		}
	}
}
