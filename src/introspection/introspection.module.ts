import { Global, Module } from '@nestjs/common';
import { IntrospectionService } from './introspection.service';
import { IntrospectionController } from './introspection.controller';

@Global()
@Module({
  // No imports: all data access via SurrealService (@Global). IntentionModule + KnowledgeModule + CognitiveConfigModule are @Global.
  imports: [],
  providers: [IntrospectionService],
  controllers: [IntrospectionController],
  exports: [IntrospectionService],
})
export class IntrospectionModule {}
