# Products Microservice (NestJS + Sequelize + MySQL)

Microservizio backend production-grade per la gestione del catalogo prodotti e dell'inventario e-commerce, sviluppato con **NestJS**, **Sequelize ORM**, **MySQL 8.0** e **TypeScript**.

Il progetto è architettato seguendo i principi di robustezza, osservabilità distribuita, consistenza referenziale e protezione dalla concorrenza (Optimistic Locking).

---

## 🏛️ Architettura e Scelte di Design

### 1. Modello Dati e Performance Database
- **Soft Delete (`paranoid: true`)**: L'eliminazione di un prodotto tramite `DELETE /products/:id` non rimuove fisicamente la riga dal database, ma valorizza il campo `deletedAt`. In questo modo si garantisce l'integrità referenziale degli ordini storici. Le query Sequelize escludono automaticamente i record eliminati logicamente.
- **Optimistic Locking (`version: true`)**: Ogni record include un campo `version` (default 1). Durante l'aggiornamento dello stock (`PATCH /products/:id/stock`), Sequelize verifica e incrementa atomicamente la versione. Qualora due transazioni concorrenti tentino di modificare lo stesso prodotto, la seconda fallisce sollevando un'eccezione `OptimisticLockError`, mappata a `409 Conflict`.
- **Indici Espliciti**:
  - `idx_products_product_token_unique`: Indice univoco sul campo di business `productToken`.
  - `idx_products_created_deleted_at`: Indice composito sui campi `createdAt` e `deletedAt` per ottimizzare le query paginate ed evitare full table scan al crescere del catalogo.
- **Integrità Finanziaria (`DECIMAL 10,2`)**: Il campo `price` è memorizzato come `DECIMAL(10, 2)` per prevenire errori di arrotondamento floating-point tipici delle operazioni e-commerce.

### 2. Osservabilità e Tracing (`X-Request-Id`)
- Ogni richiesta HTTP viene tracciata tramite l'header `X-Request-Id`.
- Il `RequestIdInterceptor` legge l'header in ingresso se fornito dal client o dal reverse proxy, oppure genera automaticamente un UUID v4.
- Il Correlation ID viene propagato:
  1. Nei log applicativi strutturati del `Logger` di NestJS.
  2. Negli header HTTP di risposta (`X-Request-Id`).
  3. Nel payload JSON in caso di errore (`requestId`).

### 3. Validazione e Sicurezza
- **`ValidationPipe` centralizzato**: Configurato con `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- **Prevenzione OOM / Query Abuse**: Il parametro di paginazione `limit` è rigorosamente limitato a un massimo di `@Max(100)`. Richieste con valori superiori (es. `limit=500`) o payload contenenti campi non autorizzati vengono respinte con `400 Bad Request`.
- **Integrità Stock**: Lo stock non può mai assumere valori negativi (`@Min(0)` sui DTO e vincolo a livello di schema).

### 4. Global Exception Filter
Un filtro globale (`GlobalExceptionFilter`) intercetta e normalizza gli errori:
- `SequelizeUniqueConstraintError` ➔ `409 Conflict` (duplicazione `productToken`).
- `SequelizeOptimisticLockError` ➔ `409 Conflict` (modifica concorrente dello stock).
- `NotFoundException` ➔ `404 Not Found` (prodotto non esistente o soft-deleted).
- `BadRequestException` ➔ `400 Bad Request` (errori di validazione DTO).
- Errori interni non gestiti ➔ `500 Internal Server Error` (senza esporre dettagli interni sensibili).

---

## 📁 Struttura del Progetto

```text
ecommerce-code-assignment/
├── docker/
│   └── init-db.sql               # Script di inizializzazione DB (ecommerce + ecommerce_test)
├── docs/                         # Documentazione PRD, architettura e requisiti
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
│   │   └── database.module.ts    # Configurazione Sequelize per MySQL
│   ├── orders/                   # Consumatore programmatico di ProductsModule (Checkout / BNPL)
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
│   │   │   └── product.model.ts  # Modello Sequelize (paranoid + version)
│   │   ├── products.controller.ts
│   │   ├── products.module.ts
│   │   ├── products.service.ts
│   │   └── products.service.spec.ts  # Unit Test isolati con Mock
│   ├── seeder/                   # Auto-popolamento catalogo (OnApplicationBootstrap)
│   │   ├── catalog-seeder.service.ts
│   │   ├── catalog-seeder.service.spec.ts
│   │   └── seeder.module.ts
│   ├── app.module.ts
│   ├── main.ts                   # Entry point con Swagger OpenAPI
│   └── setup-app.ts              # Configurazione condivisa (App + E2E Tests)
├── test/
│   ├── jest-e2e.json
│   └── products.e2e-spec.ts      # Test E2E di integrazione contro MySQL reale
├── .env                          # Ambiente Produzione / Rilascio pulito (NODE_ENV=production, DB_SYNC=false)
├── .env.development              # Ambiente Sviluppo Locale (NODE_ENV=development, auto-seeding attivo)
├── .env.example                  # Template documentato di riferimento
├── .env.test                     # Ambiente Test E2E dedicato (NODE_ENV=test, ecommerce_test)
├── docker-compose.yml            # MySQL 8.0 preconfigurato con healthcheck
└── package.json
```

---

## 🚀 Avvio Rapido

### Prerequisiti
- **Node.js** (v18+ o v20/v22 consigliato)
- **Docker** e **Docker Compose**

### 1. Clonare il repository e installare le dipendenze
```bash
npm install
```

### 2. Avviare il Database MySQL con Docker Compose
Il file `docker-compose.yml` avvia un container MySQL 8.0 configurato e crea automaticamente i database `ecommerce` e `ecommerce_test`:
```bash
docker compose up -d
```
Verificare che il database sia attivo:
```bash
docker compose ps
```

### 3. Configurare le variabili d'ambiente
Il progetto adotta una rigorosa separazione degli ambienti:

- **`.env.development`** (Sviluppo Locale): preconfigurato per `NODE_ENV=development`, con `DB_SYNC=true` e il seeder di dati demo abilitato per testare subito le API:
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
- **`.env`** (Produzione / Rilascio): ambiente pulito e sicuro per la produzione, con `NODE_ENV=production` e `DB_SYNC=false` (lo schema non viene alterato automaticamente e il seeder demo viene tassativamente escluso).
- **`.env.test`** (Test E2E): punta al database isolato `ecommerce_test`.

### 4. Avviare il Microservizio
I comandi npm sono configurati con `cross-env` per garantire compatibilità multipiattaforma (Windows, macOS, Linux):
```bash
# Modalità Sviluppo Locale (carica .env.development, auto-seeder attivo)
npm run start:dev

