# Helm chart

Deploys the API, the consumer web app, Postgres and Redis to a Kubernetes
cluster, each as a Docker container.

## Setup

### 1. Create a cluster

Any Kubernetes cluster with an ingress controller will do.

### 2. Install Helm Charts

```bash
# Add the Flama Helm chart
helm install flama ./helm/flama \
  --set api.image=ghcr.io/your-org/flama-api:latest \
  --set web.image=ghcr.io/your-org/flama-web:latest
```

The release name prefixes every resource, and the API finds Postgres and
Redis through it. `pnpm plugin:add admin-web`, `pnpm plugin:add docs` and
`pnpm plugin:add runner` bring their deployments, values and ingress rules,
added before the chart or after it, and then `adminWeb.image`, `docs.image`
and `runner.image` are settable too.

### 3. Configure Ingress

The chart includes ingress resources for every service it deploys. Configure
each hostname under `ingress.hosts`, set the API's `FRONTEND_URL` and
`BETTER_AUTH_URL` values to match, then point their DNS records to the
cluster's load balancer.

## Scaling

Scale individual services independently:

```bash
kubectl scale deployment flama-api --replicas=3
```
