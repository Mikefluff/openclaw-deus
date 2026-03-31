import { Global, Module } from '@nestjs/common';
import { DeliberationService } from './deliberation.service';

@Global()
@Module({
  // No imports: all data access via SurrealService (@Global). IntentionModule + KnowledgeModule + CognitiveConfigModule are @Global.
  imports: [],
  providers: [DeliberationService],
  exports: [DeliberationService],
})
export class DeliberationModule {}
