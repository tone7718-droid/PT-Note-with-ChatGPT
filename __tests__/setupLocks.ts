const tails = new Map<string, Promise<unknown>>();
Object.defineProperty(navigator, "locks", { configurable: true, value: {
  request<T>(name: string, _options: unknown, action: () => Promise<T>): Promise<T> {
    const task = (tails.get(name) ?? Promise.resolve()).catch(() => {}).then(action);
    tails.set(name, task.catch(() => {})); return task;
  },
} });
