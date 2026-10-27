import { runIngest } from "../src/lib/ingest";

const once = process.argv.includes("--once");
const INTERVAL = 60_000;

async function tick() {
  const t = Date.now();
  try {
    const r = await runIngest();
    console.log(`[ingest] ${new Date().toISOString()} height=${r.height} newBlocks=${r.newBlocks} poolDays=${r.poolDaysWritten}${r.mocked ? " (MOCKED RPC)" : ""} ${Date.now() - t}ms`);
  } catch (e) {
    console.error(`[ingest] ${new Date().toISOString()} failed: ${e instanceof Error ? e.message : String(e)}`);
    if (once) process.exitCode = 1;
  }
}
void tick().then(() => { if (!once) setInterval(tick, INTERVAL); });
