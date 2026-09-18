import { EventBus } from '../../../core/events.js';
import { PropertiesRepository } from './repository.js';
import { RequestContext } from '../../../core/context.js';

/**
 * Register domain event listeners for the Properties module.
 *
 * @param eventBus - Application event bus instance.
 */
export function registerSubscribers(eventBus: EventBus): void {
  eventBus.subscribe('lease.activated', async (event) => {
    const activeOperator = event.operatorId || event.tenantId || RequestContext.tryGet()?.operatorId || '';
    RequestContext.run({ operatorId: activeOperator, tenantId: activeOperator, correlationId: 'event-lease-activated' }, () => {
      PropertiesRepository.updateUnitStatus(event.unitId, 'occupied');
    });
  });

  eventBus.subscribe('lease.terminated', async (event) => {
    const activeOperator = event.operatorId || event.tenantId || RequestContext.tryGet()?.operatorId || '';
    RequestContext.run({ operatorId: activeOperator, tenantId: activeOperator, correlationId: 'event-lease-terminated' }, () => {
      PropertiesRepository.updateUnitStatus(event.unitId, 'turnover');
    });
  });
}


