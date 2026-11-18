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
    summary: 'Place a multi-item order (Transactional checkout with 3x Scalapay installments)',
    description:
      'Demonstrates programmatic and transactional consumption of ProductsService: accepts a list of items with quantities, verifies inventory availability, and decrements stock within a managed database transaction. Commits only if all updates succeed; otherwise rolls back completely.',
  })
  @ApiCreatedResponse({
    description: 'Order placed successfully within an atomic transaction with 3-installment payment plan',
    type: OrderResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Insufficient stock or invalid input parameter for one or more items (transaction rolled back)',
  })
  @ApiNotFoundResponse({
    description: 'One or more products not found or soft-deleted (transaction rolled back)',
  })
  @ApiConflictResponse({
    description: 'Optimistic lock conflict: one or more products concurrently modified (transaction rolled back)',
  })
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @Headers('x-request-id') requestId?: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.createOrder(createOrderDto, requestId);
  }
}
