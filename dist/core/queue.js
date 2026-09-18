/** A failed operation must not poison subsequent writes. */
export class SerialQueue {
    tail = Promise.resolve();
    enqueue(operation) {
        const result = this.tail.then(operation, operation);
        this.tail = result.catch(() => undefined);
        return result;
    }
}
