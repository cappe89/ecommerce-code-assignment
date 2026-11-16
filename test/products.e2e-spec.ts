// Set test environment before any module imports so ConfigModule loads .env.test
process.env.NODE_ENV = 'test';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
const request = require('supertest');
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';
import { Product } from '../src/products/models/product.model';

// Generous timeout for real MySQL database integration tests
jest.setTimeout(90000);

describe('Products Microservice (E2E Integration Tests)', () => {
  let app: INestApplication;
  let productModel: typeof Product;

  // Builder / Factory Pattern helper for test payloads
  const buildProductPayload = (overrides: Partial<Record<string, any>> = {}) => ({
    productToken: `SKU-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: 'Logitech MX Master 3S',
    price: 99.99,
    stock: 50,
    ...overrides,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Use shared enterprise configuration (ValidationPipe, RequestIdInterceptor, GlobalExceptionFilter)
    configureApp(app);

    await app.init();

    productModel = moduleFixture.get<typeof Product>(getModelToken(Product));
  }, 90000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 30000);

  beforeEach(async () => {
    // Deterministic isolation: force clean database table before every test
    // force: true physically deletes rows, bypassing paranoid soft-delete
    await productModel.destroy({ where: {}, force: true });
  });

  describe('1. Idempotency & Creation (POST /products)', () => {
    it('should successfully create a product with 201 Created and return X-Request-Id header', async () => {
      const payload = buildProductPayload();
      const customRequestId = `trace-${randomUUID()}`;

      const res = await request(app.getHttpServer())
        .post('/products')
        .set('x-request-id', customRequestId)
        .send(payload)
        .expect(201);

      expect(res.headers['x-request-id']).toBe(customRequestId);
      expect(res.body).toHaveProperty('id');
      expect(res.body.productToken).toBe(payload.productToken);
      expect(res.body.name).toBe(payload.name);
      expect(res.body.price).toBe(99.99);
      expect(res.body.stock).toBe(50);
      expect(res.body.version).toBe(1);
    });

    it('should generate a new X-Request-Id UUID if not provided in the request', async () => {
      const payload = buildProductPayload();

      const res = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(201);

      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
    });

    it('should return 409 Conflict when attempting to create a duplicate productToken', async () => {
      const payload = buildProductPayload();

      // First creation: 201 Created
      await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(201);

      // Second creation with identical productToken: 409 Conflict
      const res = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(409);

      expect(res.body.statusCode).toBe(409);
      expect(res.body.error).toBe('Conflict');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('requestId');
    });

    it('should reject requests with forbidden non-whitelisted fields (400 Bad Request)', async () => {
      const payload = buildProductPayload({ unauthorizedField: 'hacker_value' });

      const res = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });

    it('should reject negative stock at DTO validation level (400 Bad Request)', async () => {
      const payload = buildProductPayload({ stock: -5 });

      const res = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });
  });

  describe('2. Decimal Integrity', () => {
    it('should preserve exact DECIMAL(10,2) value (19.99) without floating-point rounding errors', async () => {
      const payload = buildProductPayload({ price: 19.99 });

      const createRes = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(201);

      const productId = createRes.body.id;

      const getRes = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);

      expect(typeof getRes.body.price).toBe('number');
      expect(getRes.body.price).toBe(19.99);
    });
  });

  describe('3. Pagination & Security (GET /products)', () => {
    beforeEach(async () => {
      // Seed 15 products for pagination tests
      for (let i = 1; i <= 15; i++) {
        await productModel.create({
          productToken: `SKU-PAG-${i}`,
          name: `Item ${i}`,
          price: 10.0 + i,
          stock: i * 2,
        } as any);
      }
    });

    it('should return paginated products with default page=1 and limit=10', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.data.length).toBe(10);
      expect(res.body.meta).toEqual({
        total: 15,
        page: 1,
        limit: 10,
        totalPages: 2,
      });
    });

    it('should return second page when requested', async () => {
      const res = await request(app.getHttpServer())
        .get('/products?page=2&limit=10')
        .expect(200);

      expect(res.body.data.length).toBe(5);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.totalPages).toBe(2);
    });

    it('should reject pagination abuse when limit > 100 with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/products?limit=500')
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });
  });

  describe('4. Retrieval by ID (GET /products/:id)', () => {
    it('should return single active product by ID', async () => {
      const payload = buildProductPayload();
      const createRes = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/products/${createRes.body.id}`)
        .expect(200);

      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.productToken).toBe(payload.productToken);
    });

    it('should return 404 Not Found when product does not exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/products/999999')
        .expect(404);

      expect(res.body.statusCode).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });
  });

  describe('5. Concurrency & Optimistic Locking (PATCH /products/:id/stock)', () => {
    it('should update stock successfully and increment version from 1 to 2', async () => {
      const payload = buildProductPayload({ stock: 10 });
      const createRes = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(201);

      const productId = createRes.body.id;
      expect(createRes.body.version).toBe(1);

      const patchRes = await request(app.getHttpServer())
        .patch(`/products/${productId}/stock`)
        .send({ stock: 25 })
        .expect(200);

      expect(patchRes.body.stock).toBe(25);
      expect(patchRes.body.version).toBe(2);
    });

    it('should handle race condition with Optimistic Locking: 1 update succeeds (200) and 1 fails (409 Conflict)', async () => {
      const payload = buildProductPayload({ stock: 100 });
      const createRes = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(201);

      const productId = createRes.body.id;

      // Two simultaneous requests modifying the same product concurrently
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/products/${productId}/stock`)
          .send({ stock: 150, version: 1 }),
        request(app.getHttpServer())
          .patch(`/products/${productId}/stock`)
          .send({ stock: 200, version: 1 }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 409]);

      const conflictRes = resA.status === 409 ? resA : resB;
      const successRes = resA.status === 200 ? resA : resB;

      expect(conflictRes.body.statusCode).toBe(409);
      expect(conflictRes.body.error).toBe('Conflict');
      expect(successRes.body.version).toBe(2);
    });

    it('should reject negative stock update (400 Bad Request)', async () => {
      const payload = buildProductPayload({ stock: 10 });
      const createRes = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/products/${createRes.body.id}/stock`)
        .send({ stock: -1 })
        .expect(400);
    });
  });

  describe('6. Soft Delete & Referential Consistency (DELETE /products/:id)', () => {
    it('should soft-delete product (204 No Content), hide it from GET queries, but retain physical row in DB', async () => {
      const payload = buildProductPayload();
      const createRes = await request(app.getHttpServer())
        .post('/products')
        .send(payload)
        .expect(201);

      const productId = createRes.body.id;

      // 1. Perform Soft Delete
      await request(app.getHttpServer())
        .delete(`/products/${productId}`)
        .expect(204);

      // 2. Subsequent GET /products/:id returns 404 Not Found
      await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(404);

      // 3. GET /products list does not include the soft-deleted product
      const listRes = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      const foundInList = listRes.body.data.some((p: any) => p.id === productId);
      expect(foundInList).toBe(false);

      // 4. Physical verification in MySQL: query with paranoid: false proves row still exists with deletedAt !== null
      const rawProduct = await productModel.findByPk(productId, { paranoid: false });
      expect(rawProduct).not.toBeNull();
      expect(rawProduct!.id).toBe(productId);
      expect(rawProduct!.deletedAt).not.toBeNull();
      expect(rawProduct!.deletedAt instanceof Date).toBe(true);

      // 5. Subsequent delete on already deleted product returns 404 Not Found
      await request(app.getHttpServer())
        .delete(`/products/${productId}`)
        .expect(404);
    });
  });
});
