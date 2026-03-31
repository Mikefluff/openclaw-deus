import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';

setTimeout(() => { console.error('TIMEOUT 5s'); process.exit(1); }, 5000);

async function main() {
  console.time('boot');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  (global as any).__nestApp = app;
  console.timeEnd('boot');
  console.log('APP READY');
  await app.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.stack || e); process.exit(1); });
