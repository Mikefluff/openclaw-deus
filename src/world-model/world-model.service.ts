import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { WorldModel } from '../common/types/world-model.types';
import { BeliefsService } from '../beliefs/beliefs.service';
import { MemoryService } from '../memory/memory.service';
import { Belief } from '../common/types/belief.types';

const STALE_AFTER_HOURS = 6;

@Injectable()
export class WorldModelService {
  private readonly logger = new Logger(WorldModelService.name);

  constructor(
    private readonly beliefs: BeliefsService,
    private readonly memory: MemoryService,
    private readonly db: SurrealService,
  ) {}

  async build(now?: Date): Promise<Result<WorldModel, DomainError>> {
    const currentTime = now || new Date();
    const dayKey = currentTime.toISOString().slice(0, 10);

    const allBeliefs = await this.beliefs.findAll();
    if (allBeliefs.isErr()) return err(allBeliefs.error);
    const beliefs = allBeliefs.value;

    const recentEntries = await this.memory.getRecentEntries(7);
    const memoryDays = recentEntries.isOk()
      ? [...new Set(recentEntries.value.map((e) => e.day_key))].length
      : 0;
    const latestMemoryDay = recentEntries.isOk() && recentEntries.value.length > 0
      ? recentEntries.value[0].day_key
      : null;

    const pendingReview = await this.db.query<{ count: number }>(
      `SELECT count() AS count FROM review_candidate WHERE status = 'pending' GROUP ALL`,
    );
    const pendingCount = pendingReview.isOk() && pendingReview.value[0] ? pendingReview.value[0].count : 0;

    const logCount = recentEntries.isOk() ? recentEntries.value.length : 0;
    const memoryFreshnessDays = latestMemoryDay
      ? Math.floor((currentTime.getTime() - new Date(latestMemoryDay).getTime()) / 86400000)
      : 999;

    const invariants = beliefs.filter((b) => /^I\d+$/.test(b.belief_id));
    const goals = beliefs.filter((b) => /^G\d+$/.test(b.belief_id));
    const userPrefs = beliefs.filter((b) => b.belief_class === 'user_model' && b.status === 'active');

    const activeBeliefs = beliefs.filter((b) => b.status === 'active');
    const lowConfidence = activeBeliefs.filter((b) => b.confidence < 0.7);
    const avgConfidence = activeBeliefs.length > 0
      ? activeBeliefs.reduce((sum, b) => sum + b.confidence, 0) / activeBeliefs.length
      : 0;

    const confidence = this.calculateConfidence(beliefs.length, memoryDays, logCount, pendingCount);

    const model: WorldModel = {
      version: 1,
      generated_at: currentTime.toISOString(),
      workspace_day: dayKey,
      confidence,
      self_model: {
        agency_level: 'L2+',
        invariants: invariants.map((b) => ({ id: b.belief_id, content: b.content, confidence: b.confidence })),
        goals: goals.map((b) => ({ id: b.belief_id, content: b.content, confidence: b.confidence })),
        review_pressure: pendingCount + lowConfidence.length,
        active_limitations: memoryFreshnessDays > 3 ? ['stale_memory'] : [],
      },
      human_model: {
        preferences: userPrefs.map((b) => b.content),
        constraints: [],
        active_requests: [],
      },
      workspace_model: {
        active_project: null,
        mode: 'idle',
        status: 'idle',
        repo_dirty: false,
        memory_freshness_days: memoryFreshnessDays,
        introspection_date: null,
        next_step: null,
      },
      environment_model: {
        waiting_conditions: [],
        dependencies: [],
        open_tensions: [],
        external_systems: [],
      },
      action_priors: {
        hard_blocks: [],
        preferred_modes: ['observe', 'analyze'],
        active_risks: memoryFreshnessDays > 5 ? ['stale_context'] : [],
      },
      sources: {
        beliefs: { count: beliefs.length },
        memory: { days: memoryDays, latest_day: latestMemoryDay },
        logs: { entries: logCount },
        pending_beliefs: { count: pendingCount },
        status: { exists: true },
      },
    };

    // Persist snapshot
    await this.db.create('world_model', model as any);

    return ok(model);
  }

  async getLatest(): Promise<Result<WorldModel | null, DomainError>> {
    const result = await this.db.query<WorldModel>(
      'SELECT * FROM world_model ORDER BY generated_at DESC LIMIT 1',
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] || null);
  }

  isFresh(model: WorldModel, now?: Date): boolean {
    const currentTime = now || new Date();
    const hoursOld = (currentTime.getTime() - new Date(model.generated_at).getTime()) / 3600000;
    return hoursOld < STALE_AFTER_HOURS;
  }

  private calculateConfidence(beliefCount: number, memoryDays: number, logEntries: number, pendingCount: number): number {
    let score = 0.3; // base
    if (beliefCount > 5) score += 0.2;
    if (memoryDays > 0) score += 0.2;
    if (logEntries > 0) score += 0.15;
    if (pendingCount === 0) score += 0.15; // no unresolved review pressure
    return Math.min(1.0, Math.round(score * 1000) / 1000);
  }
}
