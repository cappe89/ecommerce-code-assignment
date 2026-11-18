# Products Microservice (NestJS + Sequelize + MySQL)

A production-grade backend microservice for e-commerce product catalog and inventory management, built with **NestJS**, **Sequelize ORM**, **MySQL 8.0**, and **TypeScript**.

The project is architected following principles of robustness, distributed observability, referential consistency, and concurrency control (Optimistic Locking).

---

## 🏛️ Architecture & Design Choices

### 1. Data Model and Database Performance
- **Soft Delete (`paranoid: true`)**: Deleting a product via `DELETE /products/:id` does not physically remove the row from the database; instead, it populates the `deletedAt` field. This guarantees the referential integrity of historical orders. Sequelize queries automatically exclude logically deleted records.
- **Optimistic Locking (`version: true`)**: Each record includes a `version` field (default 1). When updating stock (`PATCH /products/:id/stock`), Sequelize atomically verifies and increments the version. If two concurrent transactions attempt to modify the same product, the second fails by throwing an `OptimisticLockError`, mapped to `409 Conflict`.
- **Explicit Indexes**:
  - `idx_products_product_token_unique`: Unique index on the business field `productToken`.
  - `idx_products_created_deleted_at`: Composite index on `createdAt` and `deletedAt` to optimize paginated queries and avoid full table scans as the catalog grows.
- **Financial Integrity (`DECIMAL 10,2`)**: The `price` field is stored as `DECIMAL(10, 2)` to prevent floating-point rounding errors typical of e-commerce transactions.

### 2. Observability and Tracing (`X-Request-Id`)
- Every HTTP request is tracked via the `X-Request-Id` header.
- The `RequestIdInterceptor` reads the incoming header if provided by the client or reverse proxy, or generates a UUID v4 automatically.
- The Correlation ID is propagated across:
  1. NestJS `Logger` structured application logs.
  2. HTTP response headers (`X-Request-Id`).
  3. The error response JSON payload (`requestId`).

### 3. Validation and Security
- **Centralized `ValidationPipe`**: Configured with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- **OOM / Query Abuse Prevention**: The pagination `limit` parameter is strictly capped at a maximum of `@Max(100)`. Requests with higher values (e.g., `limit=500`) or payloads containing unauthorized fields are rejected with `400 Bad Request`.
- **Stock Integrity**: Stock can never be negative (`@Min(0)` on DTOs and schema-level constraint).

### 4. Global Exception Filter
A global exception filter (`GlobalExceptionFilter`) intercepts and normalizes errors:
- `SequelizeUniqueConstraintError` ➔ `409 Conflict` (duplicate `productToken`).
- `SequelizeOptimisticLockError` ➔ `409 Conflict` (concurrent stock modification).
- `NotFoundException` ➔ `404 Not Found` (non-existent or soft-deleted product).
- `BadRequestException` ➔ `400 Bad Request` (DTO validation errors).
- Unhandled internal errors ➔ `500 Internal Server Error` (without exposing sensitive internal details).

---

## 📁 Project Structure

