import { Module } from '@nestjs/common';
import { NightlyService } from './nightly.service';
import { NightlyScheduler } from './nightly.scheduler';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { MemoryModule } from '../memory/memory.module';
import { IntrospectionModule } from '../introspection/introspection.module';

@Module({
  imports: [BeliefsModule, MemoryModule, IntrospectionModule],
  providers: [NightlyService, NightlyScheduler],
  exports: [NightlyService],
})
export class NightlyModule {}
