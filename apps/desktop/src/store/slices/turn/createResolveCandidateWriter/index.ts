type Params = {
  readonly persist: () => Promise<void>;
};

type DeltaParams = { readonly delta: string };

export const createResolveCandidateWriter = ({ persist }: Params) => {
  let isDirty = false;
  let pending: Promise<void> | null = null;
  let failure: unknown = null;
  let tail = '';
  const drain = async (): Promise<void> => {
    try {
      while (isDirty) {
        isDirty = false;
        await persist();
      }
    } catch (error: unknown) {
      failure = error;
    } finally {
      pending = null;
    }
  };
  return {
    append: ({ delta }: DeltaParams): void => {
      const combined = tail + delta;
      tail = combined.slice(-1);
      if (!combined.includes('>>')) {
        return;
      }
      isDirty = true;
      if (pending !== null) {
        return;
      }
      pending = Promise.resolve().then(drain);
    },
    flush: async (): Promise<void> => {
      await pending;
      if (failure !== null) {
        throw failure;
      }
    },
  };
};
