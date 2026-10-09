export function validateEnvironment(env: Record<string, unknown>) {
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'KIOSK_API_KEY']) {
    if (typeof env[key] !== 'string' || !env[key])
      throw new Error(`${key} is required`);
  }
  for (const key of ['JWT_SECRET', 'KIOSK_API_KEY']) {
    if (String(env[key]).length < 32 || String(env[key]).includes('REPLACE_'))
      throw new Error(`${key} must be a random secret (32+ characters)`);
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT');
  const rate = String(env.POINTS_PER_SOL ?? '1');
  if (
    !/^\d{1,3}(\.\d{1,4})?$/.test(rate) ||
    Number(rate) <= 0 ||
    Number(rate) > 100
  )
    throw new Error('POINTS_PER_SOL must be > 0 and <= 100, max 4 decimals');
  const origins = String(
    env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:5180',
  )
    .split(',')
    .map((s) => s.trim());
  if (
    origins.some((origin) => {
      try {
        return (
          !['http:', 'https:', 'capacitor:'].includes(
            new URL(origin).protocol,
          ) || origin === '*'
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error('Invalid CORS_ORIGINS');
  return {
    ...env,
    PORT: port,
    POINTS_PER_SOL: rate,
    CORS_ORIGINS: origins.join(','),
  };
}
