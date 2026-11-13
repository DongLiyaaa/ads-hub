import { pool } from './db.js';

function scopeKey(reportType, datasetId, range) {
  return `${reportType}:${datasetId}:${range.startDate}:${range.endDate}`;
}

function analysisPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    reportType: row.report_type,
    datasetId: row.dataset_id,
    range: { startDate: row.range_start, endDate: row.range_end },
    version: row.version,
    analysis: row.analysis,
    model: row.model,
    generatedAt: row.generated_at.toISOString(),
    promptVersion: row.prompt_version,
    agentType: row.agent_type,
    configRevision: row.config_revision,
    persisted: true,
  };
}

export async function getLatestAnalysis(dataset, range) {
  const { rows } = await pool.query(
    'SELECT * FROM ai_analysis_runs WHERE scope_key = $1 AND is_current = true',
    [scopeKey(dataset.report_type, dataset.id, range)],
  );
  return analysisPayload(rows[0]);
}

export async function saveAnalysis({ dataset, payload, result, payloadSha256, agentConfig }) {
  const client = await pool.connect();
  const key = scopeKey(dataset.report_type, dataset.id, payload.range);
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
    const { rows: versionRows } = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM ai_analysis_runs WHERE scope_key = $1',
      [key],
    );
    const version = Number(versionRows[0].version);
    await client.query('UPDATE ai_analysis_runs SET is_current = false WHERE scope_key = $1 AND is_current = true', [key]);
    const { rows } = await client.query(
      `INSERT INTO ai_analysis_runs (
        scope_key, report_type, dataset_id, range_start, range_end, version,
        payload_sha256, input_payload, prompt_version, model, analysis, agent_type, config_revision
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        key, dataset.report_type, dataset.id, payload.range.startDate, payload.range.endDate, version,
        payloadSha256, JSON.stringify(payload), `${dataset.report_type}-v1`, result.model, result.analysis,
        agentConfig?.agentType || 'codex', agentConfig?.revision || null,
      ],
    );
    await client.query('COMMIT');
    return analysisPayload(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
