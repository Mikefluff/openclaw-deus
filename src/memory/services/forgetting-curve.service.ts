import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';

/**
 * Ebbinghaus Forgetting Curve + Spaced Repetition.
 *
 * Memory strength = initial_strength * exp(-decay_rate * days_since / stability)
 * where stability increases with each successful retrieval (spaced repetition).
 *
 * Retrieval intervals follow: 1d, 3d, 7d, 14d, 30d, 60d
 */

const SPACED_REPETITION_INTERVALS = [1, 3, 7, 14, 30, 60]; // days

export interface MemoryStrength {
  content_id: string;
  content: string;
  initial_strength: number;
  current_strength: number;
  days_since: number;
  retrieval_count: number;
  next_review_days?: number;
}

@Injectable()
export class ForgettingCurveService {
  private readonly logger = new Logger(ForgettingCurveService.name);

  constructor(private readonly db: SurrealService) {}

  /**
   * Compute memory strength for knowledge items using Ebbinghaus curve.
   * strength = importance * exp(-0.3 * days / stability)
   * stability = 1 + log2(1 + retrieval_count)
   */
  computeStrength(importance: number, daysSince: number, retrievalCount: number): number {
    const stability = 1 + Math.log2(1 + retrievalCount);
    const decayRate = 0.3;
    return importance * Math.exp(-decayRate * daysSince / stability);
  }

  /**
   * Get knowledge items that need spaced repetition review.
   * Returns items whose strength is decaying toward threshold but were originally high-confidence.
   */
  async getReviewCandidates(threshold = 0.5): Promise<Result<MemoryStrength[], DomainError>> {
    const result = await this.db.query<any>(
      `SELECT
        knowledge_id AS content_id,
        content,
        confidence.point AS initial_strength,
        array::len(evidence) AS retrieval_count,
        (time::millis(time::now()) - time::millis(updated_at)) / 86400000 AS days_since
      FROM knowledge
      WHERE status = 'active'
        AND confidence.point >= 0.6
      ORDER BY updated_at ASC
      LIMIT 50`,
    );

    if (result.isErr()) return err(result.error);

    const candidates: MemoryStrength[] = [];
    for (const item of result.value) {
      const strength = this.computeStrength(
        item.initial_strength || 0.5,
        item.days_since || 0,
        item.retrieval_count || 0,
      );

      if (strength < threshold && strength > 0.1) {
        // Determine next review interval based on retrieval count
        const intervalIdx = Math.min(item.retrieval_count || 0, SPACED_REPETITION_INTERVALS.length - 1);
        const nextReview = SPACED_REPETITION_INTERVALS[intervalIdx];

        candidates.push({
          content_id: item.content_id,
          content: item.content,
          initial_strength: item.initial_strength || 0.5,
          current_strength: Math.round(strength * 1000) / 1000,
          days_since: Math.round(item.days_since || 0),
          retrieval_count: item.retrieval_count || 0,
          next_review_days: nextReview,
        });
      }
    }

    return ok(candidates.sort((a, b) => a.current_strength - b.current_strength));
  }

  /**
   * Weight memories by forgetting curve for retrieval.
   * Recent + important + frequently-retrieved memories get higher weight.
   */
  weightByForgetting<T extends { importance_score?: number; timestamp?: string; retrieval_count?: number }>(
    items: T[],
    now = new Date(),
  ): Array<T & { memory_weight: number }> {
    return items.map((item) => {
      const importance = item.importance_score ?? 0.5;
      const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : now.getTime();
      const daysSince = (now.getTime() - timestamp) / 86400000;
      const retrievalCount = item.retrieval_count ?? 0;
      const weight = this.computeStrength(importance, daysSince, retrievalCount);
      return { ...item, memory_weight: Math.round(weight * 1000) / 1000 };
    }).sort((a, b) => b.memory_weight - a.memory_weight);
  }
}
