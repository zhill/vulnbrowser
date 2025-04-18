const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { initializeDatabase } = require('./init');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new sqlite3.Database('vulnerabilities.db');

// Initialize database and start server
initializeDatabase().then(() => {
  // API Routes
  app.get('/api/vulnerabilities', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get total count
    db.get('SELECT COUNT(*) as total FROM vulnerabilities', [], (err, countRow) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      // Get paginated vulnerabilities
      db.all(
        'SELECT id, created_at FROM vulnerabilities ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
        (err, rows) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.json({
            data: rows,
            pagination: {
              total: countRow.total,
              page,
              limit,
              totalPages: Math.ceil(countRow.total / limit)
            }
          });
        }
      );
    });
  });

  app.get('/api/vulnerabilities/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM vulnerabilities WHERE id = ?', [id], (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: 'Vulnerability not found' });
        return;
      }
      res.json({ ...row, data: JSON.parse(row.data) });
    });
  });

  app.post('/api/vulnerabilities', (req, res) => {
    const { id, data } = req.body;
    if (!id || !data) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    db.run(
      'INSERT OR REPLACE INTO vulnerabilities (id, data) VALUES (?, ?)',
      [id, JSON.stringify(data)],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ id, data });
      }
    );
  });

  app.delete('/api/vulnerabilities/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM vulnerabilities WHERE id = ?', [id], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Vulnerability not found' });
        return;
      }
      res.json({ message: 'Vulnerability deleted successfully' });
    });
  });

  // Ecosystems API
  app.get('/api/ecosystems', (req, res) => {
    db.all('SELECT * FROM ecosystems ORDER BY name', [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    });
  });

  app.post('/api/ecosystems', (req, res) => {
    const { id, name } = req.body;
    if (!id || !name) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    db.run(
      'INSERT INTO ecosystems (id, name) VALUES (?, ?)',
      [id, name],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ id, name });
      }
    );
  });

  // Start server
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}).catch(err => {
  console.error('Failed to initialize server:', err);
  process.exit(1);
}); 