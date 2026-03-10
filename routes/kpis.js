const express = require('express');
const router = express.Router();
const db = require('../db');

// KPI Configuration - role-based targets and weights
const KPI_CONFIG = {
  'Immigration Support Specialist': {
    role: 'ISS',
    revenue: { weight: 40, target: 30000, commissionTrigger: 60000, commissionRate: 0.05 },
    submissions: { weight: 35, target: 12, approvalRate: 85 },
    clientSatisfaction: { weight: 15, minScore: 4.0 },
    compliance: { weight: 10 },
    promotionScore: 90
  },
  'Immigration Consultant': {
    role: 'CONSULTANT',
    revenue: { weight: 45, target: 46000, commissionTrigger: 92000, commissionRate: 0.05 },
    submissions: { weight: 30, target: 12, approvalRate: 90 },
    clientSatisfaction: { weight: 15, minScore: 4.2 },
    compliance: { weight: 10 },
    promotionScore: 90
  },
  'Senior Consultant': {
    role: 'SENIOR_CONSULTANT',
    revenue: { weight: 50, target: 96000, commissionTrigger: 250000, commissionRate: 0.05 },
    teamPerformance: { weight: 25 },
    clientSatisfaction: { weight: 12, minScore: 4.5 },
    compliance: { weight: 13 },
    promotionScore: 95
  }
};

// Helper function to calculate KPI score
function calculateKPIScore(data, jobPosition) {
  const config = KPI_CONFIG[jobPosition];
  if (!config) {
    return { score: 0, commission: 0, label: 'Unknown Role', pipFlag: false, promotionReady: false };
  }

  let score = 0;
  
  // Revenue scoring
  const revenueRatio = Math.min(1, data.revenue / config.revenue.target);
  score += revenueRatio * config.revenue.weight;
  
  // Submissions scoring
  if (config.submissions) {
    const submissionsRatio = Math.min(1, data.submissions / config.submissions.target);
    score += submissionsRatio * config.submissions.weight;
  }
  
  // Team performance (for senior consultants)
  if (config.teamPerformance) {
    const teamRatio = Math.min(1, data.team_score / 100);
    score += teamRatio * config.teamPerformance.weight;
  }
  
  // Client satisfaction scoring
  const clientRatio = Math.min(1, data.client_satisfaction_score / config.clientSatisfaction.minScore);
  score += clientRatio * config.clientSatisfaction.weight;
  
  // Compliance
  if (data.compliance) {
    score += config.compliance.weight;
  }
  
  // Commission calculation
  const commission = data.revenue >= config.revenue.commissionTrigger
    ? data.revenue * config.revenue.commissionRate
    : 0;
  
  // Performance label
  let label;
  if (score >= 90) label = 'Exceeds Expectations';
  else if (score >= 80) label = 'Meets Expectations';
  else if (score >= 70) label = 'Below Expectations – PIP';
  else label = 'Critical Review';
  
  // PIP flag (score < 70 or consistently < 80)
  const pipFlag = score < 70;
  
  // Promotion readiness
  const promotionReady = score >= config.promotionScore;
  
  return { score, commission, label, pipFlag, promotionReady };
}

