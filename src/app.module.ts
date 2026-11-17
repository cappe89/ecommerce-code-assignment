import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { SeederModule } from './seeder/seeder.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'test'
          ? '.env.test'
          : process.env.NODE_ENV === 'development'
          ? ['.env.development', '.env']
          : ['.env.production', '.env'],
    }),
    DatabaseModule,
    ProductsModule,
    OrdersModule,
    SeederModule,
  ],
})
export class AppModule {}
