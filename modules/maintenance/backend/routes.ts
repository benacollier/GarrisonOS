import { Router } from '../../../api/router.js';
import { successResponse, errorResponse } from '../../../api/response.js';
import { MaintenanceRepository } from './repository.js';
import { eventBus } from '../../../core/events.js';
import { RequestContext } from '../../../core/context.js';

/**
 * Register REST API routes for the Maintenance module.
 *
 * @param router - Application HTTP router.
 */
export function registerRoutes(router: Router): void {
  router.getBatchSafe('/api/v1/maintenance/metrics', (_req, res) => {
    const metrics = MaintenanceRepository.getMaintenanceMetrics();
    successResponse(res, { metrics });
  });

  router.getBatchSafe('/api/v1/maintenance/work-orders', (req, res) => {
    const workOrders = MaintenanceRepository.listWorkOrders({
      status: req.query['status'],
      priority: req.query['priority'],
      property_id: req.query['property_id'],
      unit_id: req.query['unit_id']
    });
    successResponse(res, { workOrders });
  });

  router.post('/api/v1/maintenance/work-orders', (req, res) => {
    const { property_id, title, description } = req.body || {};
    if (!property_id || !title || !description) {
      return errorResponse(res, 'VALIDATION_ERROR', 'property_id, title, and description are required', 400);
    }
    try {
      const workOrder = MaintenanceRepository.createWorkOrder(req.body);
      successResponse(res, { workOrder }, 201);
    } catch (err) {
      return errorResponse(res, 'VALIDATION_ERROR', (err as Error).message, 400);
    }
  });

  router.get('/api/v1/maintenance/work-orders/:id', (req, res) => {
    const workOrder = MaintenanceRepository.getWorkOrderById(req.params['id']!);
    if (!workOrder) {
      return errorResponse(res, 'NOT_FOUND', 'Work order not found', 404);
    }
    successResponse(res, { workOrder });
  });

  router.put('/api/v1/maintenance/work-orders/:id', (req, res) => {
    try {
      const workOrder = MaintenanceRepository.updateWorkOrder(req.params['id']!, req.body || {});
      if (!workOrder) {
        return errorResponse(res, 'NOT_FOUND', 'Work order not found', 404);
      }
      successResponse(res, { workOrder });
    } catch (err) {
      return errorResponse(res, 'VALIDATION_ERROR', (err as Error).message, 400);
    }
  });

  router.post('/api/v1/maintenance/work-orders/:id/complete', (req, res) => {
    const { actual_cost_cents } = req.body || {};
    let cost: number | undefined = undefined;
    if (actual_cost_cents !== undefined) {
      const parsed = Number(actual_cost_cents);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return errorResponse(res, 'VALIDATION_ERROR', 'actual_cost_cents must be a non-negative integer in cents', 400);
      }
      cost = parsed;
    }

    const workOrder = MaintenanceRepository.completeWorkOrder(req.params['id']!, cost);
    if (!workOrder) {
      return errorResponse(res, 'NOT_FOUND', 'Work order not found', 404);
    }

    // Publish work_order.completed event
    eventBus.publish('work_order.completed', {
      workOrderId: workOrder.id,
      propertyId: workOrder.property_id,
      unitId: workOrder.unit_id || undefined,
      actualCostCents: workOrder.actual_cost_cents,
      operatorId: RequestContext.getOperatorId()
    });

    successResponse(res, { workOrder });
  });

  router.delete('/api/v1/maintenance/work-orders/:id', (req, res) => {
    const deleted = MaintenanceRepository.deleteWorkOrder(req.params['id']!);
    if (!deleted) {
      return errorResponse(res, 'NOT_FOUND', 'Work order not found', 404);
    }
    successResponse(res, { deleted: true });
  });
}

