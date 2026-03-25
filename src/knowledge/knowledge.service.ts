import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError, NotFoundError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { Knowledge, KnowledgeKind, KnowledgeStatus, Evidence } from '../common/types/knowledge.types';
import { calibrated } from '../common/types/cognitive.types';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  private nextId = 1;

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async create(data: {
    kind: KnowledgeKind;
    content: string;
    domain: string;
    confidence: number;
    evidence: Evidence[];
    scope?: string;
  }): Promise<Result<Knowledge, DomainError>> {
    const knowledgeId = `K${String(this.nextId++).padStart(3, '0')}`;
    const now = new Date().toISOString();

    // Compute embedding for semantic search
    const embResult = await this.embeddings.embed(data.content);
    const embedding = embResult.isOk() ? embResult.value : undefined;

    const knowledge: Record<string, unknown> = {
      knowledge_id: knowledgeId,
      kind: data.kind,
      content: data.content,
      domain: data.domain,
      confidence: calibrated(data.confidence, data.kind === 'axiom' ? 0.01 : 0.15),
      evidence: data.evidence,
      validity: { scope: data.scope || 'universal' },
      status: 'active',
      embedding,
      last_reinforcement: now,
      created_at: now,
      updated_at: now,
    };

    const result = await this.db.create<Knowledge>('knowledge', knowledge as unknown as Knowledge);
    if (result.isOk()) {
      await this.events.emit('knowledge.updated' as any, { knowledge_id: knowledgeId, action: 'created', content: data.content });
    }
    return result;
  }

  async findById(knowledgeId: string): Promise<Result<Knowledge, DomainError>> {
    const result = await this.db.query<Knowledge>('SELECT * FROM knowledge WHERE knowledge_id = $id LIMIT 1', { id: knowledgeId });
    if (result.isErr()) return err(result.error);
    if (result.value.length === 0) return err(new NotFoundError('Knowledge', knowledgeId));
    return ok(result.value[0]);
  }

  async findAll(filters?: { kind?: KnowledgeKind; domain?: string; status?: KnowledgeStatus }): Promise<Result<Knowledge[], DomainError>> {
    const conditions: string[] = [];
    const vars: Record<string, unknown> = {};
    if (filters?.kind) { conditions.push('kind = $kind'); vars.kind = filters.kind; }
    if (filters?.domain) { conditions.push('domain = $domain'); vars.domain = filters.domain; }
    if (filters?.status) { conditions.push('status = $status'); vars.status = filters.status; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.query<Knowledge>(`SELECT * FROM knowledge ${where} ORDER BY knowledge_id LIMIT 200`, vars);
  }

  async reinforce(knowledgeId: string, newEvidence: Evidence): Promise<Result<Knowledge, DomainError>> {
    const existing = await this.findById(knowledgeId);
    if (existing.isErr()) return err(existing.error);

    const k = existing.value;
    const evidence = [...(k.evidence || []), newEvidence];
    const conf = k.confidence as any;
    const newConfidence = Math.min(1.0, (conf.point || conf) + 0.03 * (1 - (conf.point || conf)));

    return this.db.update<Knowledge>(k.id!, {
      evidence,
      confidence: calibrated(newConfidence, 0.12 / Math.sqrt(1 + evidence.length)),
      last_reinforcement: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
  }

  async supersede(oldKnowledgeId: string, newKnowledgeId: string): Promise<Result<void, DomainError>> {
    const old = await this.findById(oldKnowledgeId);
    if (old.isErr()) return err(old.error);

    await this.db.update(old.value.id!, {
      status: 'superseded',
      superseded_by: newKnowledgeId,
      updated_at: new Date().toISOString(),
    });
    return ok(undefined);
  }

  async findSimilar(content: string, threshold = 0.7): Promise<Result<Knowledge[], DomainError>> {
    const embResult = await this.embeddings.embed(content);
    if (embResult.isErr()) return ok([]); // graceful degradation

    // Brute force cosine similarity (TODO: use MTREE when SurrealDB supports it properly)
    const all = await this.findAll({ status: 'active' });
    if (all.isErr()) return err(all.error);

    const queryEmb = embResult.value;
    return ok(all.value.filter((k) => {
      if (!k.embedding) return false;
      const sim = this.cosine(queryEmb, k.embedding);
      return sim >= threshold;
    }));
  }

  async count(): Promise<Result<number, DomainError>> {
    const result = await this.db.query<{ count: number }>('SELECT count() AS count FROM knowledge GROUP ALL');
    if (result.isErr()) return err(result.error);
    return ok(result.value[0]?.count ?? 0);
  }

  private cosine(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d === 0 ? 0 : dot / d;
  }
}
