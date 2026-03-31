import { Global, Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeExtractionService } from './services/knowledge-extraction.service';
import { KnowledgeGapService } from './services/knowledge-gap.service';
import { KnowledgeController } from './knowledge.controller';

@Global()
@Module({
  providers: [KnowledgeService, KnowledgeExtractionService, KnowledgeGapService],
  controllers: [KnowledgeController],
  exports: [KnowledgeService, KnowledgeExtractionService, KnowledgeGapService],
})
export class KnowledgeModule {}
