/**
 * Back-compat shim (issue #60).
 *
 * The validated snapshot now lives in `src/config/loader.ts`; every existing
 * `import { config } from '../config/env'` keeps working unchanged.
 */
import { getConfig } from './loader';

export const config = getConfig();
