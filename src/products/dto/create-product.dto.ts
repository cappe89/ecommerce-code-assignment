import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    example: 'PROD-SKU-1001',
    description: 'Unique business identifier for the product',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  productToken: string;

  @ApiProperty({
    example: 'Sony WH-1000XM5 Wireless Headphones',
    description: 'Name of the product',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 349.99,
    description: 'Product price (positive decimal with up to 2 decimal places)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  price: number;

  @ApiProperty({
    example: 50,
    description: 'Initial stock quantity (must be an integer >= 0)',
    default: 0,
  })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock: number;
}
