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
  const rate = String(env.SOLES_PER_POINT ?? '9');
  if (
    !/^\d{1,3}(\.\d{1,4})?$/.test(rate) ||
    Number(rate) <= 0 ||
    Number(rate) > 100
  )
    throw new Error('SOLES_PER_POINT must be > 0 and <= 100, max 4 decimals');
  const origins = String(
    env.CORS_ORIGINS ?? 'http://localhost:10081,http://localhost:5180',
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
  const debt = String(env.PRIME_DEBT_LIMIT ?? '200');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(debt))
    throw new Error('Invalid PRIME_DEBT_LIMIT');
  const threshold = Number(env.PLATE_CONFIDENCE_THRESHOLD ?? '0.75');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error('Invalid PLATE_CONFIDENCE_THRESHOLD');
  const ocr = String(
    env.PLATE_RECOGNITION_URL ?? 'http://plate-recognition:8000',
  );
  if (!['http:', 'https:'].includes(new URL(ocr).protocol))
    throw new Error('Invalid PLATE_RECOGNITION_URL');
  return {
    ...env,
    PORT: port,
    SOLES_PER_POINT: rate,
    CORS_ORIGINS: origins.join(','),
  };
}
