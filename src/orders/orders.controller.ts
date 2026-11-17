import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';

@ApiTags('orders')
@ApiHeader({
  name: 'X-Request-Id',
  description: 'Optional correlation/tracing ID for distributed observability',
  required: false,
})
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Place an order (Checkout with 3x Scalapay installments)',
    description:
      'Demonstrates programmatic usage of ProductsService: verifies availability via findOne(), updates inventory via updateStock() with optimistic concurrency locking, and calculates a 3-installment BNPL payment plan.',
  })
  @ApiCreatedResponse({
    description: 'Order placed successfully with 3-installment payment plan',
    type: OrderResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Insufficient stock or invalid input parameter',
  })
  @ApiNotFoundResponse({
    description: 'Product not found or soft-deleted',
  })
  @ApiConflictResponse({
    description: 'Optimistic lock conflict: stock was concurrently modified by another transaction',
  })
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @Headers('x-request-id') requestId?: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.createOrder(createOrderDto, requestId);
  }
}
