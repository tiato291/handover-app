'use strict';
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    'FATAL: missing Supabase env vars.',
    'SUPABASE_URL:', url ? 'set' : 'MISSING',
    'SUPABASE_SERVICE_ROLE_KEY:', key ? 'set' : 'MISSING'
  );
}

module.exports = createClient(url ?? '', key ?? '');
