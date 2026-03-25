import { Injectable, Logger } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { WebhooksService } from './webhooks.service';

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
  | 'world_model.refreshed';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly gateway: EventsGateway,
    private readonly webhooks: WebhooksService,
  ) {}

  async emit(event: DeusEvent, data: unknown): Promise<void> {
    const payload = { event, data, timestamp: new Date().toISOString() };

    // WebSocket
    this.gateway.emit(event, payload);

    // Webhooks (fire-and-forget)
    this.webhooks.deliver(event, payload as Record<string, unknown>).catch((e) => {
      this.logger.warn(`Webhook delivery failed for ${event}: ${e}`);
    });
  }
}
