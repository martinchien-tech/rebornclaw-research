/**
 * CS Swarm — 归因链审计 Agent (原型)
 * 
 * 基于提案：Multi-Agent 归因链信任体系
 * 核心功能：
 *   1. 收集决策溯源 JSON
 *   2. 验证签名完整性
 *   3. 异常检测（依赖缺失 / 权重异常 / 规则未触发 / 循环依赖）
 *   4. 模式分析 → 自动改进建议
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../db/db');

// ============================================================
// 1. 决策溯源 JSON 生成器
// ============================================================

/**
 * 生成决策溯源 JSON
 * @param {Object} opts
 * @param {string} opts.agentId - Agent ID
 * @param {string} opts.sessionId - 会话 ID
 * @param {Object} opts.output - 决策结果 { action, confidence, summary }
 * @param {Array}  opts.inputTrace - 输入溯源 [{ sourceType, sourceId, contentHash, influenceWeight, decisionPath }]
 * @param {string} opts.agentSecret - Agent 密钥（HMAC 签名用）
 * @returns {Object} 决策溯源 JSON
 */
function generateTrace(opts) {
  const { agentId, sessionId, output, inputTrace, agentSecret } = opts;

  const trace = {
    decision_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    agent_id: agentId,
    session_id: sessionId || 'unknown',
    output: {
      action: output.action,
      confidence: Math.min(1, Math.max(0, output.confidence || 0.5)),
      output_summary: output.summary || ''
    },
    input_trace: (inputTrace || []).map(t => ({
      source_type: t.sourceType || 'unknown',
      source_id: t.sourceId || '',
      content_hash: t.contentHash || crypto.createHash('sha256').update(t.sourceId || '').digest('hex'),
      influence_weight: Math.min(1, Math.max(0, t.influenceWeight || 0)),
      decision_path: t.decisionPath || 'unknown'
    })),
    signature: null
  };

  // 签名
  if (agentSecret) {
    const payload = JSON.stringify({ output: trace.output, input_trace: trace.input_trace });
    trace.signature = {
      algorithm: 'hmac-sha256',
      signed_hash: crypto.createHmac('sha256', agentSecret).update(payload).digest('hex')
    };
  }

  return trace;
}

// ============================================================
// 2. 签名验证
// ============================================================

/**
 * 验证决策溯源 JSON 的签名
 * @param {Object} trace - 决策溯源 JSON
 * @param {string} agentSecret - Agent 密钥
 * @returns {boolean}
 */
function verifySignature(trace, agentSecret) {
  if (!trace.signature || !agentSecret) return false;
  if (trace.signature.algorithm !== 'hmac-sha256') return false;

  const payload = JSON.stringify({ output: trace.output, input_trace: trace.input_trace });
  const expected = crypto.createHmac('sha256', agentSecret).update(payload).digest('hex');
  return trace.signature.signed_hash === expected;
}

// ============================================================
// 3. 异常检测引擎
// ============================================================

/**
 * 检测异常模式
 * @param {Object} trace - 当前决策溯源
 * @param {Array}  parentTraces - 父级决策溯源链（可选）
 * @returns {Array} 异常列表 [{ severity, type, message }]
 */
