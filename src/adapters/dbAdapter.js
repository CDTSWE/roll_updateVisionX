const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

class DBAdapter {
  constructor(config) {
    this.config = {
      user: config.SUPABASE_USER,
      host: config.SUPABASE_HOST,
      port: config.SUPABASE_PORT,
      database: config.SUPABASE_DATABASE,
      password: config.SUPABASE_PASSWORD,
    };
  }

  async connect() {
    console.log(`🔁 Connecting to ${this.config.host}:${this.config.port} via Supabase...`);
    this.client = new Client(this.config);
    await this.client.connect();
    console.log('✅ Connected to Supabase DB');
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      console.log('🔌 DB connection closed');
    }
  }

  async executeAllSqlInDir(dirPath) {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.sql'));
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dirPath, file), 'utf8');
      try {
        await this.client.query(sql);
        console.log(`✅ Executed: ${file}`);
      } catch (err) {
        console.error(`❌ Failed on ${file}: ${err.message}`);
        throw err;
      }
    }
  }

  async query(sqlString) {
    if (!this.client) {
      throw new Error("Client not connected. Call connect() first.");
    }
    try {
      // client.query dari 'pg' bisa menjalankan seluruh skrip (BEGIN...COMMIT)
      return await this.client.query(sqlString);
    } catch (err) {
      console.error(`❌ Gagal saat eksekusi kueri: ${err.message}`);
      throw err;
    }
  }
}

module.exports = DBAdapter;