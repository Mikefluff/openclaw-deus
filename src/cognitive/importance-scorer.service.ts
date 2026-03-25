import { Injectable } from '@nestjs/common';
import { ImportanceScore } from '../common/types/cognitive.types';
import { ActivityLogEntry } from '../common/types/memory.types';

const TYPE_IMPACT: Record<string, number> = {
  decision: 0.9,
  interaction: 0.8,
  git: 0.5,
  command: 0.3,
  event: 0.4,
};

const IMPORTANCE_WEIGHTS = {
  impact: 0.30,
  uniqueness: 0.20,
  relevance: 0.25,
  user_involvement: 0.15,
  belief_impact: 0.10,
};

@Injectable()
export class ImportanceScorerService {
  private recentDescriptions: string[] = [];

  /**
   * Score importance of an activity log entry.
   * Higher score = more worth remembering.
   */
  score(entry: ActivityLogEntry, context?: { activeGoals?: string[]; beliefTriggered?: boolean }): ImportanceScore {
    const factors = {
      impact: this.scoreImpact(entry),
      uniqueness: this.scoreUniqueness(entry),
      relevance: this.scoreRelevance(entry, context?.activeGoals || []),
      user_involvement: entry.type === 'interaction' ? 1.0 : entry.type === 'decision' ? 0.7 : 0.3,
      belief_impact: context?.beliefTriggered ? 1.0 : 0.0,
    };

    const score = Object.entries(IMPORTANCE_WEIGHTS)
      .reduce((sum, [key, weight]) => sum + (factors[key as keyof typeof factors] || 0) * weight, 0);

    // Track for uniqueness computation
    this.recentDescriptions.push(entry.description);
    if (this.recentDescriptions.length > 100) this.recentDescriptions.shift();

    return {
      score: Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000,
      factors,
    };
  }

  private scoreImpact(entry: ActivityLogEntry): number {
    return TYPE_IMPACT[entry.type] ?? 0.3;
  }

  private scoreUniqueness(entry: ActivityLogEntry): number {
    if (this.recentDescriptions.length === 0) return 1.0;

    // How different is this from recent entries?
    const desc = entry.description.toLowerCase();
    let maxOverlap = 0;

    for (const recent of this.recentDescriptions.slice(-20)) {
      const recentLower = recent.toLowerCase();
      const overlap = this.wordOverlap(desc, recentLower);
      if (overlap > maxOverlap) maxOverlap = overlap;
    }

    return 1.0 - maxOverlap;
  }

  private scoreRelevance(entry: ActivityLogEntry, activeGoals: string[]): number {
    if (activeGoals.length === 0) return 0.5;

    const desc = entry.description.toLowerCase();
    for (const goal of activeGoals) {
      if (this.wordOverlap(desc, goal.toLowerCase()) > 0.3) return 0.9;
    }
    return 0.3;
  }

  private wordOverlap(a: string, b: string): number {
    const aWords = new Set(a.split(/\s+/).filter(w => w.length > 3));
    const bWords = new Set(b.split(/\s+/).filter(w => w.length > 3));
    if (aWords.size === 0 || bWords.size === 0) return 0;
    const intersection = [...aWords].filter(w => bWords.has(w));
    return intersection.length / Math.max(aWords.size, bWords.size);
  }
}
