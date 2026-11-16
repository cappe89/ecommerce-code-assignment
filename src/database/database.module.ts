import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Product } from '../products/models/product.model';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isLogging =
          configService.get<string>('DB_LOGGING') === 'true' ||
          configService.get<boolean>('DB_LOGGING') === true;

        const isSync =
          configService.get<string>('DB_SYNC') !== 'false' &&
          configService.get<boolean>('DB_SYNC') !== false;

        return {
          dialect: 'mysql',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: Number(configService.get<number>('DB_PORT', 3306)),
          username: configService.get<string>('DB_USERNAME', 'ecommerce_user'),
          password: configService.get<string>('DB_PASSWORD', 'ecommerce_pass'),
          database: configService.get<string>('DB_NAME', 'ecommerce'),
          models: [Product],
          autoLoadModels: true,
          synchronize: isSync,
          logging: isLogging ? (msg: string) => console.log(msg) : false,
          pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000,
          },
          retry: {
            max: 3,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
