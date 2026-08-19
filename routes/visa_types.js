const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT visa_type_id, name, description
       FROM visa_types
       ORDER BY name`
    );
    res.json({ visa_types: result.rows });
  } catch (error) {
    console.error('Error fetching visa types:', error);
    res.status(500).json({ error: 'Failed to fetch visa types' });
  }
});

module.exports = router;
