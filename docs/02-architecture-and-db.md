# Architettura e Modello Dati (Sequelize + MySQL)

## Schema Database: Tabella `products`
- `id`: INT, Primary Key, Auto-Increment.
- `productToken`: VARCHAR(255), UNIQUE, NOT NULL. Identificativo esterno/business univoco del prodotto.
- `name`: VARCHAR(255), NOT NULL.
- `price`: DECIMAL(10, 2), NOT NULL (evita errori di arrotondamento floating-point in ambito e-commerce/fintech).
- `stock`: INT, NOT NULL, DEFAULT 0, CHECK (`stock >= 0`).
- `version`: INT, NOT NULL, DEFAULT 1 (gestito automaticamente da Sequelize per l'Optimistic Locking).
- `createdAt`, `updatedAt`: Timestamp automatici.
- `deletedAt`: Timestamp nullable (gestito automaticamente da Sequelize per il Soft Delete).

## Configurazione Model & Performance Database
- **Soft Delete (`paranoid: true`)**: Abilitato sul model `Product`. Le operazioni `destroy()` popolano `deletedAt` senza cancellare fisicamente il record, e le query di lettura escludono automaticamente i record eliminati.
- **Optimistic Locking (`version: true`)**: Abilitato sul model `Product`. Ogni `update()` verifica e incrementa la colonna `version`, prevenendo il problema del *Lost Update* in caso di modifiche concorrenti.
- **Indici Espliciti (`indexes`)**:
  - Indice univoco su `productToken`.
  - Indice composito o dedicato su `createdAt` (e `deletedAt`) per ottimizzare le prestazioni delle query paginate (`GET /products`) ed evitare full table scan al crescere del catalogo.

## Scelte Architetturali NestJS
- **Layered Modular Monolith**: Un modulo isolato `ProductsModule` contenente Controller, Service, Model Sequelize, DTOs e Test (evitando over-engineering come CQRS non giustificato dalla dimensione del dominio).
- **Dependency Injection**: Sfruttare `@InjectModel(Product)` tramite `@nestjs/sequelize`.
- **Separation of Concerns**:
  - **Controller**: Gestione HTTP, validazione input tramite DTO, status codes e decoratori Swagger.
  - **Service**: Logica di business, gestione transazioni/lock e logging contestuale con `X-Request-Id`.
  - **Global Exception Filter**: Intercettazione centralizzata di `SequelizeUniqueConstraintError` e `SequelizeOptimisticLockError` -> HTTP `409 Conflict`.