function detectAnomalies(trace, parentTraces = []) {
  const anomalies = [];
  const VALID_SOURCE_TYPES = ['user_message', 'system_rule', 'tool_output', 'agent_peer', 'training_bias'];
  const VALID_DECISION_PATHS = ['triggered', 'not_triggered', 'overridden'];

  // 3.1 依赖缺失检测
  const agentPeerInputs = trace.input_trace.filter(t => t.source_type === 'agent_peer');
  for (const input of agentPeerInputs) {
    const parentExists = parentTraces.some(pt => pt.decision_id === input.source_id);
    if (!parentExists) {
      anomalies.push({
        severity: 'error',
        type: 'missing_dependency',
        message: `决策引用了 Agent 输出 ${input.source_id}，但该输出在溯源链中不可用`
      });
    }
  }

  // 3.2 权重异常检测
  for (const input of trace.input_trace) {
    if (input.influence_weight > 0.9) {
      anomalies.push({
        severity: 'warning',
        type: 'weight_anomaly',
        message: `输入 ${input.source_id} 的影响权重 ${input.influence_weight} 异常偏高`
      });
    }
  }

  // 3.3 规则未触发检测
  const systemRules = trace.input_trace.filter(t => t.source_type === 'system_rule');
  for (const rule of systemRules) {
    if (rule.decision_path === 'not_triggered' && rule.influence_weight > 0.5) {
      anomalies.push({
        severity: 'warning',
        type: 'rule_not_triggered',
        message: `高权重规则 ${rule.source_id} (权重:${rule.influence_weight}) 未触发`
      });
    }
  }

  // 3.4 循环依赖检测
  for (const input of trace.input_trace) {
    if (input.source_type === 'agent_peer') {
      const cycle = parentTraces.some(pt => pt.agent_id === trace.agent_id && pt.decision_id === input.source_id);
      if (cycle) {
        anomalies.push({
          severity: 'error',
          type: 'circular_dependency',
          message: `Agent ${trace.agent_id} 引用了自身的输出 ${input.source_id}，存在循环依赖`
        });
      }
    }
  }

  // 3.5 非法 source_type 检测
  for (const input of trace.input_trace) {
    if (!VALID_SOURCE_TYPES.includes(input.source_type)) {
      anomalies.push({
        severity: 'info',
        type: 'invalid_source_type',
        message: `输入 ${input.source_id} 的 source_type "${input.source_type}" 不在有效枚举值中`
      });
    }
  }

  // 3.6 非法 decision_path 检测
  for (const input of trace.input_trace) {
    if (!VALID_DECISION_PATHS.includes(input.decision_path)) {
      anomalies.push({
        severity: 'info',
        type: 'invalid_decision_path',
        message: `输入 ${input.source_id} 的 decision_path "${input.decision_path}" 不在有效枚举值中`
      });
    }
  }

  return anomalies;
}

// ============================================================
// 4. Pattern 分析引擎（简化版）
// ============================================================

/**
 * 分析跨 session 的归因模式
 * @param {number} limitHours - 分析最近 N 小时的数据
 * @returns {Promise<Array>} 改进建议列表
 */
async function analyzePatterns(limitHours = 24) {
  const client = await pool.connect();
  try {
    // 从审计日志提取最近 N 小时的决策溯源数据
    const result = await client.query(`
      SELECT detail FROM audit_log
      WHERE action = 'decision_trace'
        AND created_at > NOW() - INTERVAL '${limitHours} hours'
      ORDER BY created_at DESC
    `);

    const patterns = [];
    const weightMap = {};  // 统计 source_type + 特定 token 的权重分布

    for (const row of result.rows) {
      const trace = row.detail;
      if (!trace.input_trace) continue;

      for (const input of trace.input_trace) {
        const key = `${input.source_type}:${input.source_id}`;
        if (!weightMap[key]) weightMap[key] = { count: 0, totalWeight: 0, decisionPaths: {} };
        weightMap[key].count++;
        weightMap[key].totalWeight += input.influence_weight;
        if (!weightMap[key].decisionPaths[input.decision_path]) {
          weightMap[key].decisionPaths[input.decision_path] = 0;
        }
        weightMap[key].decisionPaths[input.decision_path]++;
      }
    }

    // 分析异常模式
    for (const [key, stats] of Object.entries(weightMap)) {
      const avgWeight = stats.totalWeight / stats.count;

      // 模式：高权重规则但经常未触发
      if (key.startsWith('system_rule:') && avgWeight > 0.5) {
        const notTriggered = stats.decisionPaths['not_triggered'] || 0;
        const triggerRate = 1 - (notTriggered / stats.count);
        if (triggerRate < 0.5) {
          patterns.push({
            severity: 'warning',
            type: 'underutilized_rule',
            pattern: key,
            sampleCount: stats.count,
            avgWeight: avgWeight.toFixed(2),
            triggerRate: (triggerRate * 100).toFixed(0) + '%',
            suggestion: `规则 ${key.split(':')[1]} 触发率仅 ${(triggerRate * 100).toFixed(0)}%，建议检查规则优先级或适用范围`
          });
        }
      }

      // 模式：特定输入始终高权重
      if (avgWeight > 0.8 && stats.count >= 3) {
        patterns.push({
          severity: 'info',
          type: 'consistently_high_weight',
          pattern: key,
          sampleCount: stats.count,
          avgWeight: avgWeight.toFixed(2),
          suggestion: `输入 ${key} 在 ${stats.count} 次决策中平均权重 ${avgWeight.toFixed(2)}，建议评估是否需要降低其默认影响`
        });
      }
    }

    return patterns.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  } finally {
    client.release();
  }
}

