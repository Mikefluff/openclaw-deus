import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SurrealService } from '../database/surreal.service';
import Surreal from 'surrealdb';

/**
 * KernelLoopService: Parallel circuit runner for autonomous SurrealDB brain.
 *
 * 4 circuits run on SEPARATE WebSocket connections (true parallelism):
 *   CRITICAL: energy + sleep (writes kernel_state)
 *   HIGH:     affect forward + trace decay (writes sched_high)
 *   MEDIUM:   inference + forgetting (writes sched_medium)
 *   LOW:      world model + introspection + neural decay (writes sched_low)
 *
 * No transaction conflicts: each circuit writes its own semaphore table.
 * Only CRITICAL writes the shared kernel_state (energy master).
 *
 * Watchdog re-kicks circuits every 2s with configurable batch sizes.
 */

export interface ParallelStatus {
  cycle: number;
  energy: number;
  fatigue: number;
  critical_tick: number;
  high_tick: number;
  medium_tick: number;
  low_tick: number;
}

@Injectable()
export class KernelLoopService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KernelLoopService.name);
  private circuits: Surreal[] = [];
  private watchdogHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private debugMode = false;
  private lastStatus: ParallelStatus | null = null;
  private batchCount = 0;

  // Circuit batch sizes (ticks per kick)
  private batchSizes = {
    critical: 10000,   // 10K energy ticks
    high: 1000,        // 1K affect ticks
    medium: 100,       // 100 inference ticks
    low: 10,           // 10 deep synthesis ticks
  };

  constructor(private readonly db: SurrealService) {}

  async onModuleInit(): Promise<void> {
    // Don't block startup — init circuits lazily on first kick
    this.watchdogHandle = setInterval(() => this.kick(), 2000);
    this.logger.log('Brain watchdog started (4 parallel circuits, re-kick every 2s)');
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.watchdogHandle) clearInterval(this.watchdogHandle);
    this.closeCircuits().catch(() => {});
  }

  // ═══════════════════════════════════════════
  // CIRCUIT MANAGEMENT
  // ═══════════════════════════════════════════

  private async ensureCircuits(): Promise<void> {
    if (this.circuits.length === 4) return;
    await this.closeCircuits();

    const config = (this.db as any).config;
    if (!config) return;

    for (let i = 0; i < 4; i++) {
      const c = new Surreal();
      try {
        await c.connect(config.url, { versionCheck: false } as any);
        await c.signin({ username: config.username, password: config.password });
        try {
          await c.query(`DEFINE NAMESPACE IF NOT EXISTS ${config.namespace}`);
          await c.query(`USE NS ${config.namespace}; DEFINE DATABASE IF NOT EXISTS ${config.database}`);
        } catch {}
        await c.use({ namespace: config.namespace, database: config.database });
        this.circuits.push(c);
      } catch {
        // DB not ready — will retry
        return;
      }
    }
    this.logger.log('4 parallel circuit connections established');
  }

  private async closeCircuits(): Promise<void> {
    for (const c of this.circuits) {
      try { await c.close(); } catch {}
    }
    this.circuits = [];
  }

  // ═══════════════════════════════════════════
  // KICK: run all 4 circuits in parallel
  // ═══════════════════════════════════════════

  private async kick(): Promise<void> {
    if (!this.running) return;

    try {
      await this.ensureCircuits();
      if (this.circuits.length < 4) return;

      // All 4 circuits run simultaneously
      await Promise.all([
        this.circuits[0].query(`RETURN fn::circuit_critical(${this.batchSizes.critical})`),
        this.circuits[1].query(`RETURN fn::circuit_high(${this.batchSizes.high})`),
        this.circuits[2].query(`RETURN fn::circuit_medium(${this.batchSizes.medium})`),
        this.circuits[3].query(`RETURN fn::circuit_low(${this.batchSizes.low})`),
      ]);

      this.batchCount++;

      // Read status
      const r = await this.db.execute('RETURN fn::run_parallel_status()');
      if (r.isOk()) {
        this.lastStatus = (r as any).value?.[0] as ParallelStatus;
        if (this.debugMode && this.batchCount % 5 === 0) {
          const s = this.lastStatus;
          this.logger.debug(
            `batch #${this.batchCount} cycle=${s?.cycle} energy=${s?.energy?.toFixed(3)} ` +
            `crit=${s?.critical_tick} high=${s?.high_tick} med=${s?.medium_tick} low=${s?.low_tick}`,
          );
        }
      }
    } catch (e) {
      // Silent — circuit may have timed out or DB busy
    }
  }

  // ═══════════════════════════════════════════
  // CONTROL
  // ═══════════════════════════════════════════

  async start(): Promise<void> {
    await this.db.execute('UPDATE kernel_state SET running = true, debug_break = false');
    this.running = true;
    this.logger.log('Brain started');
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.db.execute('UPDATE kernel_state SET running = false');
    this.logger.log('Brain stopped');
  }

  async reset(): Promise<void> {
    this.running = false;
    await this.db.execute('RETURN fn::kernel_reset_soft()');
    this.logger.log('Brain soft reset');
  }

  // ═══════════════════════════════════════════
  // DEBUG
  // ═══════════════════════════════════════════

  async enableDebug(): Promise<void> {
    this.debugMode = true;
    this.logger.log('Debug ON');
  }

  async disableDebug(): Promise<void> {
    this.debugMode = false;
    this.logger.log('Debug OFF');
  }

  async pause(): Promise<void> {
    this.running = false;
    this.logger.log('Brain paused');
  }

  async resume(): Promise<void> {
    this.running = true;
    this.logger.log('Brain resumed');
  }

  // ═══════════════════════════════════════════
  // EVENTS + STATUS
  // ═══════════════════════════════════════════

  async pushEvent(content: string, type = 'message', source?: string): Promise<void> {
    await this.db.create('kernel_event', {
      type, content, source: source ?? null, status: 'pending',
    } as Record<string, unknown>);
  }

  async getStatus(): Promise<ParallelStatus | null> {
    const r = await this.db.execute('RETURN fn::run_parallel_status()');
    if (r.isOk()) {
      this.lastStatus = (r as any).value?.[0] as ParallelStatus;
    }
    return this.lastStatus;
  }

  getLastStatus(): ParallelStatus | null { return this.lastStatus; }
  isRunning(): boolean { return this.running; }

  getHealth() {
    return {
      running: this.running,
      batchCount: this.batchCount,
      circuitsConnected: this.circuits.length,
      batchSizes: this.batchSizes,
      lastStatus: this.lastStatus,
    };
  }

  // Legacy compat
  registerAgent(_agent: any): void {}
}
