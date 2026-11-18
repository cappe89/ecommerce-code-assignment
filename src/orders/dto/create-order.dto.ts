import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Min, ValidateNested } from 'class-validator';

export class OrderItemDto {
  @ApiProperty({
    example: 1,
    description: 'ID of the product to purchase',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  productId: number;

  @ApiProperty({
    example: 2,
    description: 'Quantity of items to purchase (must be an integer >= 1)',
    default: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({
    type: [OrderItemDto],
    description: 'List of order items with product IDs and requested quantities',
    example: [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
