/** A failed operation must not poison subsequent writes. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
