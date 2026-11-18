# Architecture and Data Model (Sequelize + MySQL)

## Database Schema: `products` Table
- `id`: INT, Primary Key, Auto-Increment.
- `productToken`: VARCHAR(255), UNIQUE, NOT NULL. Unique external/business identifier for the product.
- `name`: VARCHAR(255), NOT NULL.
- `price`: DECIMAL(10, 2), NOT NULL (prevents floating-point rounding errors in e-commerce/fintech contexts).
- `stock`: INT, NOT NULL, DEFAULT 0, CHECK (`stock >= 0`).
- `version`: INT, NOT NULL, DEFAULT 1 (automatically managed by Sequelize for Optimistic Locking).
- `createdAt`, `updatedAt`: Automatic timestamps.
- `deletedAt`: Nullable timestamp (automatically managed by Sequelize for Soft Delete).

## Model Configuration & Database Performance
- **Soft Delete (`paranoid: true`)**: Enabled on the `Product` model. `destroy()` operations populate `deletedAt` without physically deleting the record, and read queries automatically exclude deleted records.
- **Optimistic Locking (`version: true`)**: Enabled on the `Product` model. Every `update()` checks and increments the `version` column, preventing *Lost Update* issues during concurrent modifications.
- **Explicit Indexes (`indexes`)**:
  - Unique index on `productToken`.
  - Composite or dedicated index on `createdAt` (and `deletedAt`) to optimize paginated query performance (`GET /products`) and prevent full table scans as the catalog grows.

## NestJS Architectural Decisions
- **Layered Modular Monolith**: An isolated `ProductsModule` containing Controller, Service, Sequelize Model, DTOs, and Tests (avoiding over-engineering such as CQRS, which is unjustified given the domain size).
- **Dependency Injection**: Leverage `@InjectModel(Product)` via `@nestjs/sequelize`.
- **Separation of Concerns**:
  - **Controller**: HTTP handling, input validation via DTOs, status codes, and Swagger decorators.
  - **Service**: Business logic, transaction/lock management, and contextual logging with `X-Request-Id`.
  - **Global Exception Filter**: Centralized interception of `SequelizeUniqueConstraintError` and `SequelizeOptimisticLockError` -> HTTP `409 Conflict`.
