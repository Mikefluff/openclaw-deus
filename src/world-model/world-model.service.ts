import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { WorldModel } from '../common/types/world-model.types';
import { BeliefsService } from '../beliefs/beliefs.service';
import { MemoryService } from '../memory/memory.service';
import { IntentionService } from '../intention/intention.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KnowledgeGapService } from '../knowledge/services/knowledge-gap.service';
import { OperatorModelService } from '../operator-model/operator-model.service';
import { EpisodeService } from '../experience/episode.service';

@Injectable()
export class WorldModelService {
  private readonly logger = new Logger(WorldModelService.name);

  constructor(
    private readonly beliefs: BeliefsService,
    private readonly memory: MemoryService,
    private readonly intentions: IntentionService,
    private readonly knowledge: KnowledgeService,
    private readonly gaps: KnowledgeGapService,
    private readonly operatorModel: OperatorModelService,
    private readonly episodes: EpisodeService,
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  async build(now?: Date): Promise<Result<WorldModel, DomainError>> {
    const currentTime = now || new Date();
    const dayKey = currentTime.toISOString().slice(0, 10);

    // === Gather data from ALL sources ===

    // v2: beliefs (legacy, still used for axioms)
    const allBeliefs = await this.beliefs.findAll();
    const beliefs = allBeliefs.isOk() ? allBeliefs.value : [];

    // v4: knowledge
    const allKnowledge = await this.knowledge.findAll({ status: 'active' });
    const knowledgeItems = allKnowledge.isOk() ? allKnowledge.value : [];

    // v4: intentions
    const activeIntentions = await this.intentions.findActive();
    const intentionsList = activeIntentions.isOk() ? activeIntentions.value : [];
    const topIntention = intentionsList.length > 0 ? intentionsList[0] : null;

    // v4: knowledge gaps
    const openGaps = await this.gaps.findOpen();
    const gapsList = openGaps.isOk() ? openGaps.value : [];
    const highImpactGaps = await this.gaps.findHighImpact(0.7);
    const highGaps = highImpactGaps.isOk() ? highImpactGaps.value : [];

    // v4: operator model
    const opModel = await this.operatorModel.getModel();
    const operator = opModel.isOk() ? opModel.value : null;

    // v4: episodes (success rate)
    const successRate = await this.episodes.getSuccessRate();
    const agentSuccessRate = successRate.isOk() ? successRate.value : 0.5;

    // Memory
    const recentEntries = await this.memory.getRecentEntries(7);
    const memoryDays = recentEntries.isOk()
      ? [...new Set(recentEntries.value.map((e) => e.day_key))].length : 0;
    const latestMemoryDay = recentEntries.isOk() && recentEntries.value.length > 0
      ? recentEntries.value[0].day_key : null;
    const logCount = recentEntries.isOk() ? recentEntries.value.length : 0;

    const memoryFreshnessDays = latestMemoryDay
      ? Math.floor((currentTime.getTime() - new Date(latestMemoryDay).getTime()) / 86400000) : 999;
    const staleDays = this.config.get('worldmodel.memory_stale_days');

    // Introspection
    const latestIntrospection = await this.db.query<{ generated_at: string; posture: string }>(
      'SELECT generated_at, posture FROM introspection_report ORDER BY generated_at DESC LIMIT 1',
    );
    const introDate = latestIntrospection.isOk() && latestIntrospection.value.length > 0
      ? latestIntrospection.value[0].generated_at : null;

    // === Build invariants from both v2 (beliefs) and v4 (knowledge axioms) ===
    const beliefInvariants = beliefs.filter((b) => /^I\d+$/.test(b.belief_id))
      .map((b) => ({ id: b.belief_id, content: b.content, confidence: b.confidence }));
    const knowledgeAxioms = knowledgeItems.filter((k) => k.kind === 'axiom')
      .map((k) => ({ id: k.knowledge_id, content: k.content, confidence: (k.confidence as any).point || k.confidence as any }));
    const invariants = [...beliefInvariants, ...knowledgeAxioms];

    // === Build goals from intentions (v4) + legacy beliefs ===
    const intentionGoals = intentionsList.filter((i) => i.kind === 'goal')
      .map((i) => ({ id: i.intention_id, content: i.description, confidence: i.priority }));
    const beliefGoals = beliefs.filter((b) => /^G\d+$/.test(b.belief_id))
      .map((b) => ({ id: b.belief_id, content: b.content, confidence: b.confidence }));
    const goals = [...intentionGoals, ...beliefGoals];

    // === Confidence calculation ===
    const confidence = this.calculateConfidence({
      beliefCount: beliefs.length,
      knowledgeCount: knowledgeItems.length,
      intentionCount: intentionsList.length,
      memoryDays,
      logCount,
      gapCount: gapsList.length,
      agentSuccessRate,
    });

    // === Assemble world model ===
    const model: WorldModel = {
      version: 2,
      generated_at: currentTime.toISOString(),
      workspace_day: dayKey,
      confidence,

      self_model: {
        agency_level: 'L2+',
        invariants,
        goals,
        review_pressure: gapsList.length + highGaps.length,
        active_limitations: [
          ...(memoryFreshnessDays > staleDays ? ['stale_memory'] : []),
          ...(knowledgeItems.length < 5 ? ['low_knowledge_base'] : []),
          ...(agentSuccessRate < 0.5 ? ['low_success_rate'] : []),
        ],
      },

      human_model: {
        preferences: operator?.expertise?.map((e) => `${e.domain}: ${e.level}`) || [],
        constraints: operator?.patterns ? [
          ...(operator.patterns.active_hours ? [`Active hours: ${operator.patterns.active_hours}`] : []),
          `Review style: ${operator.patterns.review_style}`,
        ] : [],
        active_requests: intentionsList
          .filter((i) => i.source === 'operator_explicit' && i.status === 'active')
          .map((i) => i.description),
      },

      workspace_model: {
        active_project: topIntention?.description || null,
        mode: intentionsList.length > 0 ? 'active' : 'idle',
        status: intentionsList.some((i) => i.progress.blockers.length > 0) ? 'blocked' : 'active',
        repo_dirty: false,
        memory_freshness_days: memoryFreshnessDays,
        introspection_date: introDate,
        next_step: topIntention?.progress.last_action || null,
      },

      environment_model: {
        waiting_conditions: intentionsList
          .filter((i) => i.status === 'suspended')
          .map((i) => `Waiting: ${i.description}`),
        dependencies: intentionsList
          .filter((i) => i.progress.blockers.length > 0)
          .flatMap((i) => i.progress.blockers),
        open_tensions: highGaps.map((g) => g.description),
        external_systems: [],
      },

      action_priors: {
        hard_blocks: gapsList
          .filter((g) => g.impact > 0.8)
          .map((g) => `Knowledge gap: ${g.description}`),
        preferred_modes: operator?.patterns?.prefers_autonomous_work
          ? ['direct_act', 'prepare_conditions']
          : ['observe', 'analyze'],
        active_risks: [
          ...(memoryFreshnessDays > 5 ? ['stale_context'] : []),
          ...(agentSuccessRate < 0.6 ? ['low_success_rate_risk'] : []),
          ...(operator?.session?.frustration_signals && operator.session.frustration_signals > 3 ? ['operator_frustrated'] : []),
        ],
      },

      sources: {
        beliefs: { count: beliefs.length },
        memory: { days: memoryDays, latest_day: latestMemoryDay },
        logs: { entries: logCount },
        pending_beliefs: { count: 0 },
        status: { exists: true },
      },
    };

    await this.db.create('world_model', model as any);
    return ok(model);
  }

  async getLatest(): Promise<Result<WorldModel | null, DomainError>> {
    const result = await this.db.query<WorldModel>('SELECT * FROM world_model ORDER BY generated_at DESC LIMIT 1');
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] || null);
  }

  isFresh(model: WorldModel, now?: Date): boolean {
    const currentTime = now || new Date();
    const hoursOld = (currentTime.getTime() - new Date(model.generated_at).getTime()) / 3600000;
    return hoursOld < this.config.get('worldmodel.stale_after_hours');
  }

  private calculateConfidence(data: {
    beliefCount: number; knowledgeCount: number; intentionCount: number;
    memoryDays: number; logCount: number; gapCount: number; agentSuccessRate: number;
  }): number {
    let score = 0.2; // base
    if (data.beliefCount > 5 || data.knowledgeCount > 5) score += 0.15;
    if (data.knowledgeCount > 10) score += 0.1;
    if (data.intentionCount > 0) score += 0.1; // we know what we're doing
    if (data.memoryDays > 0) score += 0.15;
    if (data.logCount > 0) score += 0.1;
    if (data.gapCount === 0) score += 0.1; // no open questions
    score += data.agentSuccessRate * 0.1; // competence boost
    return Math.min(1.0, Math.round(score * 1000) / 1000);
  }
}
