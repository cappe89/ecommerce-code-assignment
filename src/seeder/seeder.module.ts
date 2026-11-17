import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { CatalogSeederService } from './catalog-seeder.service';

@Module({
  imports: [ProductsModule],
  providers: [CatalogSeederService],
  exports: [CatalogSeederService],
})
export class SeederModule {}
