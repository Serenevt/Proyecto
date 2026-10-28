export function validateEnvironment(env: Record<string, unknown>) {
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'KIOSK_API_KEY']) {
    if (typeof env[key] !== 'string' || !env[key])
      throw new Error(`${key} is required`);
  }
  if (
    !['local', 'academic', 'production'].includes(
      String(env.APP_MODE ?? 'local'),
    )
  )
    throw new Error('Invalid APP_MODE');
  if (
    env.VERCEL === '1' &&
    !['academic', 'production'].includes(String(env.APP_MODE))
  )
    throw new Error('Vercel requires an explicit public profile');
  if (
    env.DEMO_WALLET_ENABLED === 'true' &&
    (!['local', 'academic'].includes(String(env.APP_MODE)) ||
      env.PAYMENT_ENV !== 'demo')
  )
    throw new Error(
      'Demo wallet requires a demonstration profile and PAYMENT_ENV=demo',
    );
  if (env.APP_MODE === 'academic') {
    if (env.PAYMENT_ENV !== 'demo' || env.DEMO_WALLET_ENABLED !== 'true')
      throw new Error('Academic profile requires simulated payments');
    for (const key of ['KIOSK_GATEWAY_SECRET', 'KIOSK_REDIS_REST_TOKEN'])
      if (
        typeof env[key] !== 'string' ||
        String(env[key]).length < 32 ||
        String(env[key]).includes('REPLACE_')
      )
        throw new Error(key + ' must be a private random secret');
    if (
      !/^[a-zA-Z0-9_-]{3,64}$/.test(String(env.KIOSK_SESSION_NAMESPACE ?? ''))
    )
      throw new Error('Invalid KIOSK_SESSION_NAMESPACE');
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        String(env.KIOSK_STATION_ID ?? ''),
      )
    )
      throw new Error('Invalid KIOSK_STATION_ID');
    if (
      !env.KIOSK_OPERATOR_USER ||
      !/^\$2[aby]\$(1[2-5])\$[./A-Za-z0-9]{53}$/.test(
        String(env.KIOSK_OPERATOR_PASSWORD_HASH ?? ''),
      )
    )
      throw new Error(
        'Operator requires a username and bcrypt hash (cost 12-15)',
      );
    let redis: URL;
    try {
      redis = new URL(String(env.KIOSK_REDIS_REST_URL));
    } catch {
      throw new Error('Invalid Redis REST URL');
    }
    if (
      redis.protocol !== 'https:' ||
      redis.username ||
      redis.password ||
      redis.search ||
      redis.hash ||
      redis.pathname !== '/'
    )
      throw new Error('Redis requires a private HTTPS REST origin');
    if (env.CULQI_SECRET_KEY)
      throw new Error(
        'Academic profile cannot configure commercial payment credentials',
      );
    if (env.DATABASE_PURPOSE !== 'academic-demo')
      throw new Error(
        'Academic profile requires an isolated demonstration database',
      );
    if (env.SHOW_DEMO_ADMIN_CREDENTIALS === 'true')
      throw new Error('Public demo credentials are forbidden');
    if (!env.CORS_ORIGINS)
      throw new Error('Explicit academic HTTPS origins required');
    if (
      !['disabled', 'smtp'].includes(
        String(env.PASSWORD_RESET_DELIVERY ?? 'disabled'),
      )
    )
      throw new Error('Academic recovery must be disabled or real SMTP');
    for (const key of ['JWT_SECRET', 'KIOSK_API_KEY'])
      if (String(env[key]).includes('LOCAL_DEMO'))
        throw new Error('Public profile cannot use local demo secrets');
  }
  let database: URL;
  try {
    database = new URL(String(env.DATABASE_URL));
  } catch {
    throw new Error('Invalid DATABASE_URL (value withheld)');
  }
  if (
    env.APP_MODE === 'academic' &&
    database.searchParams.get('sslmode') !== 'require'
  )
    throw new Error('Academic database requires TLS');
  if (!['postgres:', 'postgresql:'].includes(database.protocol))
    throw new Error('DATABASE_URL must be PostgreSQL');
  if (String(env.APP_MODE ?? 'local') === 'local' && !['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(database.hostname))
    throw new Error('Local profile cannot connect to a remote database');
  if (env.KIOSK_REDIS_URL) {
    let redis: URL;
    try { redis = new URL(String(env.KIOSK_REDIS_URL)); }
    catch { throw new Error('Invalid KIOSK_REDIS_URL'); }
    if (env.APP_MODE !== 'local' || redis.protocol !== 'redis:' || !['redis', 'localhost', '127.0.0.1'].includes(redis.hostname) || redis.pathname !== '/0' || redis.search || redis.hash || !redis.password || redis.password.length < 32)
      throw new Error('KIOSK_REDIS_URL must be an authenticated local Redis URL');
  }
  for (const key of ['JWT_SECRET', 'KIOSK_API_KEY']) {
    if (String(env[key]).length < 32 || String(env[key]).includes('REPLACE_'))
      throw new Error(`${key} must be a random secret (32+ characters)`);
  }
  if (
    !['disabled', 'smtp', 'mailpit'].includes(
      String(env.PASSWORD_RESET_DELIVERY ?? 'disabled'),
    )
  )
    throw new Error('Invalid PASSWORD_RESET_DELIVERY');
  if (
    env.APP_MODE === 'production' &&
    (env.SHOW_DEMO_ADMIN_CREDENTIALS === 'true' ||
      ['demo', 'mailpit'].includes(String(env.PASSWORD_RESET_DELIVERY)))
  )
    throw new Error('Production cannot enable local demo services');
  if (
    env.SHOW_DEMO_ADMIN_CREDENTIALS === 'true' &&
    (env.APP_MODE !== 'local' ||
      !env.DEMO_ADMIN_USER ||
      !env.DEMO_ADMIN_PASSWORD)
  )
    throw new Error(
      'Demo admin requires explicit local mode and separate credentials',
    );
  for (const [key, fallback, max] of [
    ['PASSWORD_RESET_TTL_MINUTES', 10, 60],
    ['PASSWORD_RESET_MAX_ATTEMPTS', 5, 10],
  ] as const) {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new Error(`Invalid ${key}`);
  }
  if (env.PASSWORD_RESET_DELIVERY === 'smtp') {
    if (!env.SMTP_HOST || !env.SMTP_FROM)
      throw new Error('SMTP_HOST and SMTP_FROM are required');
    const smtpPort = Number(env.SMTP_PORT ?? 587);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)
      throw new Error('Invalid SMTP_PORT');
    if (!['true', 'false'].includes(String(env.SMTP_SECURE ?? 'false')))
      throw new Error('Invalid SMTP_SECURE');
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
      throw new Error('SMTP authentication requires both user and password');
  }
  if (env.APP_MODE === 'production') {
    if (env.PASSWORD_RESET_DELIVERY !== 'smtp')
      throw new Error('Production requires real SMTP');
    for (const key of ['JWT_SECRET', 'KIOSK_API_KEY'])
      if (String(env[key]).includes('LOCAL_DEMO'))
        throw new Error('Production cannot use demo secrets');
    if (
      env.PAYMENT_ENV !== 'production' ||
      !String(env.CULQI_SECRET_KEY ?? '').startsWith('sk_live_')
    )
      throw new Error('Production requires Culqi live configuration');
    if (String(env.PAYMENT_WEBHOOK_SECRET ?? '').length < 32)
      throw new Error('Production requires a webhook secret of 32+ characters');
    if (['mailpit', 'localhost', '127.0.0.1'].includes(String(env.SMTP_HOST)))
      throw new Error('Production SMTP cannot use local Mailpit');
    if (!env.CORS_ORIGINS)
      throw new Error('Explicit production origins required');
    if (!String(env.PLATE_RECOGNITION_URL ?? '').startsWith('https://'))
      throw new Error('Production OCR requires HTTPS');
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
          ) ||
          origin === '*' ||
          new URL(origin).origin !== origin ||
          (env.APP_MODE === 'academic' && new URL(origin).protocol !== 'https:')
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
  if (
    env.APP_MODE === 'academic' &&
    env.PLATE_RECOGNITION_ENABLED !== 'false' &&
    !ocr.startsWith('https://')
  )
    throw new Error('Public OCR requires HTTPS or explicit disablement');
  if (!['http:', 'https:'].includes(new URL(ocr).protocol))
    throw new Error('Invalid PLATE_RECOGNITION_URL');
  return {
    ...env,
    APP_MODE: String(env.APP_MODE ?? 'local'),
    ...(env.KIOSK_STATION_ID
      ? { KIOSK_STATION_ID: String(env.KIOSK_STATION_ID).toLowerCase() }
      : {}),
    PORT: port,
    SOLES_PER_POINT: rate,
    CORS_ORIGINS: origins.join(','),
  };
}
