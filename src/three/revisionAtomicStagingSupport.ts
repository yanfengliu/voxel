export function combineRevisionAtomicErrorsInternal(
  primary: unknown,
  cleanup: readonly unknown[],
  message: string,
): Error {
  if (cleanup.length === 0) return primary instanceof Error ? primary : new Error(String(primary));
  return new AggregateError([primary, ...cleanup], message);
}
