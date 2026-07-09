// Maps a holistic match_score (0–100) to an interview-chances band and a
// plain-English recommendation. Pure lookup — recommendations are never
// LLM-generated. Boundaries are lower-bound inclusive: 90 falls in "90–95",
// 95 in "95–100", 100 in "95–100".
const BANDS = [
    { min: 95, band: '95–100', interview_chances: 'Excellent, but not guaranteed', advice: 'Often over-optimized; ensure it still reads naturally.' },
    { min: 90, band: '90–95', interview_chances: 'Very high', advice: 'Strong target for competitive roles.' },
    { min: 85, band: '85–90', interview_chances: 'High', advice: 'Ideal balance for most software engineering jobs.' },
    { min: 80, band: '80–85', interview_chances: 'Good', advice: 'Usually enough if your experience is relevant.' },
    { min: 70, band: '70–80', interview_chances: 'Moderate', advice: 'Worth applying, especially if you meet the core requirements.' },
    { min: 60, band: '60–70', interview_chances: 'Low to moderate', advice: 'Better suited if you have unique strengths or a referral.' },
    { min: 0, band: 'below 60', interview_chances: 'Low', advice: 'Tailor your resume before applying.' },
];

function recommendationFor(score) {
    const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    const hit = BANDS.find(b => s >= b.min);
    return { band: hit.band, interview_chances: hit.interview_chances, advice: hit.advice };
}

module.exports = { recommendationFor };
