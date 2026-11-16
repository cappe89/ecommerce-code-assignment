import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateStockDto {
  @ApiProperty({
    example: 75,
    description: 'Updated stock quantity (must be an integer >= 0)',
  })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Optional expected entity version for optimistic locking. If provided and different from the current version, update is rejected with 409 Conflict.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  version?: number;
}
