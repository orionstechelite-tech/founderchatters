'use client';

import {
  ADMIN_NAV_GROUPS,
  AdminShell,
  type AdminNavGroup,
} from '@founderchatters/ui';
import {
  ADMIN_PERMISSIONS,
  type AdminPermission,
} from '@founderchatters/contracts';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { hasPermission, loadAdminSession } from './admin-api';

const NAV_PERMISSIONS: Record<string, AdminPermission | AdminPermission[]> = {
  Overview: ADMIN_PERMISSIONS.overviewRead,
  Applications: ADMIN_PERMISSIONS.applicationsRead,
  Members: ADMIN_PERMISSIONS.membersRead,
  Requests: ADMIN_PERMISSIONS.requestsRead,
  'Support & Appeals': ADMIN_PERMISSIONS.supportRead,
  Reports: ADMIN_PERMISSIONS.reportsRead,
  Reputation: ADMIN_PERMISSIONS.reputationRead,
  Notifications: ADMIN_PERMISSIONS.notificationsRead,
  Taxonomy: ADMIN_PERMISSIONS.taxonomyRead,
  Analytics: ADMIN_PERMISSIONS.analyticsRead,
  'Admins & Roles': [ADMIN_PERMISSIONS.adminsRead, ADMIN_PERMISSIONS.rolesRead],
  'Audit Log': ADMIN_PERMISSIONS.auditRead,
  'Platform Settings': ADMIN_PERMISSIONS.settingsRead,
  'System Health': ADMIN_PERMISSIONS.systemRead,
};

export function AdminAppShell({
  activeItem,
  children,
  required,
}: {
  activeItem: string;
  children: ReactNode;
  required?: AdminPermission;
}) {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [email, setEmail] = useState<string | undefined>();
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAdminSession()
      .then((session) => {
        if (cancelled) return;
        setPermissions(session.permissions);
        setEmail(session.user.email);
        if (required && !session.permissions.includes(required)) {
          setDenied(true);
        }
      })
      .catch(() => {
        if (!cancelled) setDenied(true);
      });
    return () => {
      cancelled = true;
    };
  }, [required]);

  const groups = useMemo((): AdminNavGroup[] => {
    if (!permissions) return [...ADMIN_NAV_GROUPS];
    return ADMIN_NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.filter((item) => {
        const need = NAV_PERMISSIONS[item.label];
        if (!need) return true;
        return Array.isArray(need)
          ? need.some((key) => hasPermission(permissions, key))
          : hasPermission(permissions, need);
      }),
    })).filter((group) => group.items.length > 0);
  }, [permissions]);

  const waiting = required && permissions === null && !denied;

  return (
    <AdminShell
      activeItem={activeItem}
      groups={groups}
      {...(email ? { signedInAs: email } : {})}
    >
      {denied ? (
        <section className="fc-admin-page">
          <h1>Permission denied</h1>
          <p>You do not have permission to view this admin area.</p>
        </section>
      ) : waiting ? (
        <p className="fc-admin-status" role="status">
          Loading…
        </p>
      ) : (
        children
      )}
    </AdminShell>
  );
}
