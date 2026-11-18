# Testing Strategy, Concurrency, and Edge Cases

## 1. Idempotency and Conflict Management
- **Network retries on creation (`POST /products`)**: The `UNIQUE` constraint on `productToken` prevents accidental duplicates. The Global Exception Filter intercepts `SequelizeUniqueConstraintError`, returning HTTP `409 Conflict`.

## 2. Concurrency and Race Conditions on Stock Updates
- **Optimistic Locking**: With `version: true` configured on the Sequelize model, if two requests update the same product concurrently, the second request fails with `SequelizeOptimisticLockError`, mapped to HTTP `409 Conflict` with an explanatory message for client retry.
- **Integrity Validation**: Prevent negative `stock` values both at the DTO level (`@Min(0)`) and at the database level (`CHECK stock >= 0`).

## 3. Security and Operational Integrity
- **Pagination Abuse Prevention**: Ensure requests with `limit > 100` (e.g. `GET /products?limit=500`) or payloads containing extra fields (`forbidNonWhitelisted: true`) are rejected with `400 Bad Request` by the `ValidationPipe`.
- **Soft Delete Consistency**: Ensure that after a `DELETE /products/:id`, a subsequent `GET /products/:id` returns `404 Not Found` and the product does not appear in the paginated list `GET /products`, while physically persisting in the DB with `deletedAt` populated.
- **Request Tracing**: Ensure every HTTP response includes the `X-Request-Id` header (propagating the incoming header or generating a new one).

## 4. Testing Strategy (Jest + Supertest)

### Level 1: Unit Tests (`src/products/products.service.spec.ts`)
- Test all CRUD methods of `ProductsService` in isolation by mocking the Sequelize Model (`getModelToken(Product)`).
- Verify accurate calculation of `offset` and `limit` in pagination.
- Explicitly simulate throwing `SequelizeUniqueConstraintError`, `SequelizeOptimisticLockError`, and `NotFoundException` to verify proper exception handling.

### Level 2: Integration / E2E Tests (`test/products.e2e-spec.ts`)
- **Real E2E Database**: Run E2E tests against a real **MySQL 8.0** instance (via Docker Compose on a dedicated `ecommerce_test` DB configured in `.env.test`), avoiding in-memory SQLite to ensure authentic compatibility with `DECIMAL`, `UNIQUE` constraints, `CHECK` constraints, and transactional locking.
- **Shared Architecture Setup (`configureApp`)**: Extract global configuration (`ValidationPipe`, `GlobalExceptionFilter`, `RequestIdInterceptor`) into a reusable function shared across `main.ts` and E2E tests, ensuring tests faithfully reflect production behavior.
- **Deterministic Test Isolation**: In the `beforeEach` of E2E tests, truncate the table by executing `await productModel.destroy({ where: {}, force: true })` (`force: true` is required to physically remove records soft-deleted under `paranoid: true`).
- **Factory / Builder Pattern**: Implement a helper function `buildProductPayload(overrides)` using `crypto.randomUUID()` to generate clean, non-colliding test fixtures.

### Specific Persistence Scenarios to Verify in E2E Tests
1. **Physical Soft Delete Verification**: After `DELETE /products/:id`, query the model directly with `{ paranoid: false }` to verify the record still exists in MySQL with `deletedAt !== null`.
2. **Concurrency Verification (Optimistic Locking)**: Execute two concurrent update requests (`Promise.all`) on the same product and verify that one succeeds (`200 OK`, `version` incremented) while the other fails with `409 Conflict`.
3. **Decimal Integrity Verification**: Save a product with `price: 19.99`, retrieve it via `GET /products/:id`, and verify that type and value are preserved without floating-point rounding discrepancies.
