const express = require('express');
const router = express.Router();
const db = require('../db');
const { createNotification } = require('../lib/notifications');

console.log('Loaded routes/prospects.js');

// PATCH /api/prospects/:id/stage - update prospect stage
router.patch('/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage_id } = req.body;
  const allowedStageIDs = Array.from({ length: 14 }, (_, i) => i + 1);

  if (!stage_id || !allowedStageIDs.includes(stage_id)) {
    return res.status(400).json({ error: 'Invalid stage_id provided.' });
  }

  try {
    const result = await db.query(
      `UPDATE prospects SET current_stage_id = $1, updated_at = CURRENT_TIMESTAMP WHERE prospect_id = $2 RETURNING *`,
      [stage_id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    const updated = result.rows[0];

    // Fetch the stage name so we can detect 'won' semantics
    try {
      const stageRes = await db.query('SELECT name FROM prospect_stages WHERE stage_id = $1', [stage_id]);
      const stageName = (stageRes.rows[0] && stageRes.rows[0].name) ? stageRes.rows[0].name.toLowerCase() : '';

      // If stage name indicates a won/closed-won state, auto-create a project and a document folder
      if (stageName.includes('won') || stageName.includes('closed won') || stageName.includes('closed')) {
        // Avoid duplicate projects: check if a project already exists for this prospect's lead
        const prospectRow = await db.query('SELECT * FROM prospects WHERE prospect_id = $1', [id]);
        const prospect = prospectRow.rows[0];

        // Update employee metrics for the assigned salesperson
        if (prospect.assigned_to) {
          try {
            const revenueAmount = prospect.forecast_amount || 0;
            await db.query(
              `UPDATE employees 
               SET conversions_count = conversions_count + 1,
                   total_revenue = total_revenue + $1,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [revenueAmount, prospect.assigned_to]
            );
            console.log(`Updated employee ${prospect.assigned_to} metrics: +1 conversion, +${revenueAmount} revenue`);
          } catch (errMetrics) {
            console.error('Error updating employee metrics:', errMetrics);
            // Don't fail the stage update because of metrics update
          }
        }

        // Use lead_id if available to link project; otherwise allow NULL
        const clientLeadId = prospect.lead_id || null;
        const assignedUserId = prospect.assigned_to || null;
        const folderName = (prospect.deal_name && prospect.deal_name.trim()) || `${(prospect.first_name||'').trim()} ${(prospect.last_name||'').trim()}`.trim() || `project-${Date.now()}`;

        // If we have a lead id, skip auto-creation when a project already exists for that lead
        if (clientLeadId) {
          try {
            const existing = await db.query('SELECT project_id FROM projects WHERE client_lead_id = $1 LIMIT 1', [clientLeadId]);
            if (existing.rows.length > 0) {
              updated.autoCreatedProject = { skipped: true, reason: 'existing_project', projectId: existing.rows[0].project_id };
              // mark prospect as won but don't create duplicate project
              await db.query('UPDATE prospects SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE prospect_id = $2', ['won', id]);
            }
          } catch (errCheck) {
            console.error('Error checking existing project for lead:', errCheck);
          }
        }

        // If not skipped above, proceed to create
        if (!updated.autoCreatedProject) {
          const client = await db.pool.connect();
          try {
            await client.query('BEGIN');

            const ins = await client.query(
              `INSERT INTO projects (client_lead_id, visa_type_id, assigned_user_id, current_stage) VALUES ($1,$2,$3,1) RETURNING project_id`,
              [clientLeadId, null, assignedUserId]
            );
            const projectId = ins.rows[0].project_id;

            // Create a document folder for this project
            await client.query(
              `INSERT INTO document_folders (project_id, name) VALUES ($1, $2)`,
              [projectId, folderName]
            );

            // If there are visa template docs, copy them into project_documents (safe if visa_type_id is null)
            const templateRes = await client.query('SELECT document_id FROM visa_document_checklist WHERE visa_type_id = $1', [null]);
            for (const row of templateRes.rows) {
              await client.query('INSERT INTO project_documents (project_id, document_id, status) VALUES ($1,$2,\'Pending\')', [projectId, row.document_id]);
            }

            // Optionally mark prospect as converted/won
            await client.query('UPDATE prospects SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE prospect_id = $2', ['won', id]);

            await client.query('COMMIT');
            // attach project info to response
            updated.autoCreatedProject = { projectId, folderName };
          } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error auto-creating project for won prospect:', err);
            // don't fail the stage update because of project creation; just log
          } finally {
            client.release();
          }
        }
      }
    } catch (errStage) {
      console.error('Error checking stage name for auto-create logic:', errStage);
    }

    res.json(updated);
  } catch (err) {
    console.error('Error updating prospect stage:', err);
    res.status(500).json({ error: 'Failed to update stage' });
  }
});

// GET /api/prospects - list prospects
router.get('/', async (req, res) => {
  console.log('=== GET /api/prospects called ===');
  const { search } = req.query;
  try {
    console.log('Attempting to query database...');
    
    let query = `
      SELECT 
        p.*,
        ps.name as stage_name
      FROM prospects p
      LEFT JOIN prospect_stages ps ON p.current_stage_id = ps.stage_id
      WHERE (p.is_archived = FALSE OR p.is_archived IS NULL)
    `;
    
    const params = [];
    
    // Add search filter if provided
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      query += ` AND (
        LOWER(p.first_name) LIKE $1 OR 
        LOWER(p.last_name) LIKE $1 OR 
        LOWER(p.deal_name) LIKE $1 OR 
        LOWER(p.company) LIKE $1 OR 
        LOWER(p.email) LIKE $1 OR 
        LOWER(p.source) LIKE $1
      )`;
      params.push(searchTerm);
    }
    
    query += ` ORDER BY p.created_at DESC`;
    
    const result = await db.query(query, params);
    console.log(`Query successful, found ${result.rows.length} rows`);
    
    // Map stage IDs to frontend stage keys (fallback)
    const stageMapping = {
      1: 'opportunity',
      2: 'quote_requested',
      3: 'quote_sent',
      4: 'first_follow_up',
      5: 'second_follow_up',
      6: 'mid_month_follow_up',
      7: 'month_end_follow_up',
      8: 'next_month_follow_up',
      9: 'discount_requested',
      10: 'quote_accepted',
      11: 'engagement_sent',
      12: 'invoice_sent',
      13: 'payment_date_confirmed',
      14: 'won'
    };

    // Transform data to match frontend expectations. Prefer the human-readable
    // stage name when available (so we can detect 'won' or 'payment' semantics),
    // otherwise fall back to the numeric mapping above.
    const transformedProspects = result.rows.map(prospect => {
      const stageName = (prospect.stage_name || '').toLowerCase();
      let pipelineStage = stageMapping[prospect.current_stage_id] || 'opportunity';
      if (stageName.includes('won') || stageName.includes('closed won') || stageName.includes('closed')) {
        pipelineStage = 'won';
      } else if (stageName.includes('payment')) {
        pipelineStage = 'payment_date_confirmed';
      }

      return {
        ...prospect,
        id: prospect.prospect_id,
        name: (prospect.deal_name && prospect.deal_name.trim()) || `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim(),
        deal_name: prospect.deal_name,
        pipeline_stage: pipelineStage,
        lead_source: prospect.source
      };
    });
    
    console.log(`Returning ${transformedProspects.length} transformed prospects`);
    res.json(transformedProspects);
  } catch (err) {
    console.error('Error fetching prospects:', err);
    console.error('Error details:', err.message);
    console.error('Error code:', err.code);
    console.error('Error stack:', err.stack);
    res.status(500).json({ error: 'Server error fetching prospects', detail: err.message });
  }
});

// GET /api/prospects/stages - list prospect stages
router.get('/stages', async (req, res) => {
  try {
    const result = await db.query('SELECT stage_id, name, display_order, description FROM prospect_stages ORDER BY display_order NULLS LAST, stage_id');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching prospect stages:', err);
    res.status(500).json({ error: 'Failed to fetch prospect stages', detail: err.message });
  }
});

// POST /api/prospects - create a prospect
router.post('/', async (req, res) => {
  const { 
    lead_id = null, 
    first_name, 
    last_name, 
    name, 
    deal_name = null,
    email, 
    phone = null, 
    company = null, 
    source = null,
    lead_source = null,
    pipeline_stage = 'opportunity',
    notes = null
  } = req.body;

  // Handle both 'name' (from frontend modal) and 'first_name'/'last_name' split
  let firstName = first_name;
  let lastName = last_name;
  
  if (!firstName && !lastName && name) {
    const nameParts = name.trim().split(' ');
    firstName = nameParts[0];
    lastName = nameParts.slice(1).join(' ') || nameParts[0];
  }

  if (!firstName || !email) {
    return res.status(400).json({ error: 'Missing required fields (name/first_name and email).' });
  }

  try {
    // Default to stage 1 (Opportunity) for new prospects
    const current_stage_id = 1;
    const finalSource = source || lead_source || 'Direct';

    const result = await db.query(
      `INSERT INTO prospects (lead_id, first_name, last_name, email, phone, company, source, deal_name, current_stage_id, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP) RETURNING *`,
      [lead_id, firstName, lastName, email, phone, company, finalSource, deal_name, current_stage_id, notes]
    );

    // If the request provided a lead_id, optionally mark the lead as converted
    if (lead_id) {
      try {
        await db.query('UPDATE leads SET converted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE lead_id = $1', [lead_id]);
      } catch (ignoreErr) {
        // ignore if column doesn't exist
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating prospect:', err);
    console.error('Error details:', err.message);
    console.error('Error code:', err.code);
    res.status(500).json({ error: 'Failed to create prospect', detail: err.message });
  }
});

  // GET /api/prospects/lost/list - get all lost/archived prospects - Must come BEFORE /:id
  router.get('/lost/list', async (req, res) => {
    const { search, assigned_employee_id } = req.query;
    try {
      const whereConditions = ['p.is_archived = TRUE'];
      const queryParams = [];
      
      if (assigned_employee_id) {
        if (assigned_employee_id === 'unassigned') {
          whereConditions.push('p.assigned_to IS NULL');
        } else {
          queryParams.push(assigned_employee_id);
          whereConditions.push(`p.assigned_to = $${queryParams.length}`);
        }
      }
      
      if (search && typeof search === 'string' && search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        queryParams.push(searchTerm);
        whereConditions.push(`(
          LOWER(p.first_name) LIKE $${queryParams.length} OR 
          LOWER(p.last_name) LIKE $${queryParams.length} OR 
          LOWER(p.deal_name) LIKE $${queryParams.length} OR 
          LOWER(p.company) LIKE $${queryParams.length} OR 
          LOWER(p.email) LIKE $${queryParams.length}
        )`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      
      const result = await db.query(`
        SELECT p.*, e.full_name as assigned_to_name
        FROM prospects p
        LEFT JOIN employees e ON p.assigned_to = e.employee_id
        ${whereClause}
        ORDER BY p.updated_at DESC
      `, queryParams);
      
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching lost prospects:', err);
      res.status(500).json({ error: 'Failed to fetch lost prospects', detail: err.message });
    }
  });

  // PATCH /api/prospects/:id - update prospect fields
  router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const allowed = [
      'first_name','last_name','email','phone','company','source','deal_name',
      'assigned_to','quote_sent_date','quote_amount','professional_fees','deposit_amount','expected_closing_date','expected_payment_date','forecast_amount','forecast_probability','notes'
    ];

    // Get current prospect state to detect assignment changes
    let currentProspect = null;
    try {
      const currentRes = await db.query('SELECT * FROM prospects WHERE prospect_id = $1', [id]);
      if (currentRes.rows.length > 0) {
        currentProspect = currentRes.rows[0];
      }
    } catch (err) {
      console.error('Error fetching current prospect:', err);
    }

    const updates = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        // Special handling for numeric fields
        if (['quote_amount','professional_fees','deposit_amount','forecast_amount'].includes(key)) {
          const numVal = req.body[key] !== null ? parseFloat(req.body[key]) : null;
          updates.push(`${key} = $${i}`);
          values.push(isNaN(numVal) ? null : numVal);
        } else if (['forecast_probability','assigned_to'].includes(key)) {
          const numVal = req.body[key] !== null ? parseInt(req.body[key]) : null;
          updates.push(`${key} = $${i}`);
          values.push(isNaN(numVal) ? null : numVal);
        } else {
          updates.push(`${key} = $${i}`);
          values.push(req.body[key]);
        }
        i++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    try {
      const sql = `UPDATE prospects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE prospect_id = $${i} RETURNING *`;
      values.push(id);
      console.log('Executing update query:', sql);
      console.log('With values:', values);
      const result = await db.query(sql, values);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Prospect not found' });

      // Notify if prospect was assigned to someone
      if (req.body.assigned_to && currentProspect && req.body.assigned_to !== currentProspect.assigned_to) {
        try {
          const p = result.rows[0];
          const prospectName = p.deal_name || 
            `${p.first_name || ''} ${p.last_name || ''}`.trim() || 
            'Prospect';
          const companyInfo = p.company ? ` from ${p.company}` : '';
          const valueInfo = p.quote_amount ? ` (Value: $${p.quote_amount})` : '';
          
          await createNotification({
            employee_id: req.body.assigned_to,
            type: 'prospect_assigned',
            title: 'New Prospect Assigned',
            message: `You have been assigned to prospect: ${prospectName}${companyInfo}${valueInfo}`,
            related_entity_type: 'prospect',
            related_entity_id: p.prospect_id
          });
          console.log(`Notified employee ${req.body.assigned_to} about prospect assignment`);
        } catch (notifErr) {
          console.error('Error creating prospect assignment notification:', notifErr);
        }
      }

      // transform response to frontend shape
      const p = result.rows[0];
      const stageMapping = {1:'opportunity',2:'quote_requested',3:'quote_sent',4:'first_follow_up',5:'second_follow_up',6:'mid_month_follow_up',7:'month_end_follow_up',8:'next_month_follow_up',9:'discount_requested',10:'quote_accepted',11:'engagement_sent',12:'invoice_sent',13:'payment_date_confirmed',14:'won'};
      const transformed = {
        ...p,
        id: p.prospect_id,
        name: (p.deal_name && p.deal_name.trim()) || `${p.first_name||''} ${p.last_name||''}`.trim(),
        deal_name: p.deal_name,
        pipeline_stage: stageMapping[p.current_stage_id] || 'opportunity',
        lead_source: p.source
      };
      res.json(transformed);
    } catch (err) {
      console.error('Error updating prospect:', err);
      res.status(500).json({ error: 'Failed to update prospect', detail: err.message });
    }
  });

  // PATCH /api/prospects/:id/lost - mark prospect lost/archive
  router.patch('/:id/lost', async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    try {
      const pRes = await db.query('SELECT notes FROM prospects WHERE prospect_id = $1', [id]);
      if (pRes.rows.length === 0) return res.status(404).json({ error: 'Prospect not found' });
      const existing = pRes.rows[0].notes || '';
      const newNotes = `${existing}\n[${new Date().toISOString()}] MARKED AS LOST: ${reason}`;
      const result = await db.query('UPDATE prospects SET status = $1, notes = $2, is_archived = $3, updated_at = CURRENT_TIMESTAMP WHERE prospect_id = $4 RETURNING *', ['lost', newNotes, true, id]);
      res.json({ message: 'Prospect marked as lost and archived', prospect: result.rows[0] });
    } catch (err) {
      console.error('Error marking prospect lost:', err);
      res.status(500).json({ error: 'Failed to mark prospect lost', detail: err.message });
    }
  });

  // PATCH /api/prospects/:id/recover - recover a lost prospect
  router.patch('/:id/recover', async (req, res) => {
    const { id } = req.params;
    try {
      const pRes = await db.query('SELECT notes FROM prospects WHERE prospect_id = $1', [id]);
      if (pRes.rows.length === 0) return res.status(404).json({ error: 'Prospect not found' });
      const existing = pRes.rows[0].notes || '';
      const newNotes = `${existing}\n[${new Date().toISOString()}] RECOVERED FROM LOST`;
      const result = await db.query('UPDATE prospects SET status = $1, notes = $2, is_archived = $3, updated_at = CURRENT_TIMESTAMP WHERE prospect_id = $4 RETURNING *', ['opportunity', newNotes, false, id]);
      res.json({ message: 'Prospect recovered successfully', prospect: result.rows[0] });
    } catch (err) {
      console.error('Error recovering prospect:', err);
      res.status(500).json({ error: 'Failed to recover prospect', detail: err.message });
    }
  });

  // DELETE /api/prospects/:id - delete prospect
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const result = await db.query('DELETE FROM prospects WHERE prospect_id = $1 RETURNING *', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Prospect not found' });
      res.json({ message: 'Prospect deleted', prospect: result.rows[0] });
    } catch (err) {
      console.error('Error deleting prospect:', err);
      res.status(500).json({ error: 'Failed to delete prospect', detail: err.message });
    }
  });

  // TAGS: GET /api/tags, POST /api/tags
  router.get('/tags', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM tags ORDER BY name');
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching tags:', err);
      res.status(500).json({ error: 'Failed to fetch tags', detail: err.message });
    }
  });

  router.post('/tags', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Tag name required' });
    try {
      const result = await db.query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING *', [name]);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error creating tag:', err);
      res.status(500).json({ error: 'Failed to create tag', detail: err.message });
    }
  });

  // GET /api/prospects/:id/tags
  router.get('/:id/tags', async (req, res) => {
    const { id } = req.params;
    try {
      const result = await db.query(`
        SELECT t.* FROM tags t
        JOIN prospect_tags pt ON pt.tag_id = t.tag_id
        WHERE pt.prospect_id = $1 ORDER BY t.name
      `, [id]);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching prospect tags:', err);
      res.status(500).json({ error: 'Failed to fetch prospect tags', detail: err.message });
    }
  });

  // POST /api/prospects/:id/tags - set tags (array of tag_ids)
  router.post('/:id/tags', async (req, res) => {
    const { id } = req.params;
    const { tag_ids } = req.body; // expects array
    if (!Array.isArray(tag_ids)) return res.status(400).json({ error: 'tag_ids array required' });
    try {
      // Delete existing
      await db.query('DELETE FROM prospect_tags WHERE prospect_id = $1', [id]);
      // Insert new
      for (const tagId of tag_ids) {
        await db.query('INSERT INTO prospect_tags (prospect_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, tagId]);
      }
      const tags = await db.query('SELECT t.* FROM tags t JOIN prospect_tags pt ON pt.tag_id = t.tag_id WHERE pt.prospect_id = $1 ORDER BY t.name', [id]);
      res.json(tags.rows);
    } catch (err) {
      console.error('Error setting prospect tags:', err);
      res.status(500).json({ error: 'Failed to set prospect tags', detail: err.message });
    }
  });

module.exports = router;

// POST /api/prospects/:id/followup - lightweight follow-up scheduling endpoint
router.post('/:id/followup', async (req, res) => {
  const { id } = req.params;
  const { followUpType, scheduledDate } = req.body;
  const created_by = req.headers['x-user-email'] || null;
  try {
    // Try to insert into follow_ups table if it exists
    try {
      await db.query(`INSERT INTO follow_ups (prospect_id, followup_type, scheduled_date, created_by) VALUES ($1,$2,$3,$4)`, [id, followUpType, scheduledDate, created_by]);
      return res.json({ ok: true, message: 'Follow-up scheduled' });
    } catch (innerErr) {
      console.warn('Follow-ups table not present or insert failed, returning ok without DB write', innerErr.message || innerErr);
      return res.json({ ok: true, message: 'Follow-up recorded (no DB table present)' });
    }
  } catch (err) {
    console.error('Error scheduling followup:', err);
    res.status(500).json({ error: 'Failed to schedule followup' });
  }
});

// GET /api/prospects/total-pipeline - total value of deals currently in the pipeline
router.get('/total-pipeline', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        COALESCE(SUM(p.quote_amount), 0) AS total_pipeline_value,
        COUNT(*) FILTER (WHERE p.quote_amount IS NOT NULL) AS deals_count
      FROM prospects p
      LEFT JOIN prospect_stages ps ON p.current_stage_id = ps.stage_id
      WHERE p.quote_amount IS NOT NULL
        AND (
          ps.name IS NULL
          OR (
            ps.name NOT ILIKE '%won%'
            AND ps.name NOT ILIKE '%closed%'
            AND ps.name NOT ILIKE '%lost%'
            AND ps.name NOT ILIKE '%archiv%'
          )
        )
    `);

    // Postgres may return numeric as string; keep as-is or convert in frontend
    const row = result.rows[0] || { total_pipeline_value: 0, deals_count: 0 };
    res.json({ total: row.total_pipeline_value, deals: parseInt(row.deals_count, 10) || 0 });
  } catch (err) {
    console.error('Error computing pipeline total:', err);
    res.status(500).json({ error: 'Failed to compute pipeline total', detail: err.message });
  }
});
