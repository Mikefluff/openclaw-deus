export type DeusEvent =
  | 'belief.created'
  | 'belief.updated'
  | 'belief.decayed'
  | 'belief.promoted'
  | 'belief.archived'
  | 'contradiction.detected'
  | 'memory.logged'
  | 'memory.aggregated'
  | 'introspection.completed'
  | 'nightly.stage_completed'
  | 'nightly.completed'
  | 'policy.evaluated'
  | 'world_model.refreshed'
  | 'episode.created'
  | 'deliberation.decided'
  | 'self_assessment.updated'
  | 'metrics.snapshot_created'
  | 'diagnosis.completed'
  | 'experiment.started'
  | 'experiment.committed'
  | 'experiment.rolled_back'
  | 'improvement.proposed';

export interface BeliefEvent {
  id?: string;
  belief_id: string;
  event_type: 'created' | 'updated' | 'decayed' | 'promoted' | 'archived' | 'contradiction_flagged';
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface WebhookRegistration {
  id?: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: string;
}

export interface WebhookDelivery {
  id?: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  status: number;
  response_body?: string;
  delivered_at: string;
}
