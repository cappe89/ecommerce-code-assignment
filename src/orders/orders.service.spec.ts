import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/sequelize';
import { OptimisticLockError } from 'sequelize';
import { OrdersService } from './orders.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';

describe('OrdersService (Transactional Multi-Item Checkout)', () => {
  let ordersService: OrdersService;
  let mockProductsService: any;
  let mockSequelize: any;
  const mockTx = { id: 'tx-uuid-1234' };

  const mockProduct1: any = {
    id: 1,
    productToken: 'SONY-001',
    name: 'Sony WH-1000XM5',
    price: 349.99,
    stock: 10,
    version: 1,
  };

  const mockProduct2: any = {
    id: 2,
    productToken: 'APPLE-001',
    name: 'Apple iPhone 15',
    price: 849.0,
    stock: 5,
    version: 1,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockProductsService = {
      findOne: jest.fn(),
      updateStock: jest.fn(),
    };

    mockSequelize = {
      transaction: jest.fn().mockImplementation(async (callback: any) => {
        return callback(mockTx);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: ProductsService,
          useValue: mockProductsService,
        },
        {
          provide: getConnectionToken(),
          useValue: mockSequelize,
        },
      ],
    }).compile();

    ordersService = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(ordersService).toBeDefined();
  });

  it('should process a multi-item order in a single transaction, updating all stocks and committing', async () => {
    mockProductsService.findOne
      .mockResolvedValueOnce({ ...mockProduct1 })
      .mockResolvedValueOnce({ ...mockProduct2 });

    mockProductsService.updateStock
      .mockResolvedValueOnce({ ...mockProduct1, stock: 8, version: 2 })
      .mockResolvedValueOnce({ ...mockProduct2, stock: 4, version: 2 });

    const dto: CreateOrderDto = {
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
    };

    const result = await ordersService.createOrder(dto, 'req-multi-order');

    // 1. Transaction was initiated
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);

    // 2. Both products were fetched and updated within the transaction
    expect(mockProductsService.findOne).toHaveBeenCalledWith(1, 'req-multi-order', mockTx);
    expect(mockProductsService.findOne).toHaveBeenCalledWith(2, 'req-multi-order', mockTx);

    expect(mockProductsService.updateStock).toHaveBeenCalledWith(
      1,
      { stock: 8, version: 1 },
      'req-multi-order',
      mockTx,
    );
    expect(mockProductsService.updateStock).toHaveBeenCalledWith(
      2,
      { stock: 4, version: 1 },
      'req-multi-order',
      mockTx,
    );

    // 3. Totals and installments
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      productId: 1,
      productName: 'Sony WH-1000XM5',
      unitPrice: 349.99,
      quantity: 2,
      subtotal: 699.98,
      remainingStock: 8,
    });
    expect(result.items[1]).toEqual({
      productId: 2,
      productName: 'Apple iPhone 15',
      unitPrice: 849.0,
      quantity: 1,
      subtotal: 849.0,
      remainingStock: 4,
    });

    const expectedTotal = 699.98 + 849.0; // 1548.98
    expect(result.totalAmount).toBe(expectedTotal);
    expect(result.installments).toHaveLength(3);

    const sumInstallments = Number(
      result.installments.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2),
    );
    expect(sumInstallments).toBe(expectedTotal);
  });

  it('should abort transaction and throw BadRequestException when an item has insufficient stock', async () => {
    mockProductsService.findOne.mockImplementation(async (id: number) => {
      if (id === 1) return { ...mockProduct1, stock: 10 };
      if (id === 2) return { ...mockProduct2, stock: 1 };
      return null;
    });

    mockProductsService.updateStock.mockImplementation(async (id: number, updateDto: any) => ({
      id,
      stock: updateDto.stock,
      version: 2,
    }));

    const dto: CreateOrderDto = {
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 3 }, // requests 3, only 1 available!
      ],
    };

    await expect(ordersService.createOrder(dto)).rejects.toThrow(BadRequestException);
    await expect(ordersService.createOrder(dto)).rejects.toThrow(
      'Insufficient stock for product "Apple iPhone 15"',
    );

    // Stock update was never called for product 2
    expect(mockProductsService.updateStock).not.toHaveBeenCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should abort transaction and propagate NotFoundException when a product does not exist', async () => {
    mockProductsService.findOne.mockRejectedValue(new NotFoundException('Product not found'));

    const dto: CreateOrderDto = {
      items: [{ productId: 999, quantity: 1 }],
    };

    await expect(ordersService.createOrder(dto)).rejects.toThrow(NotFoundException);
    expect(mockProductsService.updateStock).not.toHaveBeenCalled();
  });

  it('should abort transaction and propagate OptimisticLockError on concurrency collision', async () => {
    mockProductsService.findOne.mockResolvedValue({ ...mockProduct1 });
    mockProductsService.updateStock.mockRejectedValue(
      new OptimisticLockError({ message: 'Concurrency lock error' }),
    );

    const dto: CreateOrderDto = {
      items: [{ productId: 1, quantity: 1 }],
    };

    await expect(ordersService.createOrder(dto)).rejects.toThrow(OptimisticLockError);
  });

  it('should consolidate duplicate product IDs in the order before executing updates', async () => {
    mockProductsService.findOne.mockResolvedValue({ ...mockProduct1, stock: 10 });
    mockProductsService.updateStock.mockResolvedValue({ ...mockProduct1, stock: 6, version: 2 });

    const dto: CreateOrderDto = {
      items: [
        { productId: 1, quantity: 1 },
        { productId: 1, quantity: 3 }, // duplicate product 1, total quantity 4
      ],
    };

    const result = await ordersService.createOrder(dto);

    // Only one consolidated findOne and updateStock call for product 1
    expect(mockProductsService.findOne).toHaveBeenCalledTimes(1);
    expect(mockProductsService.updateStock).toHaveBeenCalledWith(
      1,
      { stock: 6, version: 1 }, // 10 - 4 = 6
      undefined,
      mockTx,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(4);
  });
});
