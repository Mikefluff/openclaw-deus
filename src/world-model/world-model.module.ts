import { Global, Module } from '@nestjs/common';
import { WorldModelService } from './world-model.service';
import { WorldModelController } from './world-model.controller';

@Global()
@Module({
  // No imports: all data access via SurrealService (@Global). IntentionModule + KnowledgeModule + CognitiveConfigModule are @Global.
  imports: [],
  providers: [WorldModelService],
  controllers: [WorldModelController],
  exports: [WorldModelService],
})
export class WorldModelModule {}
