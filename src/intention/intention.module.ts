import { Global, Module } from '@nestjs/common';
import { IntentionService } from './intention.service';
import { IntentionRecognitionService } from './services/intention-recognition.service';
import { IntentionStackService } from './services/intention-stack.service';
import { IntentionController } from './intention.controller';

@Global()
@Module({
  providers: [IntentionService, IntentionRecognitionService, IntentionStackService],
  controllers: [IntentionController],
  exports: [IntentionService, IntentionRecognitionService, IntentionStackService],
})
export class IntentionModule {}
