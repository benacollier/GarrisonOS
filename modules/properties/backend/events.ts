import { EventBus } from '../../../core/events.js';
import { PropertiesRepository } from './repository.js';
import { RequestContext } from '../../../core/context.js';

export function registerSubscribers(eventBus: EventBus): void {
  eventBus.subscribe('lease.activated', async (event) => {
    RequestContext.run({ tenantId: event.tenantId, correlationId: 'event-lease-activated' }, () => {
      PropertiesRepository.updateUnitStatus(event.unitId, 'occupied');
    });
  });

  eventBus.subscribe('lease.terminated', async (event) => {
    RequestContext.run({ tenantId: event.tenantId, correlationId: 'event-lease-terminated' }, () => {
      PropertiesRepository.updateUnitStatus(event.unitId, 'turnover');
    });
  });
}
