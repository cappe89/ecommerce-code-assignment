# Product Requirements Document (PRD) - Products Microservice

## Obiettivo
Sviluppare un microservizio backend in **NestJS** con **Sequelize** e **MySQL** per la gestione del catalogo prodotti, focalizzandosi su standard di produzione (production-grade), validazione rigorosa, osservabilità e gestione degli errori.

## Requisiti Funzionali (Endpoints)
1. **POST /products** (Create): Accetta payload con `productToken` (string, unique), `name` (string), `price` (decimal), `stock` (integer). Ritorna `201 Created` o `400 Bad Request` / `409 Conflict` in caso di duplicati.
2. **GET /products** (Read Pagination): Supporta paginazione (`page`, `limit`) e ordinamento.
   - **Sicurezza & Resilienza**: Impostare un default (`page = 1`, `limit = 10`) e un tetto massimo rigoroso `@Max(100)` sul parametro `limit` nel DTO per prevenire query pesanti o Out-Of-Memory.
   - Ritorna lista paginata con metadati totali (`data`, `meta: { total, page, limit, totalPages }`).
3. **GET /products/:id** (Get One): Recupera il singolo prodotto attivo per ID. Ritorna `404 Not Found` se non esiste o se è stato eliminato logicamente.
4. **PATCH /products/:id/stock** (Update Stock): Aggiornamento mirato della quantità di stock con gestione della concorrenza tramite Optimistic Locking.
5. **DELETE /products/:id** (Delete): Rimozione logica (**Soft Delete**) del prodotto per preservare lo storico referenziale degli ordini. Ritorna `200 OK` o `204 No Content` (oppure `404 Not Found` se già eliminato/inesistente).

## Requisiti Non Funzionali & Infrastruttura
- **Validazione**: Uso rigoroso di `class-validator` e `class-transformer` sui DTO (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`).
- **Error Handling**: Global Exception Filter per mappare gli errori Sequelize (`UniqueConstraintError`, `OptimisticLockError`) in payload JSON standardizzati con HTTP status code corretti (`409 Conflict`, `400 Bad Request`, `404 Not Found`).
- **Observability (Logging & Tracing)**:
  - Utilizzo del `Logger` strutturato di NestJS (no `console.log`).
  - Middleware/Interceptor globale per la gestione del Correlation ID (`X-Request-Id`): legge l'header in ingresso se presente o genera un UUID v4, propagandolo nei log e negli header di risposta.
- **Ambiente Locale (Docker)**: File `docker-compose.yml` nella root con container `mysql:8.0` preconfigurato (database `ecommerce`) per avviare e testare il microservizio istantaneamente.
- **Documentazione API**: Integrazione automatica con Swagger (`@nestjs/swagger`) e sezione completa di esempi cURL/JSON nel `README.md`.