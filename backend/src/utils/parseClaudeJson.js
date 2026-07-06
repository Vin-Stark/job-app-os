function parseClaudeJson(text) {
    return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
}

module.exports = { parseClaudeJson };
