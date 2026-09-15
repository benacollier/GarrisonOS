# In-Process EventBus Reference

Cross-module communication in GarrisonOS is decoupled through the native, in-process asynchronous EventBus (`core/events.ts`).

---

## 1. Publishing & Subscribing

```typescript
import { eventBus } from '../core/events.js';

// Publishing an event
eventBus.publish('payment.recorded', {
  tenantId: '018d9f4e-28b3-7a91-91bc-0a75bc89a712',
  transactionId: '018d9f4e-28b3-7a91-91bc-0a75bc89a713',
  leaseId: '018d9f4e-28b3-7a91-91bc-0a75bc89a714',
  amountCents: 150000,
  recordedAt: Date.now()
});

// Subscribing to an event
eventBus.subscribe('work_order.completed', async (payload) => {
  // Execute decoupled side effect
});
```

---

## 2. Event Catalog & Payload Schemas

### `lease.activated`
Fired when a lease agreement transitions to `active`.
```typescript
interface LeaseActivatedEvent {
  tenantId: string;
  leaseId: string;
  unitId: string;
  rentAmountCents: number;
  startDate: number;
}
```

### `lease.terminated`
Fired when a lease agreement reaches `terminated` status.
```typescript
interface LeaseTerminatedEvent {
  tenantId: string;
  leaseId: string;
  unitId: string;
  terminatedAt: number;
}
```

### `payment.recorded`
Fired when a tenant payment is posted to the ledger.
```typescript
interface PaymentRecordedEvent {
  tenantId: string;
  transactionId: string;
  leaseId: string;
  amountCents: number;
  paymentMethod: string;
}
```

### `work_order.completed`
Fired when a work order transitions to `completed`.
```typescript
interface WorkOrderCompletedEvent {
  tenantId: string;
  workOrderId: string;
  propertyId: string;
  unitId?: string;
  actualCostCents: number;
  vendorContactId?: string;
}
```
