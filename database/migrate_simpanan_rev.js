const pool = require('../config/database');

async function migrate() {
  try {
    console.log('Running migration for simpanan pokok & simpanan wajib revision...');
    
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS skema_simpanan_pokok VARCHAR(20) DEFAULT 'lunas',
      ADD COLUMN IF NOT EXISTS tenor_simpanan_pokok INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS nominal_cicilan_pokok NUMERIC(15,2) DEFAULT 0;
    `);

    console.log('✅ Columns skema_simpanan_pokok, tenor_simpanan_pokok, nominal_cicilan_pokok verified/created.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  }
}

migrate();
