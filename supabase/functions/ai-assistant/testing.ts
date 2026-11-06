// Мінімальні утиліти для тестів (без зовнішніх залежностей).

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val);
}

export function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  if (stable(actual) !== stable(expected)) {
    throw new Error(
      `${msg ? msg + "\n" : ""}Очікувалось: ${stable(expected)}\nОтримано:   ${stable(actual)}`,
    );
  }
}

export function assert(cond: unknown, msg = "assert failed"): asserts cond {
  if (!cond) throw new Error(msg);
}