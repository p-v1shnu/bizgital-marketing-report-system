import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

for (const candidate of [
  resolve(process.cwd(), 'apps/backend/.env'),
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env')
]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const apiPrefix = process.env.API_PREFIX ?? 'api';
  const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3200';
  const port = Number(process.env.PORT ?? 3003);

  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: appOrigin.split(',').map((value) => value.trim()),
    credentials: true
  });

  await app.listen(port, '0.0.0.0');
  console.log(`[Bootstrap] API running on http://localhost:${port}/${apiPrefix}`);
}

void bootstrap();
