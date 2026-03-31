import { Global, Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';

@Global()
@Module({
  imports: [],
  providers: [HealthService],
  controllers: [HealthController],
  exports: [HealthService],
})
export class HealthModule {}
