import { Global, Module } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyController } from './policy.controller';
import { DissensusService } from './services/dissensus.service';
import { RipenessService } from './services/ripeness.service';
import { IntentNormalizerService } from './services/intent-normalizer.service';

@Global()
@Module({
  // No imports: all data access via SurrealService (@Global). IntentionModule + KnowledgeModule + CognitiveConfigModule are @Global.
  imports: [],
  providers: [PolicyService, DissensusService, RipenessService, IntentNormalizerService],
  controllers: [PolicyController],
  exports: [PolicyService, DissensusService, RipenessService, IntentNormalizerService],
})
export class PolicyModule {}
