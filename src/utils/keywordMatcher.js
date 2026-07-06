// Deterministic ATS keyword matching — the scoring source of truth.
//
// Methodology ported from HackerRank's hiring-agent (see
// docs/ai-screening-learnings.md): the LLM is only allowed to EXTRACT
// structured data (the keyword list from a JD, done once and stored on
// job_descriptions.extracted_keywords). All matching and all arithmetic
// happen here in plain code, so the score is strict, reproducible, and
// honest. Claude must never be asked to produce a score number — when it
// was, it reported 82% on a resume a real ATS checker scored at 40%.

const CATEGORY_WEIGHTS = { must_have: 2.0, preferred: 1.0, domain: 0.5 };
const CATEGORY_RANK = { must_have: 3, preferred: 2, domain: 1 };

// Bidirectional synonym groups: if a keyword (or any of its extracted
// aliases) normalizes to a member of a group, every member counts as a hit.
const SYNONYM_GROUPS = [
    ['javascript', 'js'],
    ['typescript', 'ts'],
    ['node.js', 'nodejs', 'node js', 'node'],
    ['react', 'react.js', 'reactjs'],
    ['react native', 'react-native'],
    ['vue', 'vue.js', 'vuejs'],
    ['angular', 'angular.js', 'angularjs'],
    ['express', 'express.js', 'expressjs'],
    ['next.js', 'nextjs', 'next js'],
    ['kubernetes', 'k8s'],
    ['amazon web services', 'aws'],
    ['google cloud platform', 'gcp', 'google cloud'],
    ['microsoft azure', 'azure'],
    ['postgresql', 'postgres'],
    ['mongodb', 'mongo'],
    ['mysql', 'my sql'],
    ['machine learning', 'ml'],
    ['artificial intelligence', 'ai'],
    ['natural language processing', 'nlp'],
    ['large language models', 'llms', 'llm'],
    ['ci/cd', 'ci-cd', 'ci cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
    ['rest api', 'rest apis', 'restful api', 'restful apis', 'restful', 'rest'],
    ['graphql', 'graph ql'],
    ['user experience', 'ux'],
    ['user interface', 'ui'],
    ['version control', 'git'],
    ['github actions', 'gh actions'],
    ['unit testing', 'unit tests', 'unit test'],
    ['test-driven development', 'tdd', 'test driven development'],
    ['object-oriented programming', 'oop', 'object oriented programming'],
    ['data structures and algorithms', 'dsa', 'data structures & algorithms'],
    ['microservices', 'micro-services', 'microservice architecture'],
    ['c++', 'cpp'],
    ['c#', 'csharp', 'c sharp'],
    ['.net', 'dotnet', 'dot net'],
    ['golang', 'go'],
    ['tailwind css', 'tailwindcss', 'tailwind'],
    ['sass', 'scss'],
    ['html5', 'html'],
    ['css3', 'css'],
    ['structured query language', 'sql'],
];

function normalize(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Boundary = not adjacent to another alphanumeric. Handles terms with
// symbols ("C++", ".NET", "CI/CD") that break \b word boundaries.
function termRegex(alias) {
    return new RegExp('(?<![a-z0-9])' + escapeRegex(alias) + '(?![a-z0-9])');
}

function aliasSetFor(term, aliases) {
    const set = new Set([normalize(term), ...(aliases || []).map(normalize)]);
    for (const group of SYNONYM_GROUPS) {
        if (group.some(g => set.has(g))) {
            group.forEach(g => set.add(g));
        }
    }
    set.delete('');
    return [...set];
}

// Raw extraction output -> clean, deduped keyword list with expanded aliases.
// If the same term appears twice, the stronger category wins.
function dedupeKeywords(rawKeywords) {
    const byTerm = new Map();
    for (const kw of (rawKeywords || [])) {
        if (!kw || !kw.term) continue;
        const norm = normalize(kw.term);
        if (!norm) continue;
        const category = CATEGORY_WEIGHTS[kw.category] !== undefined ? kw.category : 'domain';
        const existing = byTerm.get(norm);
        if (!existing || CATEGORY_RANK[category] > CATEGORY_RANK[existing.category]) {
            byTerm.set(norm, {
                term: String(kw.term).trim(),
                category,
                aliases: aliasSetFor(kw.term, kw.aliases),
            });
        }
    }
    return [...byTerm.values()].slice(0, 100);
}

// keywords: output of dedupeKeywords. sources: [{ name, text }].
// A keyword matches if ANY alias appears in ANY source (strict — exact or
// known-synonym only; no fuzzy "related concept" credit).
function matchKeywords(keywords, sources) {
    const prepared = (sources || [])
        .filter(s => s && s.text)
        .map(s => ({ name: s.name, text: normalize(s.text) }));

    const matched = [];
    const missing = [];
    let matchedWeight = 0;
    let totalWeight = 0;

    for (const kw of keywords) {
        const weight = CATEGORY_WEIGHTS[kw.category];
        totalWeight += weight;

        let hit = null;
        outer:
        for (const alias of kw.aliases) {
            const re = termRegex(alias);
            for (const src of prepared) {
                if (re.test(src.text)) {
                    hit = { matched_via: alias, found_in: src.name };
                    break outer;
                }
            }
        }

        if (hit) {
            matchedWeight += weight;
            matched.push({ term: kw.term, category: kw.category, ...hit });
        } else {
            missing.push({ term: kw.term, category: kw.category });
        }
    }

    const score = totalWeight === 0 ? 0 : Math.round((matchedWeight / totalWeight) * 100);
    return {
        score,
        matched_count: matched.length,
        total_count: keywords.length,
        matched,
        missing,
    };
}

// Curated common-tech vocabulary for the ZERO-COST skills floor: which of
// these appear in a JD can be detected with pure regex (no LLM), and the same
// matcher then scores them against the resume. Aliases come from
// SYNONYM_GROUPS via aliasSetFor, so "k8s" in a JD still counts as Kubernetes.
const TECH_TERMS = [
    // Languages
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby',
    'PHP', 'Swift', 'Kotlin', 'Scala', 'R', 'Perl', 'Objective-C', 'Dart', 'Elixir', 'SQL',
    // Frontend
    'React', 'Angular', 'Vue', 'Next.js', 'Svelte', 'jQuery', 'Redux', 'Tailwind CSS',
    'HTML5', 'CSS3', 'Sass', 'Webpack', 'Vite', 'React Native', 'Flutter',
    // Backend / frameworks
    'Node.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring', 'Spring Boot',
    '.NET', 'ASP.NET', 'Rails', 'Laravel', 'GraphQL', 'REST APIs', 'gRPC', 'WebSockets',
    // Data stores
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Cassandra', 'DynamoDB',
    'SQLite', 'Oracle', 'SQL Server', 'Snowflake', 'BigQuery', 'Kafka', 'RabbitMQ',
    // Cloud / infra
    'AWS', 'Google Cloud Platform', 'Microsoft Azure', 'Kubernetes', 'Docker',
    'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions', 'CI/CD', 'Linux', 'Nginx',
    'Serverless', 'Lambda', 'S3', 'EC2', 'CloudFormation', 'Helm',
    // Data / ML
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'scikit-learn',
    'Pandas', 'NumPy', 'Spark', 'Hadoop', 'Airflow', 'dbt', 'Tableau', 'Power BI',
    'Natural Language Processing', 'Computer Vision', 'Large Language Models',
    // Practices / tools
    'Git', 'Agile', 'Scrum', 'Microservices', 'Unit Testing', 'Test-Driven Development',
    'Jest', 'Cypress', 'Selenium', 'Jira', 'Object-Oriented Programming',
    'Data Structures and Algorithms', 'Distributed Systems', 'System Design',
    // Mobile / other
    'iOS', 'Android', 'Salesforce', 'SAP', 'Shopify', 'WordPress', 'Figma', 'Unity', 'Blockchain',
];

// Which curated tech terms appear in the given text (regex-only, no LLM).
// Returns raw keyword objects ready for dedupeKeywords/matchKeywords.
function detectTechTerms(text) {
    const haystack = normalize(text);
    const found = [];
    for (const term of TECH_TERMS) {
        const aliases = aliasSetFor(term, []);
        if (aliases.some(a => termRegex(a).test(haystack))) {
            found.push({ term, category: 'must_have', aliases: [] });
        }
    }
    return found;
}

module.exports = { CATEGORY_WEIGHTS, dedupeKeywords, matchKeywords, normalize, TECH_TERMS, detectTechTerms };
