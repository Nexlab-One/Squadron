# Hive CRDs

CRDs for HiveCluster, HiveCompany, HiveWorkerPool (API group `hive.io/v1alpha1`).

**Source of truth:** `infra/operator/config/crd/bases/`. After changing the operator schema and regenerating (e.g. `make -C operator generate`), run from infra:

```bash
make crds
```

to copy the generated YAMLs here. E2E and deploy flows apply from this directory.
