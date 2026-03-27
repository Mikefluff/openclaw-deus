import { Injectable, Logger } from '@nestjs/common';
import { RawSensoryEvent, ModalityResult } from './modality.types';
import { ModalityDiscoveryService } from './modality-discovery.service';
import { AttentionService } from './attention.service';
import { TraceGraphService } from '../memory/trace-graph.service';
import { Signal } from '../kernel.types';

/**
 * RawStreamService: Entry point for ALL sensory input.
 *
 * Every input — operator message, terminal output, file content, DB result —
 * enters as an undifferentiated RawSensoryEvent.
 *
 * The stream:
 * 1. Fingerprints the event (statistical texture)
 * 2. Discovers or assigns modality (online clustering)
 * 3. Projects into concept space (learned projection)
 * 4. Creates modality-tagged trace
 * 5. Cross-modal binding with recent co-occurring traces
 */
@Injectable()
export class RawStreamService {
  private readonly logger = new Logger(RawStreamService.name);
  private recentModalityTraces: Array<{ modality_id: number; trace_id: string; cycle: number }> = [];

  constructor(
    private readonly modalityDiscovery: ModalityDiscoveryService,
    private readonly attention: AttentionService,
    private readonly traceGraph: TraceGraphService,
  ) {}

  /**
   * Process a raw event through the full sensory pipeline.
   * Returns signals for the kernel commit cycle.
   */
  async ingest(event: RawSensoryEvent, cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Discover modality + project into concept space
    const result = await this.modalityDiscovery.process(event, cycle);

    // ATTENTION GATING: how deeply to process this event
    const attentionDist = this.attention.attend(this.modalityDiscovery.getModalityCount());
    const attentionLevel = this.attention.getAttentionLevel(result.modality_id);

    // Involuntary capture: new modality or high novelty → snap attention
    if (result.is_new_modality || result.novelty > 0.7) {
      this.attention.capture(result.modality_id);
    }

    // Attention gates trace weight: high attention → strong trace, low → weak
    const traceWeight = 0.3 + attentionLevel * 0.5 + result.novelty * 0.2;

    // Create modality-tagged trace (depth gated by attention)
    const traceResult = await this.traceGraph.createTrace({
      source_type: 'signal',
      content: event.content.slice(0, attentionLevel > 0.2 ? 500 : 100), // shallow = less content stored
      initial_weight: Math.min(1, traceWeight),
      confidence: 0.4 + attentionLevel * 0.4, // high attention = higher confidence
      emotional_charge: 0,
    });

    if (traceResult.isOk()) {
      const traceId = traceResult.value.trace_id;

      // Tag trace with discovered modality
      // (position already set by createTrace → projectNewTrace,
      //  but we can refine with modality-specific projection)

      // Cross-modal binding: link to recent traces from OTHER modalities
      await this.crossModalBind(traceId, result.modality_id, cycle);

      // Track for future cross-modal binding
      this.recentModalityTraces.push({ modality_id: result.modality_id, trace_id: traceId, cycle });
      if (this.recentModalityTraces.length > 30) this.recentModalityTraces.shift();

      // Generate signals
      signals.push({
        agent_id: 'sensory_stream',
        agent_rank: 0,
        type: 'perception',
        content: `[modality:${result.modality_label || result.modality_id}] ${event.content.slice(0, 80)}`,
        payload: {
          modality_id: result.modality_id,
          modality_label: result.modality_label,
          is_new_modality: result.is_new_modality,
          novelty: result.novelty,
          fingerprint_entropy: result.fingerprint.char_entropy,
          fingerprint_symbol_density: result.fingerprint.symbol_density,
        },
        confidence: 0.7,
        novelty_cost: result.is_new_modality ? 0.8 : result.novelty * 0.5,
        used_slow_path: false,
        targets: [traceId],
        cycle,
      });

      if (result.is_new_modality) {
        signals.push({
          agent_id: 'sensory_stream',
          agent_rank: 0,
          type: 'perception',
          content: `NEW MODALITY DISCOVERED: #${result.modality_id} (total: ${this.modalityDiscovery.getModalityCount()})`,
          payload: { new_modality: true, modality_id: result.modality_id },
          confidence: 0.9,
          novelty_cost: 0.9,
          used_slow_path: false,
          targets: [traceId],
          cycle,
        });
      }
    }

    return signals;
  }

  /**
   * Cross-modal binding: create edges between traces from different modalities
   * that co-occur within a time window. This is how the brain binds
   * sight + sound + touch into unified objects.
   */
  private async crossModalBind(newTraceId: string, newModalityId: number, cycle: number): Promise<void> {
    const bindingWindow = 3; // cycles

    for (const recent of this.recentModalityTraces) {
      if (recent.modality_id === newModalityId) continue; // same modality → skip
      if (cycle - recent.cycle > bindingWindow) continue; // too old

      // Different modality + recent = cross-modal co-occurrence → BIND
      await this.traceGraph.link(newTraceId, recent.trace_id, 'activates', 0.3);
      await this.traceGraph.link(recent.trace_id, newTraceId, 'activates', 0.3);

      // LEARNING: update modality projection from cross-modal binding
      const [newPos, coPos] = await Promise.all([
        this.traceGraph.getTracePosition(newTraceId),
        this.traceGraph.getTracePosition(recent.trace_id),
      ]);
      if (newPos && coPos) {
        this.modalityDiscovery.updateProjection(newModalityId, newPos, coPos);
      }
    }
  }

  /**
   * Convert a simple string input to RawSensoryEvent.
   * For backward compatibility with think(string).
   */
  static stringToEvent(input: string, source = 'operator'): RawSensoryEvent {
    return {
      content: input,
      source,
      timestamp: Date.now(),
      byte_length: Buffer.byteLength(input, 'utf-8'),
    };
  }
}
