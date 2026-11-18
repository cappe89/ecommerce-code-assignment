import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  InstallmentDto,
  OrderResponseDto,
  PurchasedItemDto,
} from './dto/order-response.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly productsService: ProductsService,
    @InjectConnection()
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Processes a multi-item checkout order inside a managed database transaction:
   * 1. Consolidates any duplicate product requests in the cart.
   * 2. Starts a Sequelize managed transaction (ACID).
   * 3. For each item: verifies availability and updates inventory with optimistic locking.
   * 4. If any single item fails (insufficient stock, not found, concurrency conflict),
   *    the entire transaction is rolled back automatically.
   * 5. Commits ONLY when all items are successfully updated.
   * 6. Calculates the order total and a 3-installment Scalapay BNPL payment schedule.
   */
  async createOrder(
    createOrderDto: CreateOrderDto,
    requestId?: string,
  ): Promise<OrderResponseDto> {
    const logPrefix = requestId ? `[${requestId}] ` : '';
    const { items } = createOrderDto;

    this.logger.log(
      `${logPrefix}Initiating transactional checkout for ${items.length} order items`,
    );

    // Consolidate duplicate products in the request (e.g. [{id: 1, qty: 1}, {id: 1, qty: 2}] -> qty: 3)
    const consolidatedMap = new Map<number, number>();
    for (const item of items) {
      consolidatedMap.set(
        item.productId,
        (consolidatedMap.get(item.productId) || 0) + item.quantity,
      );
    }

    // Execute all updates inside an atomic Sequelize managed transaction
    const purchasedItems = await this.sequelize.transaction(
      async (transaction: Transaction) => {
        const results: PurchasedItemDto[] = [];

        for (const [productId, quantity] of consolidatedMap.entries()) {
          // 1. Programmatic Retrieval within transaction
          const product = await this.productsService.findOne(
            productId,
            requestId,
            transaction,
          );

          // 2. Business Validation: verify stock quantity
          if (product.stock < quantity) {
            this.logger.warn(
              `${logPrefix}Order aborted: insufficient stock for product ID ${productId} ("${product.name}"). Requested: ${quantity}, available: ${product.stock}`,
            );
            throw new BadRequestException(
              `Insufficient stock for product "${product.name}". Requested ${quantity}, but only ${product.stock} available.`,
            );
          }

          // 3. Programmatic Stock Update within transaction with Optimistic Locking
          const newStock = product.stock - quantity;
          const updatedProduct = await this.productsService.updateStock(
            productId,
            {
              stock: newStock,
              version: product.version, // optimistic lock check against concurrent updates
            },
            requestId,
            transaction,
          );

          const unitPrice = product.price;
          const subtotal = Number((unitPrice * quantity).toFixed(2));

          results.push({
            productId: product.id,
            productName: product.name,
            unitPrice,
            quantity,
            subtotal,
            remainingStock: updatedProduct.stock,
          });
        }

        // If all items succeed, transaction commits automatically on return
        return results;
      },
    );

    // 4. Calculate total amount across all items
    const totalAmount = Number(
      purchasedItems.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2),
    );

    // 5. Scalapay BNPL Simulation: 3 interest-free installments
    const installments = this.calculateInstallments(totalAmount);

    const orderId = `ord-${randomUUID().slice(0, 8)}`;
    this.logger.log(
      `${logPrefix}Order ${orderId} committed successfully. Total items: ${purchasedItems.length}, Total amount: €${totalAmount}`,
    );

    return {
      orderId,
      items: purchasedItems,
      totalAmount,
      installments,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Calculates 3 interest-free installments, guaranteeing exact cent-matching on the sum.
   */
  private calculateInstallments(totalAmount: number): InstallmentDto[] {
    const baseInstallment = Number((totalAmount / 3).toFixed(2));
    // Compensate any cent rounding on the final installment
    const lastInstallment = Number(
      (totalAmount - baseInstallment * 2).toFixed(2),
    );

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
