import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SurrealService } from '../database/surreal.service';

/**
 * KernelLoopService: Watchdog for autonomous preemptive brain scheduler.
 *
 * Brain runs 4 concurrent loops inside SurrealDB (Rust):
 *   CRITICAL (1024 depth): energy management, sleep detection
 *   HIGH     (1024 depth): affect forward, trace decay
 *   MEDIUM   (512 depth):  inference, schemas, forgetting
 *   LOW      (256 depth):  world model, introspection, nightly
 *
 * Higher priority preempts lower (energy check at start of each tick).
 * Each loop = self-triggering EVENT chain on its own semaphore table.
 *
 * This service: watchdog (re-kicks exhausted chains) + debug + health.
 */

export interface KernelStatus {
  running: boolean;
  energy: number;
  fatigue: number;
  cycle: number;
  debug_break: boolean;
  loops: {
    critical: { tick: number; ts?: string };
    high: { tick: number; ts?: string };
    medium: { tick: number; ts?: string };
    low: { tick: number; ts?: string };
  };
}

@Injectable()
export class KernelLoopService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KernelLoopService.name);
  private watchdogHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastStatus: KernelStatus | null = null;
  private lastLoopTicks = { critical: 0, high: 0, medium: 0, low: 0 };

  constructor(private readonly db: SurrealService) {}

  onModuleInit(): void {
    // Watchdog: check loop health every 2s, re-kick stalled loops
    this.watchdogHandle = setInterval(() => this.watchdog(), 2000);
    this.logger.log('Brain watchdog started (4-loop preemptive scheduler)');
  }

  onModuleDestroy(): void {
    if (this.watchdogHandle) clearInterval(this.watchdogHandle);
    this.stop().catch(() => {});
  }

  // ═══════════════════════════════════════════
  // WATCHDOG: re-kick stalled loops
  // ═══════════════════════════════════════════

  private async watchdog(): Promise<void> {
    try {
      const result = await this.db.execute('RETURN fn::kernel_status()');
      if (!result.isOk()) return;
      const status = (result as any).value?.[0] as KernelStatus;
      if (!status) return;
      this.lastStatus = status;

      if (!status.running) return;

      // Re-kick any loop whose tick count hasn't changed (chain exhausted)
      const loops = status.loops;
      if (loops.critical.tick === this.lastLoopTicks.critical) {
        await this.db.execute('UPDATE sched_critical:main SET tick = tick + 1, ts = time::now()');
      }
      if (loops.high.tick === this.lastLoopTicks.high) {
        await this.db.execute('UPDATE sched_high:main SET tick = tick + 1, ts = time::now()');
      }
      if (loops.medium.tick === this.lastLoopTicks.medium && status.energy > 0.2) {
        await this.db.execute('UPDATE sched_medium:main SET tick = tick + 1, ts = time::now()');
      }
      if (loops.low.tick === this.lastLoopTicks.low && status.energy > 0.4) {
        await this.db.execute('UPDATE sched_low:main SET tick = tick + 1, ts = time::now()');
      }

      this.lastLoopTicks = {
        critical: loops.critical.tick,
        high: loops.high.tick,
        medium: loops.medium.tick,
        low: loops.low.tick,
      };
    } catch {
      // DB not ready — silent
    }
  }

  // ═══════════════════════════════════════════
  // CONTROL
  // ═══════════════════════════════════════════

  async start(): Promise<KernelStatus | null> {
    const result = await this.db.execute('RETURN fn::kernel_start()');
    this.running = true;
    this.logger.log('Brain started (4 loops kicked)');
    return this.getStatus();
  }

  async stop(): Promise<void> {
    await this.db.execute('RETURN fn::kernel_stop()');
    this.running = false;
    this.logger.log('Brain stopped');
  }

  async reset(): Promise<void> {
    await this.db.execute('RETURN fn::kernel_reset()');
    this.lastLoopTicks = { critical: 0, high: 0, medium: 0, low: 0 };
    this.logger.log('Brain reset');
  }

  // ═══════════════════════════════════════════
  // DEBUG
  // ═══════════════════════════════════════════

  async enableDebug(): Promise<void> {
    await this.db.execute('UPDATE kernel_state SET debug_break = true');
    this.logger.log('Debug: brain paused');
  }

  async disableDebug(): Promise<void> {
    await this.db.execute('UPDATE kernel_state SET debug_break = false');
    this.logger.log('Debug: brain resumed');
  }

  async stepOnce(): Promise<KernelStatus | null> {
    // One tick of each loop, then pause again
    const s = this.lastStatus;
    await this.db.execute('RETURN fn::sched_critical_tick($t)', { t: (s?.loops.critical.tick ?? 0) + 1 });
    await this.db.execute('RETURN fn::sched_high_tick($t)', { t: (s?.loops.high.tick ?? 0) + 1 });
    await this.db.execute('RETURN fn::sched_medium_tick($t)', { t: (s?.loops.medium.tick ?? 0) + 1 });
    await this.db.execute('RETURN fn::sched_low_tick($t)', { t: (s?.loops.low.tick ?? 0) + 1 });
    await this.db.execute('UPDATE kernel_state SET debug_break = true');
    return this.getStatus();
  }

  // ═══════════════════════════════════════════
  // EVENTS + MONITORING
  // ═══════════════════════════════════════════

  async pushEvent(content: string, type = 'message', source?: string): Promise<void> {
    await this.db.create('kernel_event', {
      type, content, source: source ?? null, status: 'pending',
    } as Record<string, unknown>);
  }

  async getStatus(): Promise<KernelStatus | null> {
    const result = await this.db.execute('RETURN fn::kernel_status()');
    if (result.isOk()) {
      this.lastStatus = (result as any).value?.[0] as KernelStatus;
      return this.lastStatus;
    }
    return null;
  }

  getLastStatus(): KernelStatus | null { return this.lastStatus; }
  isRunning(): boolean { return this.running; }

  // Legacy
  registerAgent(_agent: any): void {}
}
