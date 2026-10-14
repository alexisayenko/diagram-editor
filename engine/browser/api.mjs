// The page's only door to the local server: every call has a timeout and fails with one of three error shapes.
import { listDiagrams } from "../lib/diagrams.mjs";

export const FETCH_TIMEOUT_MS = 15000;

// Failures are Errors: no answer in time and no server at all carry a plain message; an HTTP error also has `status` and `saved` (files written before a partial failure).
export function createApi(fetchFn) {
  async function call(path, options) {
    let response;
    try { response = await fetchFn(path, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...options }); }
    catch (e) {
      if (e?.name === "TimeoutError") throw new Error(`The local server did not answer within ${FETCH_TIMEOUT_MS / 1000} s.`);
      throw new Error("The local server is not reachable. Run node engine/serve.mjs.");
    }
    let body = {};
    try { body = await response.json(); } catch (_) { /* an empty or non-JSON body keeps the status text */ }
    if (!response.ok) {
      const err = new Error(body.error || `Server error: HTTP ${response.status}${response.statusText ? " " + response.statusText : ""}`);
      err.status = response.status;
      err.saved = body.saved || [];
      throw err;
    }
    return body;
  }
  async function stored(name) {
    try { return (await call("/api/file?name=" + encodeURIComponent(name))).text; }
    catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }
  const putFiles = (files) => call("/api/files", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files }) });
  async function listStored() { return listDiagrams((await call("/api/files")).files); }
  async function latestStored() { return (await listStored())[0]?.name ?? null; }
  return { call, stored, putFiles, listStored, latestStored };
}
