import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ProductsService } from '../products/products.service';

@Injectable()
export class CatalogSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSeederService.name);

  constructor(private readonly productsService: ProductsService) {}

  /**
   * Automatically seeds initial demo products on startup if the catalog is empty.
   * Demonstrates programmatic consumption of ProductsService (findAll and create).
   * Runs EXCLUSIVELY in local development environment (NODE_ENV === 'development').
   * In production, test, and staging environments, auto-seeding is strictly bypassed.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV !== 'development') {
      this.logger.log(
        `Skipping catalog auto-seeding: environment is "${process.env.NODE_ENV || 'production'}" (auto-seeding only runs in "development").`,
      );
      return;
    }

    try {
      const existing = await this.productsService.findAll({ page: 1, limit: 1 });
      if (existing.meta.total === 0) {
        this.logger.log('📦 Database catalog is empty. Auto-seeding initial demo products...');

        const demoProducts = [
          {
            productToken: 'SONY-WH1000XM5',
            name: 'Sony WH-1000XM5 Wireless Headphones',
            price: 349.99,
            stock: 50,
          },
          {
            productToken: 'APPLE-IPHONE15-128',
            name: 'Apple iPhone 15 128GB Black',
            price: 849.0,
            stock: 25,
          },
          {
            productToken: 'MACBOOK-AIR-M3',
            name: 'MacBook Air 13" M3 8-Core 256GB',
            price: 1199.0,
            stock: 15,
          },
          {
            productToken: 'LOGI-MX-MASTER-3S',
            name: 'Logitech MX Master 3S Wireless Mouse',
            price: 99.99,
            stock: 80,
          },
        ];

        for (const item of demoProducts) {
          await this.productsService.create(item);
        }

        this.logger.log(
          `✅ Successfully seeded ${demoProducts.length} demo products into the catalog.`,
        );
      } else {
        this.logger.log(
          `ℹ️ Catalog already initialized (${existing.meta.total} products found). Skipping seeding.`,
        );
      }
    } catch (err: any) {
      this.logger.warn(`Could not complete catalog auto-seeding: ${err?.message}`);
    }
  }
}
