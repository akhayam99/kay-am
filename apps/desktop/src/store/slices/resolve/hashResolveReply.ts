type Params = { readonly reply: string };

export const hashResolveReply = async ({ reply }: Params): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reply));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
};