# Modalità Sviluppo senza watch
npm start

# Modalità Produzione / Rilascio (carica .env con NODE_ENV=production, seeder escluso)
npm run build
npm run start:prod
```

Il servizio sarà in ascolto su: `http://localhost:3000`

---

## 📖 Documentazione Interattiva Swagger (OpenAPI)

Una volta avviato il servizio, la documentazione Swagger interattiva è accessibile all'indirizzo:
👉 **[http://localhost:3000/api/docs](http://localhost:3000/api/docs)**

### 📥 Download della Specifica OpenAPI (JSON / YAML)
Per importare le API in tool come Postman, Insomnia o generatori di client SDK, la specifica OpenAPI grezza è esportata ed accessibile direttamente ai seguenti endpoint:
- **OpenAPI JSON:** [http://localhost:3000/api/docs-json](http://localhost:3000/api/docs-json)
- **OpenAPI YAML:** [http://localhost:3000/api/docs-yaml](http://localhost:3000/api/docs-yaml)

---

## 🧪 Esecuzione dei Test

### 1. Unit Test (`ProductsService`)
Esegue i test unitari in totale isolamento mockando il Model Sequelize (`getModelToken(Product)`), testando la logica di business, il calcolo di offset/limit e la simulazione delle eccezioni:
```bash
npm test
```

### 2. E2E Integration Test (Contro MySQL 8.0 Reale)
I test E2E girano sul database dedicato `ecommerce_test` per verificare fedelmente il comportamento di MySQL (DECIMAL, vincoli UNIQUE, Soft Delete con `{ paranoid: false }` e Optimistic Locking concorrente con `Promise.all`):
```bash
npm run test:e2e
```

### 3. Test Coverage
```bash
npm run test:cov
```

---

## 📡 Esempi d'Uso API (cURL e JSON)

### 1. Creazione Prodotto (`POST /products`)
Crea un nuovo prodotto nel catalogo. Se il `productToken` esiste già, ritorna `409 Conflict`.

**Richiesta:**
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

**Risposta di successo (`201 Created`):**
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

**Risposta di conflitto in caso di duplicato (`409 Conflict`):**
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

### 2. Lista Paginata Prodotti (`GET /products`)
Recupera l'elenco paginato dei soli prodotti attivi (escludendo i soft-deleted).

**Richiesta:**
```bash
curl -X GET "http://localhost:3000/products?page=1&limit=10" \
  -H "Accept: application/json"
```

**Risposta (`200 OK`):**
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

**Protezione Abuso Paginazione (`limit > 100`):**
```bash
curl -X GET "http://localhost:3000/products?limit=500"
```
**Risposta (`400 Bad Request`):**
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

### 3. Dettaglio Prodotto per ID (`GET /products/:id`)
Recupera un singolo prodotto attivo. Se inesistente o soft-deleted, ritorna `404 Not Found`.

**Richiesta:**
```bash
curl -X GET http://localhost:3000/products/1 \
  -H "Accept: application/json"
```

**Risposta (`200 OK`):**
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

### 4. Aggiornamento Stock con Optimistic Locking (`PATCH /products/:id/stock`)
Aggiorna la quantità di stock. Se il client invia il campo opzionale `version` e questo non coincide con la versione attuale nel database, oppure se due client tentano di aggiornare simultaneamente lo stesso record, l'operazione viene respinta con `409 Conflict`.

**Richiesta:**
```bash
curl -X PATCH http://localhost:3000/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{
    "stock": 75,
    "version": 1
  }'
```

**Risposta di successo (`200 OK` - versione incrementata a 2):**
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

**Risposta di conflitto per disallineamento versione (`409 Conflict`):**
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
Esegue la rimozione logica del prodotto valorizzando `deletedAt`. Preserva la cronologia degli ordini.

**Richiesta:**
```bash
curl -X DELETE http://localhost:3000/products/1 -i
```

**Risposta (`204 No Content`):**
```http
HTTP/1.1 204 No Content
X-Request-Id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
```

Una successiva chiamata `GET /products/1` o `DELETE /products/1` restituirà:
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
Nonostante la risposta 404, interrogando direttamente la tabella MySQL con `SELECT * FROM products WHERE id = 1` o tramite Sequelize con `{ paranoid: false }`, il record è fisicamente conservato con il relativo timestamp in `deletedAt`.

---

## 🛡️ Gestione Errori Standardizzata

Tutti gli errori HTTP restituiti dall'applicazione seguono uno schema uniforme:

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

## 💻 Utilizzo Programmatico del Modulo NestJS (Dependency Injection)

Oltre all'esposizione tramite API REST/HTTP, `ProductsModule` esporta `ProductsService` per permettere ad altri moduli della piattaforma di interagire direttamente con il catalogo tramite la **Dependency Injection** nativa di NestJS. Nel progetto sono implementati e funzionanti **due use case reali**:

---

### Caso 1: Modulo `OrdersModule` (Checkout con Rateizzazione Scalapay 3x)
Simula il flusso di checkout di una piattaforma e-commerce / BNPL (Buy Now Pay Later). L'`OrdersService` consuma programmaticamente `ProductsService`:
1. **Verifica esistenza e prezzo**: invoca `productsService.findOne(productId)`.
2. **Validazione disponibilità**: controlla che la quantità richiesta sia disponibile in magazzino.
3. **Decremento concorrente protetto**: invoca `productsService.updateStock(productId, { stock: newStock, version: product.version })` sfruttando l'Optimistic Locking contro gli over-selling concorrenti.
4. **Calcolo finanziario esatto**: genera il piano di pagamento in 3 rate a tasso zero stile Scalapay (con compensazione esatta dei centesimi).

#### Iniezione ed Esecuzione in `OrdersService`:
```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly productsService: ProductsService) {}

  async createOrder(dto: CreateOrderDto, requestId?: string): Promise<OrderResponseDto> {
    // 1. Lettura programmatica da ProductsService
    const product = await this.productsService.findOne(dto.productId, requestId);

    if (product.stock < dto.quantity) {
      throw new BadRequestException(`Insufficient stock for product "${product.name}"`);
    }

    // 2. Aggiornamento programmatico con Optimistic Locking
    const updated = await this.productsService.updateStock(
      product.id,
      { stock: product.stock - dto.quantity, version: product.version },
      requestId,
    );

    // 3. Calcolo rate Scalapay BNPL (totale diviso in 3 rate)
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

#### Esempio di Chiamata API Checkout (`POST /orders`)

**Richiesta:**
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: checkout-trace-001" \
  -d '{
    "productId": 1,
    "quantity": 2
  }'
```

**Risposta di successo (`201 Created`):**
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

### Caso 2: `CatalogSeederService` (Auto-popolamento per Sviluppo Locale)
Implementa il lifecycle hook `OnApplicationBootstrap` di NestJS in `src/seeder/catalog-seeder.service.ts`:
1. All'avvio dell'applicazione, verifica l'ambiente: viene eseguito **esclusivamente se `NODE_ENV === 'development'`** (impostato automaticamente tramite `npm run start:dev` o `npm start` con `.env.development`).
2. Se il database è vuoto (`total === 0`), inserisce 4 prodotti di test realistici (Sony Headphones, iPhone 15, MacBook Air, Logitech Mouse) tramite chiamate successive a `productsService.create()`.
3. In produzione (`.env`, `npm run start:prod`) e nei test (`NODE_ENV === 'test'`), l'auto-seeder viene **tassativamente ignorato** per garantire la sicurezza dei dati di produzione e l'isolamento deterministico dei test.

In questo modo, chi sviluppa o recensisce il codice in locale trova subito il catalogo popolato ed esplorabile su Swagger, mentre l'ambiente di produzione (`.env`) rimane pulito e protetto.
