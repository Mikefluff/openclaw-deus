import { Module } from '@nestjs/common';
import { WorldModelService } from './world-model.service';
import { WorldModelController } from './world-model.controller';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [BeliefsModule, MemoryModule],
  providers: [WorldModelService],
  controllers: [WorldModelController],
  exports: [WorldModelService],
})
export class WorldModelModule {}
