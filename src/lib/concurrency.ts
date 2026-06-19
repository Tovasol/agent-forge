// src/lib/concurrency.ts
// Minimal promise concurrency limiter (p-limit-style) with zero dependencies.

export default function limit(concurrency: number) {
  const queue: Array<() => void> = [];
  let active = 0;

  const next = () => {
    if (active >= concurrency) return;
    const fn = queue.shift();
    if (fn) {
      active++;
      fn();
    }
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const exec = () => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      queue.push(exec);
      next();
    });
  };
}
