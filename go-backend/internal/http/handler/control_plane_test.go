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
