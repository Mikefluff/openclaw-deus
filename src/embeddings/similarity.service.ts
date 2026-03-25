import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EmbeddingsService } from './embeddings.service';

export interface SimilarityMatch {
  id: string;
  belief_id: string;
  score: number;
}

@Injectable()
export class SimilarityService {
  private readonly logger = new Logger(SimilarityService.name);

  constructor(
    private readonly embeddings: EmbeddingsService,
    private readonly db: SurrealService,
  ) {}

  /** Cosine similarity between two vectors */
  cosine(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Find K nearest beliefs by embedding similarity */
  async findSimilarBeliefs(content: string, k = 10, threshold = 0.5): Promise<Result<SimilarityMatch[], DomainError>> {
    const queryEmb = await this.embeddings.embed(content);
    if (queryEmb.isErr()) return err(queryEmb.error);

    // Use SurrealDB MTREE vector search if available, else fallback to brute force
    const allEmbeddings = await this.db.query<{ belief_id: string; embedding: number[] }>(
      'SELECT belief_id, embedding FROM belief_embedding',
    );
    if (allEmbeddings.isErr()) return err(allEmbeddings.error);

    const matches = allEmbeddings.value
      .map(item => ({
        id: item.belief_id,
        belief_id: item.belief_id,
        score: this.cosine(queryEmb.value, item.embedding || []),
      }))
      .filter(m => m.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return ok(matches);
  }

  /** Find similar memories by embedding */
  async findSimilarMemories(content: string, k = 10, threshold = 0.4): Promise<Result<SimilarityMatch[], DomainError>> {
    const queryEmb = await this.embeddings.embed(content);
    if (queryEmb.isErr()) return err(queryEmb.error);

    const allLogs = await this.db.query<{ id: string; embedding: number[] }>(
      'SELECT id, embedding FROM activity_log WHERE embedding != NONE LIMIT 500',
    );
    if (allLogs.isErr()) return err(allLogs.error);

    const matches = allLogs.value
      .filter(item => item.embedding)
      .map(item => ({
        id: String(item.id),
        belief_id: String(item.id),
        score: this.cosine(queryEmb.value, item.embedding),
      }))
      .filter(m => m.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return ok(matches);
  }

  /** Agglomerative clustering of vectors by cosine similarity */
  cluster(items: Array<{ id: string; embedding: number[] }>, threshold = 0.6): Array<{ centroid: number[]; members: string[] }> {
    if (items.length === 0) return [];

    // Simple single-linkage agglomerative clustering
    const clusters: Array<{ members: string[]; embeddings: number[][] }> = items.map(item => ({
      members: [item.id],
      embeddings: [item.embedding],
    }));

    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const maxSim = this.maxPairwiseSimilarity(clusters[i].embeddings, clusters[j].embeddings);
          if (maxSim >= threshold) {
            // Merge j into i
            clusters[i].members.push(...clusters[j].members);
            clusters[i].embeddings.push(...clusters[j].embeddings);
            clusters.splice(j, 1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    return clusters.map(c => ({
      centroid: this.computeCentroid(c.embeddings),
      members: c.members,
    }));
  }

  private maxPairwiseSimilarity(a: number[][], b: number[][]): number {
    let max = -1;
    for (const va of a) {
      for (const vb of b) {
        const sim = this.cosine(va, vb);
        if (sim > max) max = sim;
      }
    }
    return max;
  }

  private computeCentroid(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    const dim = vectors[0].length;
    const centroid = new Array(dim).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < dim; i++) centroid[i] += v[i];
    }
    const n = vectors.length;
    return centroid.map(v => v / n);
  }
}
