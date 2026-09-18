import { EventBus } from '../../../core/events.js';
import { AccountingRepository } from './repository.js';
import { RequestContext } from '../../../core/context.js';

export function registerSubscribers(eventBus: EventBus): void {
  eventBus.subscribe('work_order.completed', async (event) => {
    if (event.actualCostCents <= 0) return;

    RequestContext.run(
      {
        operatorId: event.operatorId,
        correlationId: `event-work-order-${event.workOrderId}`
      },
      () => {
        AccountingRepository.createTransaction({
          transaction_type: 'expense',
          category: 'repairs',
          amount_cents: event.actualCostCents,
          transaction_date: Date.now(),
          description: `Maintenance Repair Cost (Work Order #${event.workOrderId.slice(0, 8)})`,
          property_id: event.propertyId,
          unit_id: event.unitId || null,
          reference_number: `wo:${event.workOrderId}`
        });
      }
    );
  });
}

