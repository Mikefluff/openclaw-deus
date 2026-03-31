import { Global, Module } from '@nestjs/common';
import { OperatorModelService } from './operator-model.service';
import { SessionTrackerService } from './services/session-tracker.service';

@Global()
@Module({
  providers: [OperatorModelService, SessionTrackerService],
  exports: [OperatorModelService, SessionTrackerService],
})
export class OperatorModelModule {}
