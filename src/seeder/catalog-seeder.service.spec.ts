import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogSeederService } from './catalog-seeder.service';
import { ProductsService } from '../products/products.service';

describe('CatalogSeederService (Unit Tests)', () => {
  let seederService: CatalogSeederService;
  let mockProductsService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockProductsService = {
      findAll: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogSeederService,
        {
          provide: ProductsService,
          useValue: mockProductsService,
        },
      ],
    }).compile();

    seederService = module.get<CatalogSeederService>(CatalogSeederService);
  });

  it('should be defined', () => {
    expect(seederService).toBeDefined();
  });

  it('should skip seeding if NODE_ENV is test', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    await seederService.onApplicationBootstrap();

    expect(mockProductsService.findAll).not.toHaveBeenCalled();
    expect(mockProductsService.create).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it('should skip seeding if NODE_ENV is production (released app)', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await seederService.onApplicationBootstrap();

    expect(mockProductsService.findAll).not.toHaveBeenCalled();
    expect(mockProductsService.create).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it('should seed demo products when database catalog is empty', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    mockProductsService.findAll.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });
    mockProductsService.create.mockResolvedValue({ id: 1 });

    await seederService.onApplicationBootstrap();

    expect(mockProductsService.findAll).toHaveBeenCalledWith({ page: 1, limit: 1 });
    expect(mockProductsService.create).toHaveBeenCalledTimes(4);

    process.env.NODE_ENV = originalEnv;
  });

  it('should skip seeding when database already contains products', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    mockProductsService.findAll.mockResolvedValue({
      data: [{ id: 1 }],
      meta: { total: 10 },
    });

    await seederService.onApplicationBootstrap();

    expect(mockProductsService.findAll).toHaveBeenCalledWith({ page: 1, limit: 1 });
    expect(mockProductsService.create).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });
});
