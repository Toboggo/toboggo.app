/**
 * Minimal fake of the supabase-js fluent query builder, shared across
 * `packages/shared/src/api/*.test.ts` (introduced in Lot 1 for `parks.test.ts`,
 * reused since — not itself a `*.test.ts` file, so vitest never picks it up
 * as a test suite). Every chain method records its call and returns `this`;
 * awaiting the object (it implements `then`) resolves to the configured
 * `{ data, error }`, exactly like the real PostgrestFilterBuilder.
 */
export class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: unknown }> {
  calls: { method: string; args: unknown[] }[] = [];
  constructor(private result: { data: unknown; error: unknown; count?: unknown }) {}
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

/** Table -> canned `{ data, error, count? }` response, plus every `FakeQuery`
 * created (keyed by table) so a test can inspect exactly what was sent. */
export function makeFakeSupabase(responses: Record<string, { data: unknown; error: unknown; count?: unknown }>) {
  const queriesByTable: Record<string, FakeQuery[]> = {};
  const client = {
    from(table: string) {
      const q = new FakeQuery(responses[table] ?? { data: null, error: null });
      (queriesByTable[table] ??= []).push(q);
      return q;
    },
  };
  return { client, queriesByTable };
}
