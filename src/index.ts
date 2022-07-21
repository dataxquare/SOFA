import * as http from 'http';
import { createRouter } from './router';
import type { ContextValue } from './types';
import type { SofaConfig } from './sofa';
import { createSofa } from './sofa';
import { createServerAdapter, ServerAdapter } from '@whatwg-node/server';

export { OpenAPI } from './open-api';

export type ContextFn = (init: { req: any; res: any }) => ContextValue;

export function isContextFn(context: any): context is ContextFn {
  return typeof context === 'function';
}

interface SofaMiddlewareConfig extends SofaConfig {
  context?: ContextValue | ContextFn;
}

export function useSofa({
  context,
  ...config
}: SofaMiddlewareConfig): ServerAdapter<http.IncomingMessage, http.ServerResponse> {
  const sofaRouter = createSofaRouter(config);
  return createServerAdapter({
    handleRequest: sofaRouter.handle,
  })
}

export function createSofaRouter(config: SofaConfig) {
  const sofa = createSofa(config);
  const router = createRouter(sofa);
  return router;
}
