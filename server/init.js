const https = require('https');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const sqlite3 = require('sqlite3').verbose();

const OSV_URL = 'https://osv-vulnerabilities.storage.googleapis.com/all.zip';
const LOCAL_ZIP_PATH = path.join(__dirname, 'osv-data.zip');
const LOCAL_DB_PATH = path.join(__dirname, 'vulnerabilities.db');

async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // Delete the file if download fails
      reject(err);
    });
  });
}

async function getRemoteETag() {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'HEAD',
      host: 'osv-vulnerabilities.storage.googleapis.com',
      path: '/all.zip'
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to get remote ETag: ${res.statusCode}`));
        return;
      }
      
      const etag = res.headers['etag'];
      if (!etag) {
        reject(new Error('ETag header not found'));
        return;
      }
      
      // Remove quotes from ETag if present
      resolve(etag.replace(/^"|"$/g, ''));
    });

    req.on('error', reject);
    req.end();
  });
}

async function downloadOSVDatabase() {
  try {
    // Get remote ETag
    const remoteETag = await getRemoteETag();
    
    // Check if local file exists and compare ETag
    let shouldDownload = true;
    if (await fs.pathExists(LOCAL_ZIP_PATH)) {
      const localETag = await calculateFileHash(LOCAL_ZIP_PATH);
      shouldDownload = localETag !== remoteETag;
    }
    
    if (shouldDownload) {
      console.log('Downloading latest OSV database...');
      await downloadFile(OSV_URL, LOCAL_ZIP_PATH);
      console.log('Download complete');
    } else {
      console.log('Local OSV database is up to date');
    }
    
    return shouldDownload;
  } catch (err) {
    console.error('Error downloading OSV database:', err);
    throw err;
  }
}

async function processOSVData() {
  const db = new sqlite3.Database(LOCAL_DB_PATH);
  
  // Check if database is empty
  const isEmpty = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM vulnerabilities', (err, row) => {
      if (err) reject(err);
      else resolve(row.count === 0);
    });
  });
  
  if (!isEmpty) {
    console.log('Database already contains data, skipping import');
    db.close();
    return;
  }
  
  console.log('Processing OSV data...');
  
  // Create tables if they don't exist
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS vulnerabilities (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      db.run(`
        CREATE TABLE IF NOT EXISTS ecosystems (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Insert default ecosystems
      const defaultEcosystems = [
        { id: 'npm', name: 'npm' },
        { id: 'pypi', name: 'PyPI' },
        { id: 'maven', name: 'Maven' },
        { id: 'nuget', name: 'NuGet' },
        { id: 'cargo', name: 'Cargo' }
      ];
      
      const stmt = db.prepare('INSERT OR IGNORE INTO ecosystems (id, name) VALUES (?, ?)');
      defaultEcosystems.forEach(eco => {
        stmt.run(eco.id, eco.name);
      });
      stmt.finalize();
      
      resolve();
    });
  });
  
  // Process zip file
  const zip = new AdmZip(LOCAL_ZIP_PATH);
  const zipEntries = zip.getEntries();
  
  let processed = 0;
  const total = zipEntries.length;
  
  for (const entry of zipEntries) {
    if (!entry.entryName.endsWith('.json')) continue;
    
    try {
      const content = entry.getData().toString('utf8');
      const vulnerability = JSON.parse(content);
      
      // Insert vulnerability
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR REPLACE INTO vulnerabilities (id, data) VALUES (?, ?)',
          [vulnerability.id, content],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      processed++;
      if (processed % 1000 === 0) {
        console.log(`Processed ${processed}/${total} vulnerabilities`);
      }
    } catch (err) {
      console.error(`Error processing ${entry.entryName}:`, err);
    }
  }
  
  console.log(`Completed processing ${processed} vulnerabilities`);
  db.close();
}

async function initializeDatabase() {
  try {
    const shouldProcess = await downloadOSVDatabase();
    if (shouldProcess || !(await fs.pathExists(LOCAL_DB_PATH))) {
      await processOSVData();
    }
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

module.exports = { initializeDatabase }; 