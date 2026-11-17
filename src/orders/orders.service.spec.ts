import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OptimisticLockError } from 'sequelize';
import { OrdersService } from './orders.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';

describe('OrdersService (Unit Tests)', () => {
  let ordersService: OrdersService;
  let mockProductsService: any;

  const mockProduct: any = {
    id: 1,
    productToken: 'SONY-001',
    name: 'Sony WH-1000XM5',
    price: 349.99,
    stock: 10,
    version: 1,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockProductsService = {
      findOne: jest.fn(),
      updateStock: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: ProductsService,
          useValue: mockProductsService,
        },
      ],
    }).compile();

    ordersService = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(ordersService).toBeDefined();
  });

  it('should place an order, decrement stock programmatically, and calculate 3 Scalapay installments', async () => {
    mockProductsService.findOne.mockResolvedValue(mockProduct);
    mockProductsService.updateStock.mockResolvedValue({
      ...mockProduct,
      stock: 8,
      version: 2,
    });

    const dto: CreateOrderDto = { productId: 1, quantity: 2 };
    const result = await ordersService.createOrder(dto, 'req-order-1');

    expect(mockProductsService.findOne).toHaveBeenCalledWith(1, 'req-order-1');
    expect(mockProductsService.updateStock).toHaveBeenCalledWith(
      1,
      { stock: 8, version: 1 },
      'req-order-1',
    );

    expect(result.productId).toBe(1);
    expect(result.productName).toBe('Sony WH-1000XM5');
    expect(result.quantity).toBe(2);
    expect(result.totalAmount).toBe(699.98); // 349.99 * 2
    expect(result.remainingStock).toBe(8);
    expect(result.installments).toHaveLength(3);

    // Sum of installments must match total amount exactly
    const installmentSum = Number(
      result.installments.reduce((sum, item) => sum + item.amount, 0).toFixed(2),
    );
    expect(installmentSum).toBe(result.totalAmount);
  });

  it('should throw BadRequestException when requested quantity exceeds available stock', async () => {
    mockProductsService.findOne.mockResolvedValue({
      ...mockProduct,
      stock: 2,
    });

    const dto: CreateOrderDto = { productId: 1, quantity: 5 };

    await expect(ordersService.createOrder(dto)).rejects.toThrow(BadRequestException);
    expect(mockProductsService.updateStock).not.toHaveBeenCalled();
  });

  it('should propagate NotFoundException when product does not exist', async () => {
    mockProductsService.findOne.mockRejectedValue(new NotFoundException('Product not found'));

    const dto: CreateOrderDto = { productId: 999, quantity: 1 };

    await expect(ordersService.createOrder(dto)).rejects.toThrow(NotFoundException);
    expect(mockProductsService.updateStock).not.toHaveBeenCalled();
  });

  it('should propagate OptimisticLockError if another checkout modified stock concurrently', async () => {
    mockProductsService.findOne.mockResolvedValue(mockProduct);
    mockProductsService.updateStock.mockRejectedValue(
      new OptimisticLockError({ message: 'Concurrency conflict' }),
    );

    const dto: CreateOrderDto = { productId: 1, quantity: 1 };

    await expect(ordersService.createOrder(dto)).rejects.toThrow(OptimisticLockError);
  });
});
