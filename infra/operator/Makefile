# Hive operator Makefile. Run from Linux/WSL2.

SHELL := /bin/bash
UNAME_S := $(shell uname -s 2>/dev/null)
ifeq ($(UNAME_S),Linux)
  # ok
else ifeq ($(UNAME_S),Darwin)
  # ok
else
  $(error "Operator build and tests require Linux or macOS (use WSL2 on Windows)")
endif

# Image
IMG ?= hive-operator:latest

# Get the currently used golang install path
GOROOT := $(shell go env GOROOT 2>/dev/null)
GOBIN := $(shell go env GOBIN 2>/dev/null)
ifeq ($(GOBIN),)
  GOBIN := $(shell go env GOPATH)/bin
endif

.PHONY: all
all: build

.PHONY: lint
lint:
	golangci-lint run ./...

.PHONY: test-unit
test-unit:
	go test ./... -short -race -coverprofile=coverage.out -count=1

.PHONY: test-integration
test-integration:
	go test ./controllers/... -race -count=1

.PHONY: test
test: test-unit test-integration

.PHONY: generate
generate:
	which controller-gen >/dev/null 2>&1 || go install sigs.k8s.io/controller-tools/cmd/controller-gen@v0.13.0
	controller-gen object:headerFile=hack/boilerplate.go.txt paths="./..."
	controller-gen crd webhook rbac:roleName=manager-role output:crd:artifacts:config=config/crd/bases

.PHONY: manifests
manifests:
	which controller-gen >/dev/null 2>&1 || go install sigs.k8s.io/controller-tools/cmd/controller-gen@v0.13.0
	controller-gen crd webhook rbac:roleName=manager-role output:crd:artifacts:config=config/crd/bases

.PHONY: docker-build
docker-build:
	docker build -t $(IMG) .

.PHONY: gosec
gosec:
	which gosec >/dev/null 2>&1 || go install github.com/securego/gosec/v2/cmd/gosec@latest
	gosec ./...

.PHONY: govulncheck
govulncheck:
	which govulncheck >/dev/null 2>&1 || go install golang.org/x/vuln/cmd/govulncheck@latest
	govulncheck ./...

.PHONY: clean
clean:
	go clean -testcache
	rm -f coverage.out
	rm -rf bin/

.PHONY: run
run:
	go run main.go
