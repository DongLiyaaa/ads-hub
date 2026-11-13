import os from 'node:os';
import path from 'node:path';

const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';

export function getCodexHome(tenantId) {
  const root = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return tenantId && tenantId !== DEFAULT_TENANT_ID ? path.join(root, 'tenants', tenantId) : root;
}
