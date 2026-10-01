---
sidebar_position: 2
---

# Backend Packages

The backend is split into reusable packages under `packages/backend/`. Each follows a **pluggable service pattern**: an abstract class defines the interface, concrete implementations provide behavior, and a `@Global` DynamicModule with a factory reads config to select the active implementation at runtime.

## `@flama/backend-core`

Cross-cutting concerns shared across all NestJS apps.

| Export                                      | Purpose                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `AppError`                                  | Catalog error — an `HttpException` carrying a `code`, a stable title and a per-occurrence `detail`                   |
| `AllExceptionsFilter`                       | Global filter rendering every exception as an [RFC 7807 problem document](../errors.md) (`application/problem+json`) |
| `ProblemDetailsDto` / `ApiProblemResponse`  | Swagger model + decorator for documenting error responses                                                            |
| `RequestContextMiddleware`                  | Opens the request's correlation ID (`RequestContextService`) before guards run, echoed as `x-correlation-id` |
| `RequestContextService`                     | Static wrapper — `run()`, `getCorrelationId()`, `setCorrelationId()`                                                 |
| `Mapper<Entity, ServiceModel, ResponseDto>` | 3-layer mapper interface with `toRepository`, `toService`, `toController`                                            |
| `SanitizePipe`                              | Recursively strips HTML tags from all string inputs                                                                  |
| `ZodValidationPipe`                         | Validates input against Zod schemas (reads `zodSchema` static property)                                              |
| `PaginatedRequest`                          | Zod schema for `page` (int >= 1) and `limit` (int 1-100)                                                             |

### Usage in `app.module.ts`

```typescript
import {
  AllExceptionsFilter,
  RequestContextMiddleware,
} from "@flama/backend-core";

@Module({
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  // Middleware, not an interceptor: guards run before interceptors, and a
  // guard's 401/403/429 must carry the correlation id too.
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
```

## `@flama/backend-email`

Transactional email behind an abstract `EmailService`: the module that binds it
to a driver, the console driver, and the React Email templates a delivering
driver renders.

### Templates

Located in `src/templates/`, built with `@react-email/components`:

- `password-reset.tsx` — Reset button + fallback link
- `email-verification.tsx` — Verify button + fallback link
- `welcome.tsx` — Welcome message with user's name

### Configuration

The API passes the drivers it runs on to `EmailModule.register` — its
`emailDrivers` map, in `apps/api/src/config/email.config.ts` — and
`EMAIL_PROVIDER` names one of them; the API's config accepts exactly those
names. `console`, the default, logs every email instead of delivering it.
<!-- flama:begin email -->

`nodemailer` sends through SMTP (`apps/api/src/config/nodemailer-email.service.ts`,
reading its own `smtp` config section, `SMTP_*`) and `resend` through the
Resend API (`apps/api/src/config/resend-email.service.ts`, reading `resend`,
`RESEND_API_KEY`). Both render the package's templates and send from
`EMAIL_FROM`.
<!-- flama:end email -->

```typescript
import { ConsoleEmailService, EmailModule } from "@flama/backend-email";

@Module({
  imports: [EmailModule.register({ console: ConsoleEmailService })],
})
export class AppModule {}
```

## `@flama/backend-cache`

Redis cache abstraction.

| Method  | Signature                                                    |
| ------- | ------------------------------------------------------------ |
| `get`   | `get<T>(key: string): Promise<T \| null>`                    |
| `set`   | `set<T>(key: string, value: T, ttl?: number): Promise<void>` |
| `del`   | `del(key: string): Promise<void>`                            |
| `reset` | `reset(): Promise<void>`                                     |

```typescript
import { CacheModule } from "@flama/backend-cache";

@Module({
  imports: [CacheModule.register()],
})
export class AppModule {}
```

## `@flama/backend-storage`

File storage behind an abstract `StorageService`: the module that binds it to a
driver, and the local filesystem driver.

| Method         | Signature                                                              |
| -------------- | ---------------------------------------------------------------------- |
| `upload`       | `upload(file: Buffer, key: string, mimeType: string): Promise<string>` |
| `delete`       | `delete(key: string): Promise<void>`                                   |
| `getSignedUrl` | `getSignedUrl(key: string, expiresIn?: number): Promise<string>`       |

The API passes the drivers it runs on to `StorageModule.register` — its
`storageDrivers` map, in `apps/api/src/config/storage.config.ts` — and
`STORAGE_PROVIDER` names one of them; the API's config accepts exactly those
names. `local`, the default, writes uploads to disk under `UPLOAD_DIR`.
<!-- flama:begin storage-s3 -->

`s3` is the S3-compatible driver (AWS, Hetzner Object Storage, MinIO),
`apps/api/src/config/s3-storage.service.ts`. It stores the key, signs every
read with a presigned URL, and reads its own `s3` config section (`S3_*`).
<!-- flama:end storage-s3 -->

```typescript
import { LocalStorageService, StorageModule } from "@flama/backend-storage";

@Module({
  imports: [StorageModule.register({ local: LocalStorageService })],
})
export class AppModule {}
```

## `@flama/backend-queue`

BullMQ async job processing. Queue names come from `QUEUE_NAMES` in
`@flama/shared`.
<!-- flama:begin bull-board -->

The API mounts a Bull Board dashboard over its queues at `/admin/queues`
(`BullBoardModule`, `apps/api/src/bull-board`), behind HTTP Basic auth, and
only when `BULL_BOARD_USERNAME` and `BULL_BOARD_PASSWORD` are set.
<!-- flama:end bull-board -->

## CJS compatibility

All backend packages export both ESM and CJS:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.js"
    }
  }
}
```

This is required because NestJS runs in CommonJS mode.