// GET /api/kpis - list all KPIs with optional filters
router.get('/', async (req, res) => {
  const { employee_id, period_month, start_date, end_date } = req.query;
  try {
    let q = `
      SELECT k.*, e.full_name AS employee_name, e.job_position, 
             r.full_name AS reviewer_name
      FROM employee_kpis k
      LEFT JOIN employees e ON e.id = k.employee_id
      LEFT JOIN employees r ON r.id = k.reviewer_id
      WHERE 1=1
    `;
    const vals = [];
    let idx = 1;
    
    if (employee_id) {
      q += ` AND k.employee_id = $${idx++}`;
      vals.push(employee_id);
    }
    if (period_month) {
      q += ` AND k.period_month = $${idx++}`;
      vals.push(period_month);
    }
    if (start_date) {
      q += ` AND k.period_month >= $${idx++}`;
      vals.push(start_date);
    }
    if (end_date) {
      q += ` AND k.period_month <= $${idx++}`;
      vals.push(end_date);
    }
    
    q += ` ORDER BY k.period_month DESC, e.full_name`;
    
    const { rows } = await db.query(q, vals);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching KPIs', err);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// GET /api/kpis/employee/:employeeId/latest - get most recent KPI for an employee
router.get('/employee/:employeeId/latest', async (req, res) => {
  const { employeeId } = req.params;
  try {
    const q = `
      SELECT k.*, e.full_name AS employee_name, e.job_position,
             r.full_name AS reviewer_name
      FROM employee_kpis k
      LEFT JOIN employees e ON e.id = k.employee_id
      LEFT JOIN employees r ON r.id = k.reviewer_id
      WHERE k.employee_id = $1
      ORDER BY k.period_month DESC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [employeeId]);
    if (rows.length === 0) {
      return res.json(null);
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching latest KPI', err);
    res.status(500).json({ error: 'Failed to fetch latest KPI' });
  }
});

// GET /api/kpis/employee/:employeeId/history - get KPI history for an employee
router.get('/employee/:employeeId/history', async (req, res) => {
  const { employeeId } = req.params;
  const { limit } = req.query;
  try {
    let q = `
      SELECT k.*, e.full_name AS employee_name, e.job_position,
             r.full_name AS reviewer_name
      FROM employee_kpis k
      LEFT JOIN employees e ON e.id = k.employee_id
      LEFT JOIN employees r ON r.id = k.reviewer_id
      WHERE k.employee_id = $1
      ORDER BY k.period_month DESC
    `;
    
    if (limit) {
      q += ` LIMIT $2`;
      const { rows } = await db.query(q, [employeeId, limit]);
      return res.json(rows);
    }
    
    const { rows } = await db.query(q, [employeeId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching KPI history', err);
    res.status(500).json({ error: 'Failed to fetch KPI history' });
  }
});

// GET /api/kpis/:id - get specific KPI record
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const q = `
      SELECT k.*, e.full_name AS employee_name, e.job_position,
             r.full_name AS reviewer_name
      FROM employee_kpis k
      LEFT JOIN employees e ON e.id = k.employee_id
      LEFT JOIN employees r ON r.id = k.reviewer_id
      WHERE k.kpi_id = $1
    `;
    const { rows } = await db.query(q, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'KPI record not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching KPI', err);
    res.status(500).json({ error: 'Failed to fetch KPI' });
  }
});

// POST /api/kpis - create or update KPI record
router.post('/', async (req, res) => {
  const {
    employee_id,
    period_month,
    revenue,
    submissions,
    approval_rate,
    client_satisfaction_score,
    compliance,
    team_score,
    manager_notes,
    reviewer_id
  } = req.body;

  try {
    // Get employee's job position
    const empQuery = await db.query('SELECT job_position FROM employees WHERE id = $1', [employee_id]);
    if (empQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const jobPosition = empQuery.rows[0].job_position;

    // Calculate KPI score
    const calculated = calculateKPIScore({
      revenue: revenue || 0,
      submissions: submissions || 0,
      approval_rate: approval_rate || 0,
      client_satisfaction_score: client_satisfaction_score || 0,
      compliance: compliance !== false,
      team_score: team_score || 0
    }, jobPosition);

    // Upsert KPI record
    const q = `
      INSERT INTO employee_kpis (
        employee_id, period_month, revenue, submissions, approval_rate,
        client_satisfaction_score, compliance, team_score,
        kpi_score, performance_label, commission, pip_flag, promotion_ready,
        manager_notes, reviewer_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (employee_id, period_month)
      DO UPDATE SET
        revenue = EXCLUDED.revenue,
        submissions = EXCLUDED.submissions,
        approval_rate = EXCLUDED.approval_rate,
        client_satisfaction_score = EXCLUDED.client_satisfaction_score,
        compliance = EXCLUDED.compliance,
        team_score = EXCLUDED.team_score,
        kpi_score = EXCLUDED.kpi_score,
        performance_label = EXCLUDED.performance_label,
        commission = EXCLUDED.commission,
        pip_flag = EXCLUDED.pip_flag,
        promotion_ready = EXCLUDED.promotion_ready,
        manager_notes = EXCLUDED.manager_notes,
        reviewer_id = EXCLUDED.reviewer_id,
        updated_at = now()
      RETURNING *
    `;

    const vals = [
      employee_id,
      period_month,
      revenue || 0,
      submissions || 0,
      approval_rate || 0,
      client_satisfaction_score || 0,
      compliance !== false,
      team_score || 0,
      calculated.score,
      calculated.label,
      calculated.commission,
      calculated.pipFlag,
      calculated.promotionReady,
      manager_notes || null,
      reviewer_id || null
    ];

    const { rows } = await db.query(q, vals);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating/updating KPI', err);
    res.status(500).json({ error: 'Failed to create/update KPI' });
  }
});

// PATCH /api/kpis/:id - update KPI record
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get existing KPI record
    const existing = await db.query('SELECT k.*, e.job_position FROM employee_kpis k JOIN employees e ON e.id = k.employee_id WHERE k.kpi_id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'KPI record not found' });
    }
    
    const current = existing.rows[0];
    const jobPosition = current.job_position;
    
    // Merge updates
    const updatedData = {
      revenue: req.body.revenue !== undefined ? req.body.revenue : current.revenue,
      submissions: req.body.submissions !== undefined ? req.body.submissions : current.submissions,
      approval_rate: req.body.approval_rate !== undefined ? req.body.approval_rate : current.approval_rate,
      client_satisfaction_score: req.body.client_satisfaction_score !== undefined ? req.body.client_satisfaction_score : current.client_satisfaction_score,
      compliance: req.body.compliance !== undefined ? req.body.compliance : current.compliance,
      team_score: req.body.team_score !== undefined ? req.body.team_score : current.team_score
    };
    
    // Recalculate scores
    const calculated = calculateKPIScore(updatedData, jobPosition);
    
    const q = `
      UPDATE employee_kpis SET
        revenue = $1,
        submissions = $2,
        approval_rate = $3,
        client_satisfaction_score = $4,
        compliance = $5,
        team_score = $6,
        kpi_score = $7,
        performance_label = $8,
        commission = $9,
        pip_flag = $10,
        promotion_ready = $11,
        manager_notes = COALESCE($12, manager_notes),
        reviewer_id = COALESCE($13, reviewer_id),
        updated_at = now()
      WHERE kpi_id = $14
      RETURNING *
    `;
    
    const vals = [
      updatedData.revenue,
      updatedData.submissions,
      updatedData.approval_rate,
      updatedData.client_satisfaction_score,
      updatedData.compliance,
      updatedData.team_score,
      calculated.score,
      calculated.label,
      calculated.commission,
      calculated.pipFlag,
      calculated.promotionReady,
      req.body.manager_notes,
      req.body.reviewer_id,
      id
    ];
    
    const { rows } = await db.query(q, vals);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating KPI', err);
    res.status(500).json({ error: 'Failed to update KPI' });
  }
});

// DELETE /api/kpis/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const q = `DELETE FROM employee_kpis WHERE kpi_id = $1 RETURNING *`;
    const { rows } = await db.query(q, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'KPI record not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error deleting KPI', err);
    res.status(500).json({ error: 'Failed to delete KPI' });
  }
});

// GET /api/kpis/team-score/:employeeId/:month - get team/department KPI score
router.get('/team-score/:employeeId/:month', async (req, res) => {
  const { employeeId, month } = req.params;
  try {
    // First, get the senior consultant's department
    const empQuery = await db.query(
      'SELECT department FROM employees WHERE id = $1',
      [employeeId]
    );
    
    if (empQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const department = empQuery.rows[0].department;
    
    // Get all employees in the same department (excluding the senior consultant themselves)
    const deptEmpsQuery = await db.query(
      'SELECT id FROM employees WHERE department = $1 AND id != $2 AND is_active = true',
      [department, employeeId]
    );
    
    const deptEmployeeIds = deptEmpsQuery.rows.map(e => e.id);
    
    if (deptEmployeeIds.length === 0) {
      // No team members, return 0
      return res.json({
        team_score: 0,
        team_size: 0,
        average_kpi: 0,
        period: month,
        department: department
      });
    }
    
    // Get the period month as start and end dates
    const [year, monthNum] = month.split('-');
    const startDate = `${year}-${monthNum}-01`;
    const monthStart = new Date(year, parseInt(monthNum) - 1, 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const endDate = monthEnd.toISOString().split('T')[0];
    
    // Fetch KPI scores for all team members in this period
    // If they don't have a KPI record yet, calculate one from their current metrics
    const teamScoresQuery = await db.query(`
      SELECT 
        e.id,
        e.full_name,
        COALESCE(k.kpi_score, 0) as kpi_score,
        e.total_revenue,
        e.conversions_count,
        k.period_month
      FROM employees e
      LEFT JOIN employee_kpis k ON e.id = k.employee_id 
        AND DATE_TRUNC('month', k.period_month) = DATE_TRUNC('month', $1::date)
      WHERE e.id = ANY($2)
      ORDER BY e.full_name
    `, [startDate, deptEmployeeIds]);
    
    const teamScores = teamScoresQuery.rows;
    const averageKPI = teamScores.length > 0 
      ? Math.round(teamScores.reduce((sum, emp) => sum + parseFloat(emp.kpi_score || 0), 0) / teamScores.length * 10) / 10
      : 0;
    
    res.json({
      team_score: averageKPI,
      team_size: teamScores.length,
      average_kpi: averageKPI,
      team_members: teamScores,
      period: month,
      department: department
    });
  } catch (err) {
    console.error('Error fetching team score:', err);
    res.status(500).json({ error: 'Failed to fetch team score' });
  }
});

// GET /api/kpis/config/:jobPosition - get KPI config for a job position
router.get('/config/:jobPosition', async (req, res) => {
  const { jobPosition } = req.params;
  const config = KPI_CONFIG[jobPosition];
  if (!config) {
    return res.status(404).json({ error: 'No KPI configuration found for this job position' });
  }
  res.json(config);
});

// GET /api/kpis/revenue/:employeeId/:month - get monthly revenue from prospects
router.get('/revenue/:employeeId/:month', async (req, res) => {
  const { employeeId, month } = req.params;
  try {
    // month format: YYYY-MM
    const [year, monthNum] = month.split('-');
    const startDate = `${year}-${monthNum}-01`;
    
    // Calculate end date of month
    const monthStart = new Date(year, parseInt(monthNum) - 1, 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const endDate = monthEnd.toISOString().split('T')[0];
    
    const q = `
      SELECT 
        COALESCE(SUM(CAST(forecast_amount AS DECIMAL)), 0) as total_revenue,
        COUNT(*) as closed_deals
      FROM prospects
      WHERE assigned_to = $1
        AND current_stage_id IN (
          SELECT stage_id FROM prospect_stages WHERE name ILIKE '%won%' OR name ILIKE '%closed%'
        )
        AND (
          DATE(expected_payment_date) BETWEEN $2 AND $3
          OR DATE(updated_at) BETWEEN $2 AND $3
        )
    `;
    
    const { rows } = await db.query(q, [employeeId, startDate, endDate]);
    const result = rows[0] || { total_revenue: 0, closed_deals: 0 };
    
    res.json({
      monthly_revenue: Number(result.total_revenue),
      closed_deals: Number(result.closed_deals),
      period: month
    });
  } catch (err) {
    console.error('Error fetching monthly revenue:', err);
    res.status(500).json({ error: 'Failed to fetch monthly revenue' });
  }
});

module.exports = router;
