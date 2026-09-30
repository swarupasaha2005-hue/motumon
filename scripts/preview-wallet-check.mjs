// Run manually on the operator's Mac. No deployment, proving or submission.
import { PreviewService, friendlyError } from '../apps/web/server/preview-service.mjs';

const service = new PreviewService();
const started = Date.now();
let stage = 'Operator initialization';
let exitCode = 0;
try {
  console.log(JSON.stringify({ network: 'Preview', stage }));
  console.log(JSON.stringify(await service.connect()));
  stage = 'Read-only bounded synchronization';
  console.log(JSON.stringify(await service.waitForOperatorSynchronization(value=>console.log(JSON.stringify({stage,...value})))));
  console.log('Strict synchronization completed. Positive spendable DUST alone does not guarantee sufficient transaction fees.');
} catch (error) {
  exitCode = 1;
  console.error(JSON.stringify({ stage, error: friendlyError(error), diagnostics:error?.diagnostics??null, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));
} finally {
  try { await service.disconnect(); }
  catch (error) { exitCode = 1; console.error(JSON.stringify({ stage: 'Cleanup', error: friendlyError(error) })); }
  // End this diagnostic process even if the SDK still has failed background workers.
  process.exit(exitCode);
}
