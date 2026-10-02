export type FakeQueryResult = { data: unknown; error: unknown; count?: unknown };
/** A response can be a fixed value, or a function of the calls made so far —
 * needed to fake a real backend's per-filter behaviour (e.g. an exact count
 * that differs by which `.eq()` value was applied), where every call to
 * `.from(sameTable)` would otherwise resolve to the same canned object. */
export type FakeQueryResponder = FakeQueryResult | ((calls: { method: string; args: unknown[] }[]) => FakeQueryResult);

/**
 * Minimal fake of the supabase-js fluent query builder, shared across
 * `packages/shared/src/api/*.test.ts` (introduced in Lot 1 for `parks.test.ts`,
 * reused since — not itself a `*.test.ts` file, so vitest never picks it up
 * as a test suite). Every chain method records its call and returns `this`;
 * awaiting the object (it implements `then`) resolves to the configured
 * `{ data, error }`, exactly like the real PostgrestFilterBuilder. The result
 * is resolved lazily (only once awaited), so a function responder sees every
 * call already recorded by then.
 */
export class FakeQuery implements PromiseLike<FakeQueryResult> {
  calls: { method: string; args: unknown[] }[] = [];
  constructor(private responder: FakeQueryResponder) {}
  private get result(): FakeQueryResult {
    return typeof this.responder === "function" ? this.responder(this.calls) : this.responder;
  }
  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args });
    return this;
  }
  select(...args: unknown[]) {
    return this.record("select", args);
  }
  eq(...args: unknown[]) {
    return this.record("eq", args);
  }
  in(...args: unknown[]) {
    return this.record("in", args);
  }
  or(...args: unknown[]) {
    return this.record("or", args);
  }
  ilike(...args: unknown[]) {
    return this.record("ilike", args);
  }
  range(...args: unknown[]) {
    return this.record("range", args);
  }
  order(...args: unknown[]) {
    return this.record("order", args);
  }
  insert(...args: unknown[]) {
    return this.record("insert", args);
  }
  update(...args: unknown[]) {
    return this.record("update", args);
  }
  upsert(...args: unknown[]) {
    return this.record("upsert", args);
  }
  delete(...args: unknown[]) {
    return this.record("delete", args);
  }
  single() {
    return this.record("single", []);
  }
  maybeSingle() {
    return this.record("maybeSingle", []);
  }
  then<TResult1, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown; count?: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

/** Table (or `rpc:<fn>`) -> canned `{ data, error, count? }` response, plus
 * every `FakeQuery` created (keyed by table) and every `.rpc()` call recorded,
 * so a test can inspect exactly what was sent.
 *
 * `.rpc(fn, params)` resolves to `responses["rpc:" + fn]` when given, otherwise
 * `{ data: null, error: null }` (a call that just succeeds). It returns a
 * `FakeQuery`, so both `await supabase.rpc(...)` and a `.select()` chain work. */
export function makeFakeSupabase(responses: Record<string, FakeQueryResponder>) {
  const queriesByTable: Record<string, FakeQuery[]> = {};
  const rpcCalls: { fn: string; params: unknown }[] = [];
  const client = {
    from(table: string) {
      const q = new FakeQuery(responses[table] ?? { data: null, error: null });
      (queriesByTable[table] ??= []).push(q);
      return q;
    },
    rpc(fn: string, params?: unknown) {
      rpcCalls.push({ fn, params });
      return new FakeQuery(responses[`rpc:${fn}`] ?? { data: null, error: null });
    },
  };
  return { client, queriesByTable, rpcCalls };
}
