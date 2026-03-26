import { Module } from '@nestjs/common';
import { TraceGraphService } from './memory/trace-graph.service';
import { CommitKernelService } from './commit/commit-kernel.service';
import { KernelLoopService } from './kernel-loop.service';

@Module({
  providers: [
    TraceGraphService,
    CommitKernelService,
    KernelLoopService,
  ],
  exports: [
    TraceGraphService,
    CommitKernelService,
    KernelLoopService,
  ],
})
export class KernelModule {}
