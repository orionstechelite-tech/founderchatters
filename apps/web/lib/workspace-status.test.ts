import { describe, expect, it } from 'vitest';

import { getWorkspaceStatus } from './workspace-status';

describe('getWorkspaceStatus', () => {
  it('reports that the bootstrap workspace is ready', () => {
    expect(getWorkspaceStatus()).toBe('Workspace ready');
  });
});