```text
ecommerce-code-assignment/
├── docker/
│   └── init-db.sql               # DB initialization script (ecommerce + ecommerce_test)
├── docs/                         # PRD, architecture, and requirements documentation
├── src/
│   ├── common/
│   │   ├── dto/
│   │   │   ├── paginated-response.dto.ts
│   │   │   └── pagination-query.dto.ts
│   │   ├── filters/
│   │   │   └── global-exception.filter.ts
│   │   └── interceptors/
│   │       └── request-id.interceptor.ts
│   ├── database/
│   │   └── database.module.ts    # Sequelize MySQL configuration
│   ├── orders/                   # Programmatic consumer of ProductsModule (Checkout / BNPL)
│   │   ├── dto/
│   │   │   ├── create-order.dto.ts
│   │   │   └── order-response.dto.ts
│   │   ├── orders.controller.ts
│   │   ├── orders.module.ts
│   │   ├── orders.service.ts
│   │   └── orders.service.spec.ts
│   ├── products/
│   │   ├── dto/
│   │   │   ├── create-product.dto.ts
│   │   │   ├── query-product.dto.ts
│   │   │   └── update-stock.dto.ts
│   │   ├── models/
│   │   │   └── product.model.ts  # Sequelize Model (paranoid + version)
│   │   ├── products.controller.ts
│   │   ├── products.module.ts
│   │   ├── products.service.ts
│   │   └── products.service.spec.ts  # Isolated Unit Tests with Mocks
│   ├── seeder/                   # Catalog auto-population (OnApplicationBootstrap)
│   │   ├── catalog-seeder.service.ts
│   │   ├── catalog-seeder.service.spec.ts
│   │   └── seeder.module.ts
│   ├── app.module.ts
│   ├── main.ts                   # Entry point with Swagger OpenAPI
│   └── setup-app.ts              # Shared configuration (App + E2E Tests)
├── test/
│   ├── jest-e2e.json
│   └── products.e2e-spec.ts      # E2E Integration tests against real MySQL
├── .env                          # Clean Production / Release environment (NODE_ENV=production, DB_SYNC=false)
├── .env.development              # Local Development environment (NODE_ENV=development, auto-seeding enabled)
├── .env.example                  # Documented reference template
├── .env.test                     # Dedicated E2E Test environment (NODE_ENV=test, ecommerce_test)
├── docker-compose.yml            # Preconfigured MySQL 8.0 with healthcheck
└── package.json
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18+ or v20/v22 recommended)
- **Docker** and **Docker Compose**

### 1. Clone the repository and install dependencies
```bash
npm install
```

### 2. Start MySQL Database with Docker Compose
The `docker-compose.yml` file spins up a configured MySQL 8.0 container and automatically creates the `ecommerce` and `ecommerce_test` databases:
```bash
docker compose up -d
```
Verify that the database is running:
```bash
docker compose ps
```

### 3. Configure environment variables
The project enforces strict environment separation:

- **`.env.development`** (Local Development): preconfigured for `NODE_ENV=development`, with `DB_SYNC=true` and demo data seeder enabled to test APIs immediately:
  ```env
  PORT=3000
  NODE_ENV=development
  DB_HOST=localhost
  DB_PORT=3306
  DB_USERNAME=ecommerce_user
  DB_PASSWORD=ecommerce_pass
  DB_NAME=ecommerce
  DB_LOGGING=false
  DB_SYNC=true
  ```
- **`.env`** (Production / Release): clean and secure environment for production, with `NODE_ENV=production` and `DB_SYNC=false` (the schema is not altered automatically, and the demo seeder is strictly disabled).
- **`.env.test`** (E2E Tests): targets the isolated `ecommerce_test` database.

### 4. Start the Microservice
npm commands are configured with `cross-env` to ensure cross-platform compatibility (Windows, macOS, Linux):
```bash
# Local Development Mode (loads .env.development, auto-seeder active)
npm run start:dev

# Development Mode without watch
npm start

# Production / Release Mode (loads .env with NODE_ENV=production, seeder excluded)
npm run build
npm run start:prod
```

The service will be listening on: `http://localhost:3000`

---

## 📖 Interactive Swagger Documentation (OpenAPI)

