import {
  Column,
  DataType,
  Model,
  Table,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

@Table({
  tableName: 'products',
  timestamps: true,
  paranoid: true, // Soft delete enabled: updates deletedAt instead of physically deleting
  version: true, // Optimistic locking enabled: manages version column and prevents lost updates
  indexes: [
    {
      name: 'idx_products_product_token_unique',
      unique: true,
      fields: ['productToken'],
    },
    {
      name: 'idx_products_created_deleted_at',
      fields: ['createdAt', 'deletedAt'],
    },
  ],
})
export class Product extends Model<Product> {
  @ApiProperty({ example: 1, description: 'Internal primary key ID' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({
    example: 'PROD-SKU-1001',
    description: 'Unique external business token/SKU',
  })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    unique: true,
  })
  productToken: string;

  @ApiProperty({
    example: 'Sony WH-1000XM5 Wireless Headphones',
    description: 'Product name',
  })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name: string;

  @ApiProperty({
    example: 349.99,
    description: 'Product price with 2 decimal places (DECIMAL 10,2)',
  })
  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
    get() {
      const rawValue = this.getDataValue('price');
      return rawValue !== null && rawValue !== undefined
        ? Number(parseFloat(rawValue.toString()).toFixed(2))
        : null;
    },
    set(val: number | string) {
      if (val !== null && val !== undefined) {
        const num = typeof val === 'number' ? val : parseFloat(val);
        this.setDataValue('price', num.toFixed(2));
      }
    },
  })
  price: number;

  @ApiProperty({
    example: 50,
    description: 'Available stock quantity (must be >= 0)',
  })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0,
    },
  })
  stock: number;

  @ApiProperty({
    example: 1,
    description: 'Entity version for optimistic locking',
  })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1,
  })
  version: number;

  @ApiProperty({ description: 'Timestamp when the product was created' })
  @Column({
    type: DataType.DATE,
  })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the product was last updated' })
  @Column({
    type: DataType.DATE,
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Timestamp when the product was soft-deleted, null if active',
    nullable: true,
  })
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  deletedAt: Date | null;
}
