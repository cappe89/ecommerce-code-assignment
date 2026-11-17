import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { InstallmentDto, OrderResponseDto } from './dto/order-response.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly productsService: ProductsService) {}

  /**
   * Processes a checkout order by programmatically consuming ProductsService:
   * 1. Fetches product details and checks availability via productsService.findOne().
   * 2. Decrements stock with optimistic concurrency locking via productsService.updateStock().
   * 3. Generates a 3-installment interest-free schedule (Scalapay BNPL simulation).
   */
  async createOrder(
    createOrderDto: CreateOrderDto,
    requestId?: string,
  ): Promise<OrderResponseDto> {
    const logPrefix = requestId ? `[${requestId}] ` : '';
    const { productId, quantity } = createOrderDto;

    this.logger.log(
      `${logPrefix}Initiating checkout order for product ID: ${productId}, quantity: ${quantity}`,
    );

    // 1. Programmatic Retrieval: Fetch current product details from ProductsService
    const product = await this.productsService.findOne(productId, requestId);

    // 2. Business Validation: verify stock quantity
    if (product.stock < quantity) {
      this.logger.warn(
        `${logPrefix}Order rejected: insufficient stock for product ID ${productId}. Requested: ${quantity}, available: ${product.stock}`,
      );
      throw new BadRequestException(
        `Insufficient stock for product "${product.name}". Requested ${quantity}, but only ${product.stock} available.`,
      );
    }

    // 3. Programmatic Stock Update: decrement stock using Optimistic Locking
    const newStock = product.stock - quantity;
    const updatedProduct = await this.productsService.updateStock(
      productId,
      {
        stock: newStock,
        version: product.version, // optimistic lock check against race conditions
      },
      requestId,
    );

    // 4. Financial calculation with decimal precision
    const unitPrice = product.price;
    const totalAmount = Number((unitPrice * quantity).toFixed(2));

    // 5. Scalapay BNPL Simulation: 3 interest-free installments (today, +30d, +60d)
    const installments = this.calculateInstallments(totalAmount);

    const orderId = `ord-${randomUUID().slice(0, 8)}`;
    this.logger.log(
      `${logPrefix}Order ${orderId} created successfully. Total: €${totalAmount}, remaining stock: ${updatedProduct.stock}`,
    );

    return {
      orderId,
      productId: product.id,
      productName: product.name,
      unitPrice,
      quantity,
      totalAmount,
      installments,
      remainingStock: updatedProduct.stock,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Calculates 3 interest-free installments, guaranteeing exact cent-matching on the sum.
   */
  private calculateInstallments(totalAmount: number): InstallmentDto[] {
    const baseInstallment = Number((totalAmount / 3).toFixed(2));
    // Compensate any cent rounding on the final installment
    const lastInstallment = Number((totalAmount - baseInstallment * 2).toFixed(2));

    const today = new Date();
    const date1 = new Date(today);
    const date2 = new Date(today);
    date2.setDate(date2.getDate() + 30);
    const date3 = new Date(today);
    date3.setDate(date3.getDate() + 60);

    return [
      {
        installmentNumber: 1,
        amount: baseInstallment,
        dueDate: date1.toISOString().split('T')[0],
      },
      {
        installmentNumber: 2,
        amount: baseInstallment,
        dueDate: date2.toISOString().split('T')[0],
      },
      {
        installmentNumber: 3,
        amount: lastInstallment,
        dueDate: date3.toISOString().split('T')[0],
      },
    ];
  }
}
