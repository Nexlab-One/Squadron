// Package e2e holds end-to-end tests that require a kind cluster.
// Run from infra/e2e with: E2E_KIND=1 make -C e2e test
// TestMain runs all tests; when E2E_KIND is not set, individual tests skip.
package e2e

import (
	"os"
	"os/exec"
	"testing"
)

func TestMain(m *testing.M) {
	code := m.Run()
	os.Exit(code)
}

// TestE2EClusterReachable verifies kubectl can talk to the cluster when E2E_KIND=1.
// Run this first via make; if it fails, kind cluster or kubeconfig is missing.
func TestE2EClusterReachable(t *testing.T) {
	if os.Getenv("E2E_KIND") == "" {
		t.Skip("set E2E_KIND=1 to run e2e tests")
	}
	out, err := exec.Command("kubectl", "get", "namespace", "default", "-o=name").CombinedOutput()
	if err != nil {
		t.Fatalf("cluster not reachable (is kind up?): %v, %s", err, out)
	}
	if string(out) != "namespace/default\n" {
		t.Errorf("unexpected kubectl output: %s", out)
	}
}
