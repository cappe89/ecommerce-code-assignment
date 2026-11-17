import { ApiProperty } from '@nestjs/swagger';

export class InstallmentDto {
  @ApiProperty({ example: 1, description: 'Installment sequence number (1, 2, or 3)' })
  installmentNumber: number;

  @ApiProperty({ example: 116.66, description: 'Amount due for this installment' })
  amount: number;

  @ApiProperty({ example: '2026-11-16', description: 'Due date for this installment (YYYY-MM-DD)' })
  dueDate: string;
}

export class OrderResponseDto {
  @ApiProperty({ example: 'ord-8f92b7c4', description: 'Unique order reference identifier' })
  orderId: string;

  @ApiProperty({ example: 1, description: 'Purchased product ID' })
  productId: number;

  @ApiProperty({ example: 'Sony WH-1000XM5 Wireless Headphones', description: 'Product name' })
  productName: string;

  @ApiProperty({ example: 349.99, description: 'Unit price of the product' })
  unitPrice: number;

  @ApiProperty({ example: 2, description: 'Purchased quantity' })
  quantity: number;

  @ApiProperty({ example: 699.98, description: 'Total order amount' })
  totalAmount: number;

  @ApiProperty({
    type: [InstallmentDto],
    description: 'Scalapay 3x interest-free installment schedule (today, +30d, +60d)',
  })
  installments: InstallmentDto[];

  @ApiProperty({ example: 48, description: 'Updated available stock after order placement' })
  remainingStock: number;

  @ApiProperty({ description: 'Order creation timestamp' })
  createdAt: string;
}
