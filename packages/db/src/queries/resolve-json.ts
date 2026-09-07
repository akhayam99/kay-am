type Params = { readonly json: string };

export const resolveStringArray = ({ json }: Params): ReadonlyArray<string> => {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === 'string')) {
    throw new Error('Invalid resolve string array');
  }
  return value;
};
