export const formatUsd = (usd: number): string => {
  if (usd === 0) {
    return '$0';
  }
  if (usd < 0.01) {
    return '<$0.01';
  }
  return `$${usd.toFixed(2)}`;
};

export const formatUsdPrecise = (usd: number): string => {
  return `$${usd.toFixed(4)}`;
};

export const formatTokens = (n: number): string => {
  if (n < 1000) {
    return String(n);
  }
  if (n < 1_000_000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return `${(n / 1_000_000).toFixed(2)}M`;
};
