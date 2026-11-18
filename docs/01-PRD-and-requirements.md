# Product Requirements Document (PRD) - Products Microservice

## Objective
Develop a production-grade backend microservice in **NestJS** with **Sequelize** and **MySQL** for product catalog management, focusing on production standards, rigorous validation, observability, and error handling.

## Functional Requirements (Endpoints)
1. **POST /products** (Create): Accepts a payload with `productToken` (string, unique), `name` (string), `price` (decimal), `stock` (integer). Returns `201 Created` or `400 Bad Request` / `409 Conflict` in case of duplicates.
2. **GET /products** (Read Pagination): Supports pagination (`page`, `limit`) and sorting.
   - **Security & Resilience**: Set defaults (`page = 1`, `limit = 10`) and a strict `@Max(100)` cap on the `limit` parameter in the DTO to prevent heavy queries or Out-Of-Memory errors.
   - Returns a paginated list with total metadata (`data`, `meta: { total, page, limit, totalPages }`).
3. **GET /products/:id** (Get One): Retrieves a single active product by ID. Returns `404 Not Found` if it does not exist or has been soft-deleted.
4. **PATCH /products/:id/stock** (Update Stock): Targeted update of stock quantity with concurrency handling via Optimistic Locking.
5. **DELETE /products/:id** (Delete): Logical removal (**Soft Delete**) of the product to preserve the referential history of orders. Returns `200 OK` or `204 No Content` (or `404 Not Found` if already deleted/non-existent).

## Non-Functional Requirements & Infrastructure
- **Validation**: Strict use of `class-validator` and `class-transformer` on DTOs (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`).
- **Error Handling**: Global Exception Filter to map Sequelize errors (`UniqueConstraintError`, `OptimisticLockError`) into standardized JSON payloads with proper HTTP status codes (`409 Conflict`, `400 Bad Request`, `404 Not Found`).
- **Observability (Logging & Tracing)**:
  - Use of NestJS structured `Logger` (no `console.log`).
  - Global Middleware/Interceptor for Correlation ID handling (`X-Request-Id`): reads incoming header if present or generates a UUID v4, propagating it across logs and response headers.
- **Local Environment (Docker)**: `docker-compose.yml` file in the root with a preconfigured `mysql:8.0` container (`ecommerce` database) to run and test the microservice instantly.
- **API Documentation**: Automated integration with Swagger (`@nestjs/swagger`) and a comprehensive section of cURL/JSON examples in `README.md`.
