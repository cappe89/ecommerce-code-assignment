import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { NotFoundException } from '@nestjs/common';
import { OptimisticLockError, UniqueConstraintError, ValidationErrorItem } from 'sequelize';
import { ProductsService } from './products.service';
import { Product } from './models/product.model';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryProductDto } from './dto/query-product.dto';

describe('ProductsService (Unit Tests)', () => {
  let service: ProductsService;
  let mockProductModel: any;

  const mockProductInstance: any = {
    id: 1,
    productToken: 'PROD-001',
    name: 'Sample Product',
    price: 99.99,
    stock: 20,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    save: jest.fn(),
    destroy: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockProductModel = {
      create: jest.fn(),
      findAndCountAll: jest.fn(),
      findByPk: jest.fn(),
      destroy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getModelToken(Product),
          useValue: mockProductModel,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    const createDto: CreateProductDto = {
      productToken: 'PROD-TEST-1',
      name: 'Wireless Mouse',
      price: 29.99,
      stock: 50,
    };

    it('should successfully create a new product', async () => {
      const createdEntity = { id: 10, ...createDto, version: 1 };
      mockProductModel.create.mockResolvedValue(createdEntity);

      const result = await service.create(createDto, 'req-123');

      expect(mockProductModel.create).toHaveBeenCalledWith({
        productToken: createDto.productToken,
        name: createDto.name,
        price: createDto.price,
        stock: createDto.stock,
      });
      expect(result).toEqual(createdEntity);
    });

    it('should throw UniqueConstraintError when productToken is duplicated', async () => {
      const uniqueError = new UniqueConstraintError({
        message: 'Validation error: productToken must be unique',
        errors: [
          new ValidationErrorItem(
            'productToken must be unique',
            'unique violation',
            'productToken',
            createDto.productToken,
            null as any,
            'idx_products_product_token_unique',
            'create',
            [],
          ),
        ],
      });

      mockProductModel.create.mockRejectedValue(uniqueError);

      await expect(service.create(createDto)).rejects.toThrow(UniqueConstraintError);
      expect(mockProductModel.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll()', () => {
    it('should calculate correct default limit and offset (page 1, limit 10)', async () => {
      const query: QueryProductDto = { page: 1, limit: 10 };
      const expectedRows = [mockProductInstance];
      mockProductModel.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: expectedRows,
      });

      const result = await service.findAll(query, 'req-find');

      expect(mockProductModel.findAndCountAll).toHaveBeenCalledWith({
        limit: 10,
        offset: 0,
        order: [['createdAt', 'DESC']],
      });
      expect(result).toEqual({
        data: expectedRows,
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });

    it('should calculate custom offset and limit properly (page 3, limit 15)', async () => {
      const query: QueryProductDto = { page: 3, limit: 15 };
      mockProductModel.findAndCountAll.mockResolvedValue({
        count: 45,
        rows: [],
      });

      const result = await service.findAll(query);

      expect(mockProductModel.findAndCountAll).toHaveBeenCalledWith({
        limit: 15,
        offset: 30, // (3 - 1) * 15
        order: [['createdAt', 'DESC']],
      });
      expect(result.meta).toEqual({
        total: 45,
        page: 3,
        limit: 15,
        totalPages: 3,
      });
    });

    it('should cap limit at 100 to prevent OOM abuse', async () => {
      const query: QueryProductDto = { page: 1, limit: 500 };
      mockProductModel.findAndCountAll.mockResolvedValue({
        count: 200,
        rows: [],
      });

      const result = await service.findAll(query);

      expect(mockProductModel.findAndCountAll).toHaveBeenCalledWith({
        limit: 100, // Capped at 100
        offset: 0,
        order: [['createdAt', 'DESC']],
      });
      expect(result.meta.limit).toBe(100);
      expect(result.meta.totalPages).toBe(2);
    });
  });

  describe('findOne()', () => {
    it('should return the product when found', async () => {
      mockProductModel.findByPk.mockResolvedValue(mockProductInstance);

      const result = await service.findOne(1, 'req-get-1');

      expect(mockProductModel.findByPk).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockProductInstance);
    });

    it('should throw NotFoundException when product is not found or soft-deleted', async () => {
      mockProductModel.findByPk.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow('Product with ID 999 not found');
    });
  });

  describe('updateStock()', () => {
    const updateDto: UpdateStockDto = { stock: 85 };

    it('should successfully update stock and save the product', async () => {
      const product = { ...mockProductInstance, stock: 20, version: 1 };
      product.save = jest.fn().mockImplementation(async () => {
        product.version += 1;
        return product;
      });

      mockProductModel.findByPk.mockResolvedValue(product);

      const result = await service.updateStock(1, updateDto, 'req-stock');

      expect(product.stock).toBe(85);
      expect(product.save).toHaveBeenCalled();
      expect(result.stock).toBe(85);
      expect(result.version).toBe(2);
    });

    it('should throw NotFoundException if product to update does not exist', async () => {
      mockProductModel.findByPk.mockResolvedValue(null);

      await expect(service.updateStock(999, updateDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw OptimisticLockError when explicit client version mismatches current version', async () => {
      const product = { ...mockProductInstance, version: 2 };
      mockProductModel.findByPk.mockResolvedValue(product);

      // Client expects version 1, but database is already at version 2
      const mismatchDto: UpdateStockDto = { stock: 100, version: 1 };

      await expect(service.updateStock(1, mismatchDto)).rejects.toThrow(OptimisticLockError);
    });

    it('should throw OptimisticLockError when concurrent save() conflicts in database', async () => {
      const product = { ...mockProductInstance, version: 1 };
      const lockError = new OptimisticLockError({
        message: 'Optimistic lock error: row was modified concurrently',
      });
      product.save = (jest.fn() as any).mockRejectedValue(lockError);

      mockProductModel.findByPk.mockResolvedValue(product);

      await expect(service.updateStock(1, updateDto)).rejects.toThrow(OptimisticLockError);
      expect(product.save).toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('should successfully soft-delete the product', async () => {
      const product = { ...mockProductInstance };
      product.destroy = (jest.fn() as any).mockResolvedValue(undefined);
      mockProductModel.findByPk.mockResolvedValue(product);

      await service.remove(1, 'req-del');

      expect(mockProductModel.findByPk).toHaveBeenCalledWith(1);
      expect(product.destroy).toHaveBeenCalled();
    });

    it('should throw NotFoundException if product to remove does not exist or was already deleted', async () => {
      mockProductModel.findByPk.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(mockProductModel.destroy).not.toHaveBeenCalled();
    });
  });
});
