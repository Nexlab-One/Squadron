# E2E tests: kind cluster, deploy operator + mock control plane, run tests.
# Requires: kind, Docker, kubectl. Run from Linux/WSL2.

SHELL := /bin/bash
KIND_CLUSTER ?= hive-e2e
OPERATOR_IMG ?= hive-operator:latest
WORKER_IMG ?= hive-worker:latest
MOCK_IMG ?= mock-controlplane:latest

.PHONY: test
test: kind-create kind-load deploy run-tests

.PHONY: kind-create
kind-create:
	kind create cluster --name $(KIND_CLUSTER) --wait 2m || true

.PHONY: kind-load
kind-load:
	kind load docker-image $(OPERATOR_IMG) --name $(KIND_CLUSTER)
	kind load docker-image $(WORKER_IMG) --name $(KIND_CLUSTER)
	kind load docker-image $(MOCK_IMG) --name $(KIND_CLUSTER)

.PHONY: deploy
deploy: crds
	kubectl apply -f ../manifests/crds/
	kubectl create namespace hive-system --dry-run=client -o yaml | kubectl apply -f -
	kubectl apply -f testdata/mock-controlplane-deployment.yaml
	kubectl apply -f ../manifests/operator/deployment.yaml
	kubectl apply -f testdata/fixtures/

.PHONY: crds
crds:
	$(MAKE) -C .. crds

.PHONY: run-tests
run-tests:
	go test -v -timeout 10m ./...

.PHONY: clean
clean:
	kind delete cluster --name $(KIND_CLUSTER) 2>/dev/null || true
