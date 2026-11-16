# Strategia di Test, Concorrenza e Edge Cases

## 1. Idempotenza e Gestione dei Conflict
- **Retry di rete su creazione (`POST /products`)**: Il vincolo `UNIQUE` su `productToken` impedisce duplicazioni accidentali. Il Global Exception Filter intercetta `SequelizeUniqueConstraintError` restituendo HTTP `409 Conflict`.

## 2. Concorrenza e Race Conditions sull'Aggiornamento Stock
- **Optimistic Locking**: Grazie a `version: true` sul model Sequelize, se due richieste modificano contemporaneamente lo stesso prodotto, la seconda fallisce con `SequelizeOptimisticLockError`, mappato a HTTP `409 Conflict` con messaggio esplicativo per il retry del client.
- **Validazione integrità**: Impedire valori negativi di `stock` sia a livello DTO (`@Min(0)`) che a livello database (`CHECK stock >= 0`).

## 3. Sicurezza e Integrità Operativa
- **Pagination Abuse Prevention**: Verificare che richieste con `limit > 100` (es. `GET /products?limit=500`) o payload con campi extra (`forbidNonWhitelisted: true`) vengano bloccate con `400 Bad Request` dalla `ValidationPipe`.
- **Soft Delete Consistency**: Verificare che dopo una `DELETE /products/:id`, una successiva `GET /products/:id` restituisca `404 Not Found` e il prodotto non compaia nella lista paginata `GET /products`, pur rimanendo fisicamente nel DB con `deletedAt` valorizzato.
- **Request Tracing**: Verificare che ogni risposta HTTP includa l'header `X-Request-Id` (propagando quello in ingresso o generandone uno nuovo).

## 4. Strategia di Testing (Jest + Supertest)

### Livello 1: Unit Test (`src/products/products.service.spec.ts`)
- Testare tutti i metodi CRUD del `ProductsService` in isolamento mockando il Model Sequelize (`getModelToken(Product)`).
- Verificare il corretto calcolo di `offset` e `limit` nella paginazione.
- Simulare esplicitamente il lancio di `SequelizeUniqueConstraintError`, `SequelizeOptimisticLockError` e `NotFoundException` per verificare la corretta gestione delle eccezioni.

### Livello 2: Integration / E2E Test (`test/products.e2e-spec.ts`)
- **Database E2E reale**: Eseguire i test E2E contro un'istanza **MySQL 8.0** reale (via Docker Compose su DB dedicato `ecommerce_test` configurato in `.env.test`), evitando SQLite in-memory per garantire compatibilità reale su `DECIMAL`, vincoli `UNIQUE`, `CHECK` e locking transazionale.
- **Architettura condivisa (`configureApp`)**: Estrarre la configurazione globale (`ValidationPipe`, `GlobalExceptionFilter`, `RequestIdInterceptor`) in una funzione riutilizzabile sia in `main.ts` che nei test E2E, garantendo che i test riflettano fedelmente il comportamento in produzione.
- **Isolamento deterministico tra i test**: Nel `beforeEach` dei test E2E, ripulire la tabella eseguendo `await productModel.destroy({ where: {}, force: true })` (il flag `force: true` è obbligatorio per rimuovere fisicamente anche i record soft-deleted con `paranoid: true`).
- **Factory / Builder Pattern**: Creare una helper function `buildProductPayload(overrides)` con `crypto.randomUUID()` per generare dati di test puliti e non ripetitivi.

### Casi Specifici di Persistenza da Verificare nei Test E2E
1. **Verifica fisica del Soft Delete**: Dopo `DELETE /products/:id`, interrogare direttamente il model con `{ paranoid: false }` per dimostrare che il record esiste ancora su MySQL con `deletedAt !== null`.
2. **Verifica Concorrenza (Optimistic Locking)**: Eseguire due chiamate simultanee (`Promise.all`) di aggiornamento sullo stesso prodotto e verificare che una vada a buon fine (`200 OK`, `version` incrementata) e l'altra fallisca con `409 Conflict`.
3. **Verifica integrità dei Decimali**: Salvare un prodotto con `price: 19.99`, rileggerlo tramite `GET /products/:id` e verificare che tipo e valore siano preservati senza errori di arrotondamento floating-point.