Once the service is started, interactive Swagger documentation is accessible at:
👉 **[http://localhost:3000/api/docs](http://localhost:3000/api/docs)**

### 📥 Download OpenAPI Specification (JSON / YAML)
To import APIs into tools like Postman, Insomnia, or client SDK generators, raw OpenAPI specifications are exported and directly accessible at:
- **OpenAPI JSON:** [http://localhost:3000/api/docs-json](http://localhost:3000/api/docs-json)
- **OpenAPI YAML:** [http://localhost:3000/api/docs-yaml](http://localhost:3000/api/docs-yaml)

---

## 🧪 Running Tests

### 1. Unit Tests (`ProductsService`)
Runs unit tests in complete isolation by mocking the Sequelize Model (`getModelToken(Product)`), testing business logic, offset/limit calculation, and exception simulations:
```bash
npm test
```

### 2. E2E Integration Tests (Against Real MySQL 8.0)
E2E tests run on the dedicated `ecommerce_test` database to authentically verify MySQL behavior (DECIMAL, UNIQUE constraints, Soft Delete with `{ paranoid: false }`, and concurrent Optimistic Locking with `Promise.all`):
```bash
npm run test:e2e
```

### 3. Test Coverage
```bash
npm run test:cov
```

---

## 📡 API Usage Examples (cURL and JSON)

### 1. Create Product (`POST /products`)
Creates a new product in the catalog. If `productToken` already exists, returns `409 Conflict`.

**Request:**
```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: test-trace-001" \
  -d '{
    "productToken": "SONY-WH1000XM5",
    "name": "Sony WH-1000XM5 Wireless Headphones",
    "price": 349.99,
    "stock": 50
  }'
```

**Success Response (`201 Created`):**
```json
{
  "id": 1,
  "productToken": "SONY-WH1000XM5",
  "name": "Sony WH-1000XM5 Wireless Headphones",
  "price": 349.99,
  "stock": 50,
  "version": 1,
  "createdAt": "2026-11-16T20:00:00.000Z",
  "updatedAt": "2026-11-16T20:00:00.000Z",
  "deletedAt": null
}
```

**Conflict Response on duplicate (`409 Conflict`):**
```json
{
  "statusCode": 409,
  "timestamp": "2026-11-16T20:00:05.123Z",
  "path": "/products",
  "error": "Conflict",
  "message": "productToken must be unique",
  "requestId": "test-trace-001"
}
```

---

### 2. Paginated Products List (`GET /products`)
Retrieves the paginated list of active products only (excluding soft-deleted ones).

**Request:**
```bash
curl -X GET "http://localhost:3000/products?page=1&limit=10" \
  -H "Accept: application/json"
```

**Response (`200 OK`):**
```json
{
  "data": [
    {
      "id": 1,
      "productToken": "SONY-WH1000XM5",
      "name": "Sony WH-1000XM5 Wireless Headphones",
      "price": 349.99,
      "stock": 50,
      "version": 1,
      "createdAt": "2026-11-16T20:00:00.000Z",
      "updatedAt": "2026-11-16T20:00:00.000Z",
      "deletedAt": null
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

**Pagination Abuse Protection (`limit > 100`):**
```bash
curl -X GET "http://localhost:3000/products?limit=500"
```
**Response (`400 Bad Request`):**
```json
{
  "statusCode": 400,
  "timestamp": "2026-11-16T20:01:00.000Z",
  "path": "/products?limit=500",
  "error": "Bad Request",
  "message": [
    "limit must not be greater than 100"
  ],
  "requestId": "..."
}
```

---

### 3. Product Details by ID (`GET /products/:id`)
Retrieves a single active product. If non-existent or soft-deleted, returns `404 Not Found`.

**Request:**
```bash
curl -X GET http://localhost:3000/products/1 \
  -H "Accept: application/json"
```

**Response (`200 OK`):**
```json
{
  "id": 1,
  "productToken": "SONY-WH1000XM5",
  "name": "Sony WH-1000XM5 Wireless Headphones",
  "price": 349.99,
  "stock": 50,
  "version": 1,
  "createdAt": "2026-11-16T20:00:00.000Z",
  "updatedAt": "2026-11-16T20:00:00.000Z",
  "deletedAt": null
}
```

---

### 4. Stock Update with Optimistic Locking (`PATCH /products/:id/stock`)
Updates stock quantity. If the client sends the optional `version` field and it does not match the current version in the database, or if two clients attempt to update the same record simultaneously, the operation is rejected with `409 Conflict`.

**Request:**
```bash
curl -X PATCH http://localhost:3000/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{
    "stock": 75,
    "version": 1
  }'
```

**Success Response (`200 OK` - version incremented to 2):**
```json
{
  "id": 1,
  "productToken": "SONY-WH1000XM5",
  "name": "Sony WH-1000XM5 Wireless Headphones",
  "price": 349.99,
  "stock": 75,
  "version": 2,
  "createdAt": "2026-11-16T20:00:00.000Z",
  "updatedAt": "2026-11-16T20:05:00.000Z",
  "deletedAt": null
}
```

**Conflict Response due to version mismatch (`409 Conflict`):**
```json
{
  "statusCode": 409,
  "timestamp": "2026-11-16T20:05:01.000Z",
  "path": "/products/1/stock",
  "error": "Conflict",
  "message": "Resource conflict: The product was modified concurrently. Please refresh the latest data and retry your update.",
  "requestId": "..."
}
```

---

### 5. Soft Delete (`DELETE /products/:id`)
Performs logical deletion of the product by populating `deletedAt`. Preserves order history.

**Request:**
```bash
curl -X DELETE http://localhost:3000/products/1 -i
```

**Response (`204 No Content`):**
```http
HTTP/1.1 204 No Content
X-Request-Id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
```

A subsequent call to `GET /products/1` or `DELETE /products/1` will return:
```json
{
  "statusCode": 404,
  "timestamp": "2026-11-16T20:06:00.000Z",
  "path": "/products/1",
  "error": "Not Found",
  "message": "Product with ID 1 not found",
  "requestId": "..."
}
```
Despite the 404 response, querying the MySQL table directly with `SELECT * FROM products WHERE id = 1` or via Sequelize with `{ paranoid: false }`, the record is physically preserved along with its `deletedAt` timestamp.

---

## 🛡️ Standardized Error Handling

All HTTP errors returned by the application follow a uniform schema:

```json
{
  "statusCode": 409,
  "timestamp": "2026-11-16T20:10:00.000Z",
  "path": "/products/1/stock",
  "error": "Conflict",
  "message": "Resource conflict: The product was modified concurrently. Please refresh the latest data and retry your update.",
  "requestId": "e4b6c31a-0518-4a11-8fc0-192a6b2c4d92"
}
```

---

## 💻 Programmatic Usage of NestJS Module (Dependency Injection)

In addition to REST/HTTP API exposure, `ProductsModule` exports `ProductsService` to allow other modules within the platform to interact directly with the catalog via native NestJS **Dependency Injection**. The project implements and demonstrates **two real-world use cases**:

---

### Case 1: `OrdersModule` (Checkout with Scalapay 3x Installments)
Simulates the checkout flow of an e-commerce / BNPL (Buy Now Pay Later) platform. `OrdersService` programmatically consumes `ProductsService`:
1. **Verify existence and price**: calls `productsService.findOne(productId)`.
2. **Validate availability**: checks that the requested quantity is available in stock.
3. **Protected concurrent decrement**: calls `productsService.updateStock(productId, { stock: newStock, version: product.version })`, leveraging Optimistic Locking against concurrent over-selling.
4. **Exact financial calculation**: generates the interest-free 3-installment payment schedule Scalapay-style (with exact penny/cent remainder compensation).

#### Injection and Execution in `OrdersService`:
```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly productsService: ProductsService) {}

  async createOrder(dto: CreateOrderDto, requestId?: string): Promise<OrderResponseDto> {
    // 1. Programmatic retrieval from ProductsService
    const product = await this.productsService.findOne(dto.productId, requestId);

    if (product.stock < dto.quantity) {
      throw new BadRequestException(`Insufficient stock for product "${product.name}"`);
    }

    // 2. Programmatic update with Optimistic Locking
    const updated = await this.productsService.updateStock(
      product.id,
      { stock: product.stock - dto.quantity, version: product.version },
      requestId,
    );

    // 3. Scalapay BNPL installment calculation (total split into 3 installments)
    const totalAmount = Number((product.price * dto.quantity).toFixed(2));
    const installments = this.calculateInstallments(totalAmount);

    return {
      orderId: `ord-${randomUUID().slice(0, 8)}`,
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      quantity: dto.quantity,
      totalAmount,
      installments,
      remainingStock: updated.stock,
      createdAt: new Date().toISOString(),
    };
  }
}
```

#### Checkout API Call Example (`POST /orders`)

**Request:**
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: checkout-trace-001" \
  -d '{
    "productId": 1,
    "quantity": 2
  }'
```

