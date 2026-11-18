import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AppModule } from '../app.module';

/**
 * Standalone migration/sync script for production and CI/CD pipelines.
 * Explicitly synchronizes Sequelize models to the database without needing DB_SYNC=true at app runtime.
 * Usage:
 *   - Local / Development: npm run db:sync
 *   - Production Container: node dist/scripts/sync-schema.js
 */
async function syncSchema() {
  const logger = new Logger('DatabaseSync');
  logger.log('Starting controlled database schema synchronization...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const sequelize = app.get<Sequelize>(getConnectionToken());
    logger.log('Synchronizing Sequelize models to target database...');
    // Safe sync: creates tables/indexes if not exist, does not drop existing data
    await sequelize.sync();
    logger.log('✅ Database schema synchronization completed successfully.');
  } catch (error: any) {
    logger.error(`❌ Schema synchronization failed: ${error?.message || error}`);
    process.exit(1);
  } finally {
    await app.close();
    process.exit(0);
  }
}

syncSchema();
