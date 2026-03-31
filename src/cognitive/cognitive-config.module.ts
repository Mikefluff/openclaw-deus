import { Global, Module } from '@nestjs/common';
import { CognitiveConfigService } from './cognitive-config.service';

/**
 * @Global CognitiveConfig — available everywhere without imports.
 * Only depends on SurrealService (also @Global via DatabaseModule).
 * Extracted from CognitiveModule to break circular dependency chain.
 */
@Global()
@Module({
  providers: [CognitiveConfigService],
  exports: [CognitiveConfigService],
})
export class CognitiveConfigModule {}
