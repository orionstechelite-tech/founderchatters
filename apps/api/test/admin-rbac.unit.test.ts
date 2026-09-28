import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin RBAC fixture helpers', () => {
  it('is not invoked from production API modules', () => {
    const adminDir = resolve(process.cwd(), 'src/admin');
    const root = resolve(process.cwd(), 'src');
    const rbac = readFileSync(resolve(adminDir, 'admin-rbac.ts'), 'utf8');
    const moduleSource = readFileSync(
      resolve(adminDir, 'application-review.module.ts'),
      'utf8',
    );
    const appModule = readFileSync(resolve(root, 'app.module.ts'), 'utf8');
    const controller = readFileSync(
      resolve(adminDir, 'application-review.controller.ts'),
      'utf8',
    );
    const service = readFileSync(
      resolve(adminDir, 'application-review.service.ts'),
      'utf8',
    );
    expect(rbac).toContain("NODE_ENV === 'production'");
    expect(rbac).toContain('must not run in production');
    expect(moduleSource).not.toContain('ensureAdminRbac');
    expect(appModule).not.toContain('ensureAdminRbac');
    expect(controller).not.toContain('ensureAdminRbac');
    expect(service).not.toContain('ensureAdminRbac');
  });
});
