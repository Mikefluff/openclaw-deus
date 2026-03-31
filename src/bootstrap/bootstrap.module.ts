import { Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
