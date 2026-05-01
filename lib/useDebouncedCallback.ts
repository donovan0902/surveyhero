import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  const fnRef = useRef(fn);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return useCallback(
    (...args: TArgs) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );
}
