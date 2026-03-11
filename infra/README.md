# Hive Worker Orchestration

Kubernetes Operator and infrastructure for Hive worker orchestration (K3s, JuiceFS, DragonflyDB, GitOps).

## Development Environment (Windows + WSL2)

All operator, worker, and K8s tooling are Linux-native. On Windows 10/11 use **WSL2**:

| Tool | Windows | WSL2 | Notes |
|------|---------|------|-------|
| Go | Yes | Yes | Use WSL2 for kubebuilder and envtest |
| kubebuilder | No | **Yes** | Linux-only; scaffolding runs in WSL2 |
| envtest | No | **Yes** | etcd + kube-apiserver binaries are Linux-only |
| kind | No | **Yes** | Requires Linux Docker socket |
| Docker | Via Docker Desktop (WSL2 backend) | Implicit | Use WSL2 backend |
| kubectl | Yes | Yes | Native Windows binary can target WSL2 kind |
| Shell scripts | No | **Yes** | `.sh` scripts require bash (WSL2 or Git Bash) |

**Recommended**: Clone the repo inside WSL2 (`/home/<user>/...`) for native I/O. Run all `make` targets from WSL2.

### One-time WSL2 setup

```bash
wsl --install -d Ubuntu-22.04
# Inside WSL2:
sudo apt update && sudo apt install -y build-essential curl
# Go: https://go.dev/dl/ (e.g. go1.26.1.linux-amd64.tar.gz)
# kubebuilder: https://book.kubebuilder.io/quick-start#installation
# kind: go install sigs.k8s.io/kind@latest
# Docker: Docker Desktop with WSL2 integration
```

### First integration test run

`make -C operator test-integration` downloads ~200MB of envtest binaries (etcd + kube-apiserver) into `$KUBEBUILDER_ASSETS`. This is one-time; subsequent runs use the cache.

## Quick start (from WSL2)

```bash
cd infra
make check-env    # Fails with instructions if not Linux/WSL
make ci           # Lint, unit tests, integration tests, build, scan
```

## Layout

- `operator/` – Go kubebuilder operator (HiveCluster, HiveCompany, HiveWorkerPool CRDs)
- `worker/` – Go HTTP worker image (/run, /health, /metrics)
- `e2e/` – E2E tests (kind cluster, mock control plane)
- `manifests/` – CRDs, storage (MinIO, Dragonfly, JuiceFS), operator Deployment, observability
- `cluster/` – GitOps (ArgoCD app-of-apps, tenant CRs)
- `scripts/` – bootstrap-vps.sh, join-desktop.sh, create-tenant.sh
- `.github/workflows/` – CI (hive-ci.yml)
