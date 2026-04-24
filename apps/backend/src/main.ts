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

function assertRequiredProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (!process.env.INTERNAL_API_AUTH_SECRET?.trim()) {
    throw new Error('INTERNAL_API_AUTH_SECRET is required in production.');
  }
}

async function bootstrap() {
  assertRequiredProductionSecrets();

  const app = await NestFactory.create(AppModule);
  const apiPrefix = process.env.API_PREFIX ?? 'api';
  const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3200';
  const port = Number(process.env.PORT ?? 3003);

  app.use((_request: unknown, response: {
    setHeader: (name: string, value: string) => void;
  }, next: () => void) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: appOrigin.split(',').map((value) => value.trim()),
    credentials: true
  });

  await app.listen(port, '0.0.0.0');
  console.log(`[Bootstrap] API running on http://localhost:${port}/${apiPrefix}`);
}

void bootstrap();
