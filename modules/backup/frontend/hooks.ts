/**
 * Backup Module Hook Registrations
 */

import { HookRegistry } from '../../../web/lib/hooks.js';

HookRegistry.registerNavigation({
  label: 'Backups',
  route: '/backup',
  icon: 'archive',
  order: 90,
  section: 'system'
});

HookRegistry.registerDashboardCard('/api/v1/backups?limit=1', (res: any) => {
  try {
    if (!res || (res.success !== true && res.ok !== true)) {
      return null;
    }
    const items = res.data?.items ?? [];
    const latest = items.length > 0 ? items[0] : null;

    if (latest) {
      const createdAgo = Math.round(((Date.now() - latest.created_at) / 3600000) * 10) / 10;
      const sizeMb = Math.round((latest.file_size_bytes / (1024 * 1024)) * 100) / 100;
      const status = latest.status;
      const statusCap = typeof status === 'string' && status.length > 0
        ? status.charAt(0).toUpperCase() + status.slice(1)
        : 'Unknown';

      return {
        id: 'backup_status',
        title: 'System Backup',
        value: statusCap,
        subtitle: `Last: ${createdAgo} hrs ago (${sizeMb} MB)`,
        order: 90
      };
    }

    return {
      id: 'backup_status',
      title: 'System Backup',
      value: 'None',
      subtitle: 'No backups on record',
      order: 90
    };
  } catch {
    return null;
  }
});
