import { describe, expect, it } from 'vitest';

import { AppController } from '../src/app.controller.js';

describe('AppController', () => {
  it('returns the bootstrap status', () => {
    expect(new AppController().getBootstrapStatus()).toEqual({
      service: 'api',
      status: 'ok',
    });
  });
});
