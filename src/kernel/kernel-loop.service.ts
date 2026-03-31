import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SurrealService } from '../database/surreal.service';

/**
 * KernelLoopService: Watchdog + monitor for autonomous SurrealDB brain.
 *
 * The brain runs INSIDE SurrealDB via self-triggering events:
 *   kernel_state UPDATE → EVENT kernel_heartbeat → fn::kernel_tick → UPDATE kernel_state → ...
 *   Chain depth: up to 256 ticks per kick. Watchdog re-kicks when chain exhausts.
 *
 * This service:
 * 1. Kicks the brain (starts self-trigger chain) — once on init, re-kick every few seconds
 * 2. Monitors brain health via LIVE SELECT on kernel_state
 * 3. Pushes external events to kernel_event table
 * 4. Debug mode: logs every Nth tick
 *
 * NOT an orchestrator. The brain orchestrates itself.
 */

export interface KernelState {
  cycle: number;
  energy: number;
  fatigue: number;
  mode: string;
  depth?: number;
  spread?: number;
  needs_sleep?: boolean;
  phenomenal?: {
    dominant_traces: Array<{ trace_id: string; content: string; weight: number }>;
    conflicts: Array<{ a: string; b: string; w: number }>;
  };
}

@Injectable()
export class KernelLoopService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KernelLoopService.name);
  private kickHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private debugMode = false;
  private lastState: KernelState | null = null;
  private kickCount = 0;

  constructor(private readonly db: SurrealService) {}

  onModuleInit(): void {
    this.running = true;
    // Watchdog: re-kick brain every 2s if chain exhausted (256 ticks per chain)
    this.kickHandle = setInterval(() => this.kick(), 2000);
    this.logger.log('Brain watchdog started (re-kick every 2s, 256 ticks/chain)');
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.kickHandle) clearInterval(this.kickHandle);
    this.stop().catch(() => {});
    this.logger.log('Brain watchdog stopped');
  }

  // ═══════════════════════════════════════════
  // KICK: restarts the self-trigger chain in SurrealDB
  // ═══════════════════════════════════════════

  private async kick(): Promise<void> {
    if (!this.running) return;
    try {
      // Kick the brain: increment cycle → triggers EVENT → chain of 256 ticks
      const result = await this.db.execute(
        `UPDATE kernel_state SET running = true, cycle = (cycle ?? 0) + 1`,
      );
      this.kickCount++;

      // Read state for monitoring
      const state = await this.db.execute('RETURN fn::kernel_get_state()');
      if (state.isOk()) {
        this.lastState = (state as any).value?.[0] as KernelState;
        if (this.debugMode) {
          const s = this.lastState;
          this.logger.debug(
            `kick #${this.kickCount} cycle=${s?.cycle} energy=${s?.energy?.toFixed(3)} fatigue=${s?.fatigue?.toFixed(3)} depth=${s?.depth} mode=${s?.mode}`,
          );
        }
      }
    } catch (e) {
      // DB not ready yet — silent, will retry
    }
  }

  // ═══════════════════════════════════════════
  // START / STOP
  // ═══════════════════════════════════════════

  async start(): Promise<void> {
    await this.db.execute(`UPDATE kernel_state SET running = true`);
    this.running = true;
    this.logger.log('Brain started');
  }

  async stop(): Promise<void> {
    await this.db.execute(`UPDATE kernel_state SET running = false`);
    this.running = false;
    this.logger.log('Brain stopped');
  }

  // ═══════════════════════════════════════════
  // EXTERNAL EVENTS (world → brain)
  // ═══════════════════════════════════════════

  async pushEvent(content: string, type = 'message', source?: string): Promise<void> {
    await this.db.create('kernel_event', {
      type, content, source: source ?? null, status: 'pending',
    } as Record<string, unknown>);
  }

  // ═══════════════════════════════════════════
  // MONITORING
  // ═══════════════════════════════════════════

  enableDebug(): void { this.debugMode = true; this.logger.log('Debug ON'); }
  disableDebug(): void { this.debugMode = false; this.logger.log('Debug OFF'); }

  getState(): KernelState | null { return this.lastState; }
  isRunning(): boolean { return this.running; }

  getHealth(): { running: boolean; kickCount: number; lastState: KernelState | null } {
    return { running: this.running, kickCount: this.kickCount, lastState: this.lastState };
  }

  // Legacy compatibility
  registerAgent(_agent: any): void { /* agents now in SurrealDB */ }
}
