module github.com/jordiparracrespo/flama-ai/apps/runner

go 1.25.0

toolchain go1.25.14

require (
	github.com/coder/websocket v1.8.15
	github.com/jackc/pgx/v5 v5.9.2
	github.com/jordiparracrespo/flama-ai/packages/go/auth v0.0.0
	github.com/jordiparracrespo/flama-ai/packages/go/config v0.0.0
	github.com/jordiparracrespo/flama-ai/packages/go/core v0.0.0
	github.com/jordiparracrespo/flama-ai/packages/go/health v0.0.0
	github.com/jordiparracrespo/flama-ai/packages/go/httpx v0.0.0
	github.com/jordiparracrespo/flama-ai/packages/go/postgres v0.0.0
	github.com/jordiparracrespo/flama-ai/packages/go/ws v0.0.0
)

require (
	github.com/golang-jwt/jwt/v5 v5.3.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/text v0.41.0 // indirect
)

replace (
	github.com/jordiparracrespo/flama-ai/packages/go/auth => ../../packages/go/auth
	github.com/jordiparracrespo/flama-ai/packages/go/config => ../../packages/go/config
	github.com/jordiparracrespo/flama-ai/packages/go/core => ../../packages/go/core
	github.com/jordiparracrespo/flama-ai/packages/go/health => ../../packages/go/health
	github.com/jordiparracrespo/flama-ai/packages/go/httpx => ../../packages/go/httpx
	github.com/jordiparracrespo/flama-ai/packages/go/postgres => ../../packages/go/postgres
	github.com/jordiparracrespo/flama-ai/packages/go/ws => ../../packages/go/ws
)
