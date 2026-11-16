import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { Product } from './models/product.model';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

@ApiTags('products')
@ApiHeader({
  name: 'X-Request-Id',
  description: 'Optional correlation/tracing ID for distributed observability',
  required: false,
})
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new product',
    description:
      'Creates a product in the catalog. Enforces unique productToken constraint and strict validation.',
  })
  @ApiCreatedResponse({
    description: 'Product created successfully',
    type: Product,
  })
  @ApiConflictResponse({
    description: 'Conflict - product with this productToken already exists',
  })
  async create(
    @Body() createProductDto: CreateProductDto,
    @Headers('x-request-id') requestId?: string,
  ): Promise<Product> {
    return this.productsService.create(createProductDto, requestId);
  }

  @Get()
  @ApiOperation({
    summary: 'List products with pagination',
    description:
      'Retrieves active products. Capped at max 100 items per page to prevent high memory consumption.',
  })
  @ApiOkResponse({
    description: 'Paginated list of active products with total metadata',
    type: PaginatedResponseDto,
  })
  async findAll(
    @Query() query: QueryProductDto,
    @Headers('x-request-id') requestId?: string,
  ): Promise<PaginatedResponseDto<Product>> {
    return this.productsService.findAll(query, requestId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get product by ID',
    description:
      'Retrieves a single active product. Returns 404 if the product is nonexistent or soft-deleted.',
  })
  @ApiOkResponse({
    description: 'Product found',
    type: Product,
  })
  @ApiNotFoundResponse({
    description: 'Product not found or soft-deleted',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-request-id') requestId?: string,
  ): Promise<Product> {
    return this.productsService.findOne(id, requestId);
  }

  @Patch(':id/stock')
  @ApiOperation({
    summary: 'Update product stock with optimistic locking',
    description:
      'Updates stock quantity for a product. Concurrency conflicts are automatically detected and rejected with 409 Conflict.',
  })
  @ApiOkResponse({
    description: 'Product stock updated successfully',
    type: Product,
  })
  @ApiNotFoundResponse({
    description: 'Product not found',
  })
  @ApiConflictResponse({
    description: 'Optimistic lock conflict - concurrent modification detected',
  })
  async updateStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStockDto: UpdateStockDto,
    @Headers('x-request-id') requestId?: string,
  ): Promise<Product> {
    return this.productsService.updateStock(id, updateStockDto, requestId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete a product',
    description:
      'Logically deletes a product by setting deletedAt timestamp, preserving referential order integrity.',
  })
  @ApiNoContentResponse({
    description: 'Product soft-deleted successfully',
  })
  @ApiNotFoundResponse({
    description: 'Product not found or already soft-deleted',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    return this.productsService.remove(id, requestId);
  }
}