**Success Response (`201 Created`):**
```json
{
  "orderId": "ord-7f3b8a1c",
  "productId": 1,
  "productName": "Sony WH-1000XM5 Wireless Headphones",
  "unitPrice": 349.99,
  "quantity": 2,
  "totalAmount": 699.98,
  "installments": [
    {
      "installmentNumber": 1,
      "amount": 233.33,
      "dueDate": "2026-11-16"
    },
    {
      "installmentNumber": 2,
      "amount": 233.33,
      "dueDate": "2026-12-16"
    },
    {
      "installmentNumber": 3,
      "amount": 233.32,
      "dueDate": "2027-01-15"
    }
  ],
  "remainingStock": 48,
  "createdAt": "2026-11-16T22:50:00.000Z"
}
```

---

### Case 2: `CatalogSeederService` (Auto-population for Local Development)
Implements NestJS's `OnApplicationBootstrap` lifecycle hook in `src/seeder/catalog-seeder.service.ts`:
1. Upon application startup, verifies the environment: runs **exclusively if `NODE_ENV === 'development'`** (automatically set via `npm run start:dev` or `npm start` using `.env.development`).
2. If the database is empty (`total === 0`), inserts 4 realistic test products (Sony Headphones, iPhone 15, MacBook Air, Logitech Mouse) via sequential calls to `productsService.create()`.
3. In production (`.env`, `npm run start:prod`) and tests (`NODE_ENV === 'test'`), the auto-seeder is **strictly ignored** to ensure production data safety and deterministic test isolation.

This way, developers or reviewers testing locally immediately find a populated catalog ready to explore on Swagger, while the production environment (`.env`) remains clean and protected.
