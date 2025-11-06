const path = require('path');

async function updateDatabase(dbAdapter) {
  const sqlDir = path.join(__dirname, '../../scripts/sql');
  await dbAdapter.executeAllSqlInDir(sqlDir);
  console.log('🎉 DB updated!');
}

module.exports = updateDatabase;