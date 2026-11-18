import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { OptimisticLockError, Transaction } from 'sequelize';
import { Product } from './models/product.model';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectModel(Product)
    private readonly productModel: typeof Product,
  ) {}

  /**
   * Creates a new product.
   * Duplicate productToken triggers a SequelizeUniqueConstraintError mapped by GlobalExceptionFilter to 409 Conflict.
   */
  async create(
    createProductDto: CreateProductDto,
    requestId?: string,
  ): Promise<Product> {
    const logPrefix = requestId ? `[${requestId}] ` : '';
    this.logger.log(
      `${logPrefix}Creating product with token: ${createProductDto.productToken}, name: "${createProductDto.name}"`,
    );

    const product = await this.productModel.create({
      productToken: createProductDto.productToken,
      name: createProductDto.name,
      price: createProductDto.price,
      stock: createProductDto.stock,
    } as any);

    this.logger.log(
      `${logPrefix}Successfully created product ID: ${product.id} (token: ${product.productToken})`,
    );

    return product;
  }

  /**
   * Retrieves a paginated list of active (non-soft-deleted) products.
   * Strict limits are applied to prevent database performance degradation.
   */
  async findAll(
    query: QueryProductDto,
    requestId?: string,
  ): Promise<PaginatedResponseDto<Product>> {
    const logPrefix = requestId ? `[${requestId}] ` : '';
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    this.logger.log(
      `${logPrefix}Fetching products page: ${page}, limit: ${limit}, offset: ${offset}`,
    );

    const { count, rows } = await this.productModel.findAndCountAll({
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    const totalPages = Math.ceil(count / limit);

    return {
      data: rows,
      meta: {
        total: count,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Retrieves a single active product by its primary ID.
   * Accepts an optional Sequelize transaction to support atomic multi-operation workflows.
   * Returns 404 Not Found if the product does not exist or has been soft-deleted.
   */
  async findOne(
    id: number,
    requestId?: string,
    transaction?: Transaction,
  ): Promise<Product> {
    const logPrefix = requestId ? `[${requestId}] ` : '';
    this.logger.log(`${logPrefix}Finding product with ID: ${id}`);

    const product = transaction
      ? await this.productModel.findByPk(id, { transaction })
      : await this.productModel.findByPk(id);

    if (!product) {
      this.logger.warn(`${logPrefix}Product with ID ${id} not found or soft-deleted`);
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Updates product stock with Optimistic Locking concurrency protection.
   * Supports execution within a managed Sequelize transaction.
   * If another transaction has modified the record concurrently, an OptimisticLockError is thrown,
   * which is caught by the GlobalExceptionFilter and returned as 409 Conflict.
   */
  async updateStock(
    id: number,
    updateStockDto: UpdateStockDto,
    requestId?: string,
    transaction?: Transaction,
  ): Promise<Product> {
    const logPrefix = requestId ? `[${requestId}] ` : '';
    this.logger.log(
      `${logPrefix}Updating stock for product ID ${id} to: ${updateStockDto.stock}`,
    );

    const product = await this.findOne(id, requestId, transaction);

    // If client supplied an explicit version, check it before persisting
    if (
      updateStockDto.version !== undefined &&
      updateStockDto.version !== product.version
    ) {
      this.logger.warn(
        `${logPrefix}Optimistic lock mismatch for product ${id}: client version ${updateStockDto.version} != current version ${product.version}`,
      );
      throw new OptimisticLockError({
        message: `Resource conflict: Product version mismatch (expected ${updateStockDto.version}, found ${product.version})`,
      });
    }

    product.stock = updateStockDto.stock;
    if (transaction) {
      await product.save({ transaction });
    } else {
      await product.save();
    }

    this.logger.log(
      `${logPrefix}Stock updated successfully for product ID ${id}. New stock: ${product.stock}, new version: ${product.version}`,
    );

    return product;
  }

  /**
   * Soft-deletes a product by setting deletedAt timestamp.
   * Throws 404 Not Found if the product does not exist or was already deleted.
   */
  async remove(id: number, requestId?: string): Promise<void> {
    const logPrefix = requestId ? `[${requestId}] ` : '';
    this.logger.log(`${logPrefix}Soft-deleting product ID: ${id}`);

    const product = await this.findOne(id, requestId);
    await product.destroy();

    this.logger.log(`${logPrefix}Product ID ${id} successfully soft-deleted`);
  }
}
