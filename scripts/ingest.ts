import { runIngest } from "../src/lib/ingest";

const once = process.argv.includes("--once");
const INTERVAL = 5 * 60_000; // matches INGEST_INTERVAL_MS

async function tick() {
  const t = Date.now();
  try {
    const r = await runIngest(once ? { maxNewBlocks: 100, maxBackfillPerRun: 30, budgetMs: 120_000 } : {});
    console.log(`[ingest] ${new Date().toISOString()} height=${r.height} newBlocks=${r.newBlocks} poolDays=${r.poolDaysWritten}${r.mocked ? " (MOCKED RPC)" : ""} ${Date.now() - t}ms`);
  } catch (e) {
    console.error(`[ingest] ${new Date().toISOString()} failed: ${e instanceof Error ? e.message : String(e)}`);
    if (once) process.exitCode = 1;
  }
}
void tick().then(() => { if (!once) setInterval(tick, INTERVAL); });
