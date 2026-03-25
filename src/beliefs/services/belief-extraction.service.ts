import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { Belief, ExtractionCandidate, ExtractionStats } from '../../common/types/belief.types';
import { EXTRACTION_PATTERNS, hasExtractionSignal } from '../../common/constants/extraction.constants';
import { EXTRACTION_POLICY } from '../../common/constants/belief.constants';
import { BeliefsService } from '../beliefs.service';
import { BeliefPromotionService } from './belief-promotion.service';

@Injectable()
export class BeliefExtractionService {
  private readonly logger = new Logger(BeliefExtractionService.name);

  constructor(
    private readonly beliefs: BeliefsService,
    private readonly promotion: BeliefPromotionService,
    private readonly db: SurrealService,
  ) {}

  async extractFromMemory(sinceDay?: string): Promise<Result<ExtractionStats, DomainError>> {
    // Get recent memory entries to extract from
    const dayCondition = sinceDay
      ? `WHERE day_key >= $since`
      : `WHERE day_key >= $since`;
    const since = sinceDay || this.daysAgo(7);

    const entries = await this.db.query<{ day_key: string; sections: Record<string, string[]> }>(
      `SELECT day_key, sections FROM daily_memory ${dayCondition} ORDER BY day_key`,
      { since },
    );

    if (entries.isErr()) return err(entries.error);
    if (entries.value.length === 0) {
      return ok({ timestamp: new Date().toISOString(), files_processed: 0, extracted: 0, updated: 0, deferred: 0, total_beliefs: 0 });
    }

    const allBeliefs = await this.beliefs.findAll();
    if (allBeliefs.isErr()) return err(allBeliefs.error);
    const beliefs = allBeliefs.value;

    let extracted = 0, updated = 0, deferred = 0;

    for (const memory of entries.value) {
      // Flatten sections into one text block
      const content = Object.values(memory.sections || {})
        .flat()
        .join('\n');

      const candidates = this.extractCandidates(content, memory.day_key);

      for (const candidate of candidates) {
        const existing = this.findExistingBelief(beliefs, candidate.content);

        if (existing) {
          // Reinforce existing belief
          existing.confidence = Math.min(1.0, existing.confidence + EXTRACTION_POLICY.reinforcementBoost);
          existing.timestamp_updated = new Date().toISOString();
          existing.drift_history.push({
            timestamp: new Date().toISOString(),
            confidence: existing.confidence,
            reason: 'reinforced_by_new_evidence',
            source: memory.day_key,
          });
          await this.beliefs.update(existing.belief_id, {
            confidence: existing.confidence,
          });
          updated++;
        } else if (candidate.autoPromote) {
          // Auto-promote strong signals
          const result = await this.beliefs.create({
            content: candidate.content,
            confidence: candidate.confidence,
            evidence_set: [memory.day_key],
            source_type: 'inference',
            belief_class: 'operational',
            decay_mode: 'normal',
            confidence_floor: 0.5,
            review_threshold: 0.7,
            context_scope: candidate.category,
            inference_trace: ['pattern_extraction', `keyword_match_${candidate.type}`, 'auto_promote_strong_signal'],
          });
          if (result.isOk()) {
            beliefs.push(result.value);
            extracted++;
          }
        } else {
          // Defer to review queue
          await this.promotion.addToReviewQueue({
            content: candidate.content,
            confidence_proposal: candidate.confidence,
            source: memory.day_key,
            category: candidate.category,
            prefix: candidate.prefix,
          });
          deferred++;
        }
      }
    }

    return ok({
      timestamp: new Date().toISOString(),
      files_processed: entries.value.length,
      extracted,
      updated,
      deferred,
      total_beliefs: beliefs.length,
    });
  }

  extractCandidates(content: string, source: string): ExtractionCandidate[] {
    const candidates: ExtractionCandidate[] = [];

    for (const [type, config] of Object.entries(EXTRACTION_PATTERNS)) {
      for (const pattern of config.patterns) {
        // Reset regex state
        const regex = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
          const matchedContent = match[1]?.trim();
          if (!matchedContent || matchedContent.length < 5) continue;

          const hasStrongSignal = hasExtractionSignal(matchedContent);
          const confidence = hasStrongSignal
            ? EXTRACTION_POLICY.strongSignalConfidence
            : EXTRACTION_POLICY.weakSignalConfidence;

          candidates.push({
            content: matchedContent,
            confidence,
            category: config.category,
            prefix: config.prefix,
            type,
            autoPromote: hasStrongSignal && matchedContent.length > EXTRACTION_POLICY.autoPromoteMinExplicitMatchLength,
          });
        }
      }
    }

    return candidates;
  }

  findExistingBelief(beliefs: Belief[], content: string): Belief | null {
    for (const belief of beliefs) {
      if (this.calculateSimilarity(belief.content, content) > EXTRACTION_POLICY.existingBeliefSimilarityThreshold) {
        return belief;
      }
    }
    return null;
  }

  calculateSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const bWords = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    if (aWords.size === 0 || bWords.size === 0) return 0;
    const intersection = new Set([...aWords].filter((x) => bWords.has(x)));
    return intersection.size / Math.max(aWords.size, bWords.size);
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
