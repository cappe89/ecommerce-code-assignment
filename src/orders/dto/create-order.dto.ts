import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateOrderDto {
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