// ============================================================
// 5. API 路由
// ============================================================

/**
 * POST /api/audit/trace — 提交决策溯源
 * Body: { agentId, sessionId, output, inputTrace, agentSecret }
 */
router.post('/trace', async (req, res) => {
  try {
    const { agentId, sessionId, output, inputTrace, agentSecret } = req.body;

    if (!agentId || !output) {
      return res.status(400).json({ error: 'agentId 和 output 为必填' });
    }

    // 生成决策溯源
    const trace = generateTrace({ agentId, sessionId, output, inputTrace, agentSecret });

    // 验证签名
    if (agentSecret) {
      const valid = verifySignature(trace, agentSecret);
      if (!valid) {
        // 签名验证失败，仍记录但标记
        trace.signature_verified = false;
      } else {
        trace.signature_verified = true;
      }
    }

    // 检测异常
    const anomalies = detectAnomalies(trace, req.body.parentTraces || []);

    // 写入审计日志
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO audit_log (agent_id, action, detail, created_at)
         VALUES ($1, 'decision_trace', $2, NOW())`,
        [agentId, JSON.stringify(trace)]
      );
    } finally {
      client.release();
    }

    res.json({
      trace,
      anomalies,
      signature_verified: trace.signature_verified !== false
    });
  } catch (err) {
    console.error('[Audit] trace 提交失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/audit/verify — 验证决策溯源
 * Body: { trace, agentSecret }
 */
router.post('/verify', async (req, res) => {
  try {
    const { trace, agentSecret } = req.body;

    if (!trace) {
      return res.status(400).json({ error: 'trace 为必填' });
    }

    const signatureValid = agentSecret ? verifySignature(trace, agentSecret) : false;
    const anomalies = detectAnomalies(trace, req.body.parentTraces || []);

    res.json({
      decision_id: trace.decision_id,
      signature_valid: signatureValid,
      anomaly_count: anomalies.length,
      anomalies
    });
  } catch (err) {
    console.error('[Audit] verify 失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/audit/patterns — 分析归因模式
 * Body: { limitHours }
 */
router.post('/patterns', async (req, res) => {
  try {
    const limitHours = req.body.limitHours || 24;
    const patterns = await analyzePatterns(limitHours);
    res.json({
      sample_period_hours: limitHours,
      pattern_count: patterns.length,
      patterns
    });
  } catch (err) {
    console.error('[Audit] patterns 分析失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit/traces — 查询决策溯源（按 Agent 筛选）
 * Query: ?agentId=xxx&limit=50
 */
router.get('/traces', async (req, res) => {
  try {
    const { agentId, limit = 50 } = req.query;
    const client = await pool.connect();
    try {
      let query = `
        SELECT id, agent_id, action, detail, created_at
        FROM audit_log
        WHERE action = 'decision_trace'
      `;
      const params = [];
      if (agentId) {
        params.push(agentId);
        query += ` AND agent_id = $${params.length}`;
      }
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit));

      const result = await client.query(query, params);
      res.json({
        total: result.rows.length,
        traces: result.rows.map(r => ({
          id: r.id,
          agent_id: r.agent_id,
          trace: r.detail,
          created_at: r.created_at
        }))
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Audit] traces 查询失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  generateTrace,
  verifySignature,
  detectAnomalies,
  analyzePatterns
};