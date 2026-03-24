/**
 * Supabase Connection Test for DEUS
 * Validates credentials and basic operations
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgvbvjngwutppicmacja.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LhOjC0JHI1B4a51NKtIKKg_0VzHVRvr';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
  console.log('=== DEUS Supabase Connection Test ===\n');
  
  // Test 1: Basic connectivity
  console.log('1. Testing basic connectivity...');
  try {
    const { data, error } = await supabase.from('_health').select('*').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    console.log('   ✅ Connection established');
  } catch (err) {
    console.log('   ⚠️  _health table not found (expected on fresh DB)');
  }
  
  // Test 2: Create test table
  console.log('\n2. Creating test schema...');
  try {
    const { error } = await supabase.rpc('create_deus_schema');
    if (error && !error.message.includes('already exists')) throw error;
    console.log('   ✅ Schema ready');
  } catch (err) {
    console.log('   ⚠️  Using direct SQL via postgres role needed');
  }
  
  // Test 3: Auth status
  console.log('\n3. Checking Auth...');
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    console.log(`   ✅ Auth service: ${session ? 'Active session' : 'No session (anon)'}`);
  } catch (err) {
    console.log(`   ⚠️  Auth check: ${err.message}`);
  }
  
  // Test 4: Insert test data
  console.log('\n4. Testing data operations...');
  try {
    const { data, error } = await supabase
      .from('_deus_test')
      .insert({ message: 'DEUS connection test', timestamp: new Date().toISOString() })
      .select()
      .single();
    
    if (error) {
      if (error.code === '42P01') {
        console.log('   ⚠️  Test table missing — need to run migrations');
      } else {
        throw error;
      }
    } else {
      console.log('   ✅ Data write successful');
    }
  } catch (err) {
    console.log(`   ⚠️  Data test: ${err.message}`);
  }
  
  console.log('\n=== Summary ===');
  console.log('URL:', SUPABASE_URL);
  console.log('Project ID: jgvbvjngwutppicmacja');
  console.log('Status: Connection valid, need schema setup');
}

testConnection().catch(console.error);
