const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 🔒 Locked decision #1 — the ONLY place a Claude model ID may appear.
// Tiered allocation:
//   EXTRACTION — routine structured work: parsing, keyword extraction,
//                classification, eligibility screening, evidence mining.
//   GENERATION — user-facing documents where writing quality is the product:
//                tailored resume, corrective pass, cover letter.
const MODELS = {
    EXTRACTION: 'claude-haiku-4-5-20251001',
    GENERATION: 'claude-sonnet-4-6',
};

// Single wrapper for every Claude call in the backend.
// - `schema` present → structured outputs: the API guarantees the response is
//   valid JSON conforming to the schema, so no fence-stripping / reparse dance.
// - `schema` absent  → plain text, defensively stripped of code fences.
// - Every call logs token usage (spend observability) and fails loudly on
//   truncation instead of letting a cut-off response poison JSON.parse or
//   silently ship half a resume.
async function callClaude({ label, model, maxTokens, prompt, schema }) {
    const params = {
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
    };
    if (schema) {
        params.output_config = { format: { type: 'json_schema', schema } };
    }

    const message = await anthropic.messages.create(params);

    const u = message.usage || {};
    console.log(`[claude] ${label} model=${model} in=${u.input_tokens} out=${u.output_tokens} stop=${message.stop_reason}`);

    if (message.stop_reason === 'max_tokens') {
        const err = new Error(`Claude output hit the ${maxTokens}-token cap (${label})`);
        err.code = 'CLAUDE_TRUNCATED';
        throw err;
    }

    const text = message.content[0].text;
    return schema ? JSON.parse(text) : text.replace(/```[a-z]*\n?|\n?```/g, '').trim();
}

// Errors safe to show the user verbatim (validation-style messages we wrote
// ourselves). Everything else is logged server-side and replaced with a
// generic message — err.message must never reach the client (leaks internals).
class UserFacingError extends Error {}

// One catch-block responder per the backend error rules: full detail
// server-side via console.error, generic message + real HTTP status to the
// client. Never leaks err.message (SQL/paths/internals) except UserFacingError.
function respondError(res, err, route, fallback = 'Something went wrong. Please try again.') {
    console.error(err);
    if (err instanceof UserFacingError) {
        return res.status(422).json({ error: err.message, message: route });
    }
    if (err.code === 'CLAUDE_TRUNCATED') {
        return res.status(502).json({ error: 'The AI response was cut off — try again, or use a shorter resume/job description.', message: route });
    }
    if (err instanceof Anthropic.APIError) {
        if (err.status === 429 || err.status >= 500) {
            return res.status(503).json({ error: 'The AI service is busy right now — please try again in a minute.', message: route });
        }
        return res.status(502).json({ error: 'The AI request failed. Please try again.', message: route });
    }
    return res.status(500).json({ error: fallback, message: route });
}

module.exports = { anthropic, MODELS, callClaude, respondError, UserFacingError };
