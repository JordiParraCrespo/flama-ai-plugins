import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { DataSource } from 'typeorm';
import { runAllMigrations } from './run-migrations';

/**
 * The API as an OAuth 2.1 provider for MCP clients, against a real Postgres
 * and Redis: the tables Better Auth's MCP plugin writes, and the discovery
 * document a client reads before it registers itself.
 */
describe('OAuth provider for MCP clients (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let dataSource: DataSource;
  let pgContainer: StartedTestContainer;
  let redisContainer: StartedTestContainer;

  beforeAll(async () => {
    [pgContainer, redisContainer] = await Promise.all([
      new GenericContainer('postgres:16-alpine')
        .withEnvironment({
          POSTGRES_USER: 'test',
          POSTGRES_PASSWORD: 'test',
          POSTGRES_DB: 'test',
        })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = pgContainer.getHost();
    process.env.DB_PORT = pgContainer.getMappedPort(5432).toString();
    process.env.DB_USERNAME = 'test';
    process.env.DB_PASSWORD = 'test';
    process.env.DB_DATABASE = 'test';
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = redisContainer.getMappedPort(6379).toString();
    process.env.BETTER_AUTH_SECRET = 'integration-test-secret-value-32-chars';

    await runAllMigrations();

    // Import AppModule (and the Better Auth instance, which reads the database
    // config at module load) only after the container env vars are set.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    dataSource = moduleRef.get(DataSource);
  }, 180000);

  afterAll(async () => {
    await app?.close();
    // Better Auth's email queue is a module singleton outside the DI container,
    // so `app.close()` does not reach it.
    const { emailQueue } = await import('../src/auth/infrastructure/email-queue.util');
    await emailQueue.close().catch(() => {});
    await Promise.all([pgContainer?.stop(), redisContainer?.stop()]);
  });

  it('has the Better Auth OAuth tables the MCP plugin writes', async () => {
    const tables: { table_name: string }[] = await dataSource.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name IN ('oauthApplication', 'oauthAccessToken', 'oauthConsent')`,
    );
    expect(tables.map((table) => table.table_name).sort()).toEqual([
      'oauthAccessToken',
      'oauthApplication',
      'oauthConsent',
    ]);
  });

  it('publishes authorization-server metadata', async () => {
    const response = await fetch(`${baseUrl}/api/auth/.well-known/oauth-authorization-server`);
    expect(response.status).toBe(200);

    const metadata = (await response.json()) as {
      authorization_endpoint?: string;
      token_endpoint?: string;
      registration_endpoint?: string;
      scopes_supported?: string[];
      code_challenge_methods_supported?: string[];
    };

    expect(metadata.authorization_endpoint).toBeTruthy();
    expect(metadata.token_endpoint).toBeTruthy();
    // Dynamic client registration is what lets an MCP client connect without
    // being pre-provisioned.
    expect(metadata.registration_endpoint).toBeTruthy();
    expect(metadata.code_challenge_methods_supported).toContain('S256');
    // The deployment's own catalog, not just the OIDC standard scopes.
    expect(metadata.scopes_supported).toEqual(
      expect.arrayContaining(['openid', 'users:read', 'roles:write']),
    );
  });
});
