type Params = {
  readonly value: unknown;
};

export const isImagePath = ({ value }: Params): boolean => {
  return (
    typeof value === 'string' &&
    value.length <= 1024 &&
    !/\s/.test(value) &&
    !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value) &&
    /\.(?:png|jpe?g|gif|webp)$/i.test(value)
  );
};
