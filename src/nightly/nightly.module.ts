import { Module } from '@nestjs/common';
import { NightlyService } from './nightly.service';
import { NightlyScheduler } from './nightly.scheduler';

@Module({
  // No imports: all data access via SurrealService (@Global). IntentionModule + KnowledgeModule + CognitiveConfigModule are @Global.
  imports: [],
  providers: [NightlyService, NightlyScheduler],
  exports: [NightlyService],
})
export class NightlyModule {}
