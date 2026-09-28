import type { Express } from 'express';

import type { AppConfig } from '../config.js';

export function configureTrustProxy(
  application: Express,
  config: AppConfig,
): void {
  application.set(
    'trust proxy',
    config.trustedProxyAddresses === false
      ? false
      : [...config.trustedProxyAddresses],
  );
}
