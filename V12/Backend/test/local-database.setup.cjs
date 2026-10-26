// Runs before every E2E module, including direct Jest invocation.
require('../scripts/database-safety.cjs').assertLocalDatabase();

// E2E suites select isolated schemas using DATABASE_URL; use that URL for CLI too.
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
