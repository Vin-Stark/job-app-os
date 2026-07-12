const NoH1BSponsorshipPhrases = [
    "will not provide sponsorship",
    "visa sponsorship not provided",
    "visa sponsorship unavailable",
    "employment sponsorship unavailable",
    "h1b sponsorship not available",
    "h-1b sponsorship not available",
    "h1b transfer not supported",
    "h-1b transfer not supported",
    "unable to sponsor employment visas",
    "unable to sponsor work visas",
    "no employment visa sponsorship",
    "employment visa sponsorship is not available",
    "candidate must not require visa sponsorship",
    "applicants requiring sponsorship will not be considered",
    "candidates requiring sponsorship will not be considered",
    "must be eligible to work without sponsorship",
    "must have authorization to work without sponsorship",
    "must not require employer sponsorship",
    "must not require immigration sponsorship",
    "must not require sponsorship",
    "no current or future sponsorship",
    "will not support visa petitions",
    "future sponsorship not available",
    "sponsorship cannot be provided",
    "we are unable to consider candidates requiring sponsorship",
    "we are not sponsoring work visas",
    "not sponsoring visas",
    "not open to visa sponsorship",
    "requires independent work authorization",
    "must be able to work without employer sponsorship",
    "must be authorized to work on a permanent basis",
    "must be authorized to work in the united states without sponsorship",
    "must have ongoing work authorization",
    "must not require sponsorship now or at any time in the future"
];


const NoOPTCPTSupportPhrases = [
    "opt not eligible",
    "cpt not eligible",
    "opt candidates not eligible",
    "cpt candidates not eligible",
    "f1 students not eligible",
    "f-1 students not eligible",
    "f1 visa not accepted",
    "f-1 visa not accepted",
    "cannot employ f1 students",
    "cannot employ f-1 students",
    "stem opt not eligible",
    "opt sponsorship not available",
    "cpt sponsorship not available",
    "no students on opt",
    "no students on cpt",
    "opt applicants will not be considered",
    "cpt applicants will not be considered",
    "must not require cpt",
    "must not require opt",
    "must not require stem opt",
    "unable to support f1 visa holders",
    "unable to support f-1 visa holders",
    "international students not eligible",
    "international applicants not eligible",
    "no f1 candidates",
    "no f-1 candidates",
    "must have permanent work authorization",
    "must possess unrestricted work authorization",
    "must have unrestricted authorization to work",
    "must be authorized to work permanently in the united states",
    "temporary work authorization not accepted",
    "temporary employment authorization not accepted",
    "candidates with temporary work authorization will not be considered",
    "employment authorization document holders not eligible"
];

const PermanentAuthOnlyPhrases = [
    "must have permanent authorization to work",
    "must possess permanent work authorization",
    "permanent us work authorization required",
    "permanent resident required",
    "green card holder required",
    "lawful permanent resident required",
    "citizenship required",
    "us citizens only",
    "u.s. citizens only",
    "citizen only",
    "green card only",
    "citizens or permanent residents only",
    "must be eligible to work in the us permanently",
    "must be authorized to work in the us on a permanent basis",
    "must be permanently authorized to work",
    "must have unrestricted authorization to work in the us",
    "must have indefinite work authorization",
    "must have unlimited work authorization",
    "security clearance required",
    "ability to obtain security clearance required",
    "must be eligible for a security clearance",
    "position requires us citizenship",
    "position requires u.s. citizenship",
    "citizenship is a condition of employment",
    "federal contractor citizenship requirement",
    "government clearance required",
    "eligible for federal employment",
    "work authorization must not be time limited"
];

const sponsorshipFriendlyPhrases = [

    // Existing
    "visa sponsorship available",
    "visa sponsorship provided",
    "sponsorship available",
    "h1b sponsorship available",
    "h-1b sponsorship available",
    "we sponsor visas",
    "willing to sponsor",
    "open to sponsorship",
    "will consider sponsorship",
    "employment sponsorship available",
    "future sponsorship available",
    "stem opt accepted",
    "opt candidates welcome",
    "cpt candidates welcome",
    "f1 students encouraged to apply",
    "international candidates encouraged to apply",
    "international applicants welcome",
    "we support stem opt",
    "we support opt",
    "we support cpt",

    // Direct sponsorship
    "visa sponsorship offered",
    "visa sponsorship supported",
    "visa sponsorship provided for qualified candidates",
    "employment visa sponsorship available",
    "employment visa sponsorship provided",
    "immigration sponsorship available",
    "immigration sponsorship provided",
    "sponsorship may be available",
    "sponsorship will be considered",
    "sponsorship can be provided",
    "sponsorship opportunities available",

    // H1B
    "h1b sponsorship provided",
    "h-1b sponsorship provided",
    "h1b sponsorship offered",
    "h-1b sponsorship offered",
    "h1b transfers welcome",
    "h-1b transfers welcome",
    "h1b transfer accepted",
    "h-1b transfer accepted",
    "h1b transfer supported",
    "h-1b transfer supported",
    "h1b candidates welcome",
    "h-1b candidates welcome",
    "will sponsor h1b",
    "will sponsor h-1b",
    "supports h1b",
    "supports h-1b",
    "h1b applicants encouraged to apply",
    "h-1b applicants encouraged to apply",

    // OPT
    "opt accepted",
    "opt welcome",
    "opt supported",
    "opt eligible",
    "supports opt candidates",
    "opt students encouraged to apply",
    "opt applicants welcome",
    "f1 opt accepted",

    // STEM OPT
    "stem opt welcome",
    "stem opt supported",
    "stem opt candidates welcome",
    "stem opt applicants encouraged to apply",
    "supports stem opt",
    "stem opt eligible",

    // CPT
    "cpt accepted",
    "cpt welcome",
    "cpt supported",
    "supports cpt candidates",
    "cpt students encouraged to apply",
    "cpt eligible",

    // F1
    "f1 students welcome",
    "f-1 students welcome",
    "f1 candidates welcome",
    "f-1 candidates welcome",
    "f1 applicants encouraged to apply",
    "f-1 applicants encouraged to apply",
    "supports f1 visa holders",
    "supports f-1 visa holders",

    // International candidates
    "international candidates welcome",
    "international applicants welcome",
    "international talent welcome",
    "international students welcome",
    "international graduates welcome",
    "global talent encouraged to apply",
    "foreign nationals welcome",
    "open to international applicants",
    "open to international candidates",
    "all work authorization categories considered",

    // Explicit recruiter language
    "all qualified candidates will be considered regardless of sponsorship needs",
    "sponsorship case by case",
    "sponsorship considered on a case by case basis",
    "visa support available",
    "relocation and visa sponsorship available",
    "work authorization sponsorship available",
    "company sponsored visa available",

    // Green card sponsorship
    "green card sponsorship available",
    "employment based green card sponsorship available",
    "permanent residency sponsorship available",

    // Universities and research organizations
    "eligible for h1b sponsorship",
    "eligible for visa sponsorship",
    "this position may qualify for sponsorship",
    "selected candidate may be sponsored",
    "university sponsorship available",
    "sponsorship subject to approval",

    // Cap exempt employers
    "cap exempt h1b sponsorship available",
    "cap exempt h-1b sponsorship available"
];

 const noH1BSponsorshipRegexes = [

  // Direct sponsorship denial
  /no\s+(visa\s+)?sponsorship/i,
  /visa\s+sponsorship\s+(is\s+)?not\s+available/i,
  /sponsorship\s+(is\s+)?not\s+available/i,
  /will\s+not\s+sponsor/i,
  /unable\s+to\s+sponsor/i,
  /cannot\s+sponsor/i,
  /does\s+not\s+sponsor/i,
  /not\s+sponsoring/i,

  // Future sponsorship denial
  /require.*sponsorship.*future/i,
  /future.*sponsorship/i,
  /must\s+not\s+require\s+sponsorship/i,
  /will\s+not\s+sponsor.*future/i,
  /no\s+current\s+or\s+future\s+sponsorship/i,

  // Work authorization
  /authorized\s+to\s+work.*without.*sponsorship/i,
  /must\s+work.*without.*sponsorship/i,
  /eligible\s+to\s+work.*without.*sponsorship/i,
  /must\s+have.*authorization.*without.*sponsorship/i,
  /independent\s+work\s+authorization/i,

  // H1B specific
  /h[\s-]?1b\s+sponsorship\s+not\s+available/i,
  /h[\s-]?1b\s+sponsorship\s+unavailable/i,
  /h[\s-]?1b\s+not\s+supported/i,
  /h[\s-]?1b\s+transfer\s+not\s+supported/i,
  /not\s+eligible\s+for\s+h[\s-]?1b/i,

  // Immigration sponsorship
  /immigration\s+sponsorship\s+not\s+available/i,
  /employment\s+visa\s+sponsorship\s+not\s+available/i,
  /not\s+eligible\s+for\s+immigration\s+sponsorship/i,
  /unable\s+to\s+provide\s+visa\s+sponsorship/i,

  // Candidate rejection
  /candidates?\s+requiring\s+sponsorship\s+will\s+not\s+be\s+considered/i,
  /applicants?\s+requiring\s+sponsorship\s+will\s+not\s+be\s+considered/i,
  /must\s+not\s+require\s+employer\s+sponsorship/i

];

 const noOPTCPTRegexes = [

  // OPT
  /opt\s+not\s+eligible/i,
  /not\s+support.*opt/i,
  /cannot\s+support.*opt/i,
  /unable\s+to\s+support.*opt/i,
  /opt\s+candidates?\s+will\s+not\s+be\s+considered/i,
  /opt\s+applicants?\s+not\s+accepted/i,
  /no\s+opt\s+candidates/i,

  // STEM OPT
  /stem\s+opt\s+not\s+supported/i,
  /stem\s+opt\s+not\s+eligible/i,
  /cannot\s+support\s+stem\s+opt/i,
  /unable\s+to\s+support\s+stem\s+opt/i,

  // CPT
  /cpt\s+not\s+eligible/i,
  /cannot\s+support.*cpt/i,
  /unable\s+to\s+support.*cpt/i,
  /not\s+accepting.*cpt/i,
  /no\s+cpt\s+candidates/i,

  // F1
  /f[\s-]?1\s+students?\s+not\s+eligible/i,
  /f[\s-]?1\s+visa\s+holders?\s+not\s+eligible/i,
  / f[\s-]?1\s+visa\s+holders?.*not\s+eligible /i,
  / f[\s-]?1\s+visa\s+holders?\s+(are\s+)?not\s+eligible /i,
  /f[\s-]?1\s+visa\s+holders?.*not\s+eligible/i,
  /cannot\s+employ\s+f[\s-]?1/i,
  /does\s+not\s+support\s+f[\s-]?1/i,
  /no\s+f[\s-]?1\s+candidates/i,
  /f[\s-]?1\s+students?.*not\s+eligible/i,
/f[\s-]?1\s+visa\s+holders?.*not\s+eligible/i,
/((unable|cannot|do\s+not|will\s+not).*)support.*cpt/i,

  // International students
  /international\s+students?\s+not\s+eligible/i,
  /international\s+applicants?\s+not\s+eligible/i,

  // Temporary authorization rejection
  /temporary\s+work\s+authorization\s+not\s+accepted/i,
  /temporary\s+employment\s+authorization\s+not\s+accepted/i,
  /candidates?\s+with\s+temporary\s+work\s+authorization\s+will\s+not\s+be\s+considered/i,

  // Combined language
  /no\s+cpt\s+or\s+opt/i,
  /must\s+not\s+require\s+cpt/i,
  /must\s+not\s+require\s+opt/i

];

 const permanentAuthOnlyRegexes = [

  // Permanent authorization
  /permanent\s+work\s+authorization\s+required/i,
  /permanent\s+authorization\s+to\s+work/i,
  /permanent\s+u\.?s\.?\s+work\s+authorization/i,
  /must\s+have\s+permanent\s+authorization/i,
  /must\s+be\s+authorized\s+to\s+work.*permanent/i,

  // Unrestricted
  /unrestricted\s+work\s+authorization/i,
  /indefinite\s+work\s+authorization/i,
  /unlimited\s+work\s+authorization/i,

  // Citizen only
  /u\.?s\.?\s+citizens?\s+only/i,
  /citizens?\s+only/i,
  /u\.?s\.?\s+citizenship\s+required/i,
  /requires?\s+u\.?s\.?\s+citizenship/i,
  /position\s+requires?\s+u\.?s\.?\s+citizenship/i,

  // Green card
  /green\s+card\s+holders?\s+only/i,
  /green\s+card\s+required/i,
  /lawful\s+permanent\s+resident/i,
  /permanent\s+resident\s+required/i,

  // Combined
  /citizens?\s+or\s+permanent\s+residents?\s+only/i,
  /u\.?s\.?\s+citizen\s+or\s+permanent\s+resident/i,
  /only\s+u\.?s\.?\s+citizens?\s+and\s+green\s+card\s+holders/i,

  // Security clearance
  /security\s+clearance\s+required/i,
  /eligible\s+for\s+security\s+clearance/i,
  /ability\s+to\s+obtain.*security\s+clearance/i,
  /government\s+clearance\s+required/i,
  /ability\s+to\s+obtain\s+(a\s+)?(u\.?s\.?\s+)?security\s+clearance/i,
  /ability\s+to\s+obtain.*security\s+clearance/i,

  // Federal contractor language
  /federal\s+contractor/i,
  /citizenship\s+is\s+a\s+condition\s+of\s+employment/i,
  /eligible\s+for\s+federal\s+employment/i,

  // Visa exclusion
  /no\s+work\s+visa\s+holders/i,
  /must\s+not\s+require\s+work\s+visa/i

];

const sponsorshipFriendlyRegexes = [

  // Direct sponsorship
  /visa\s+sponsorship\s+available/i,
  /visa\s+sponsorship\s+provided/i,
  /sponsorship\s+available/i,
  /sponsorship\s+provided/i,
  /willing\s+to\s+sponsor/i,
  /open\s+to\s+sponsorship/i,

  // H1B
  /h[\s-]?1b\s+sponsorship\s+available/i,
  /h[\s-]?1b\s+sponsorship\s+provided/i,
  /h[\s-]?1b\s+transfer\s+accepted/i,
  /h[\s-]?1b\s+transfer\s+supported/i,

  // OPT
  /opt\s+candidates?\s+welcome/i,
  /opt\s+accepted/i,
  /stem\s+opt\s+accepted/i,
  /stem\s+opt\s+welcome/i,
  /stem\s+opt\s+supported/i,

  // CPT
  /cpt\s+accepted/i,
  /cpt\s+welcome/i,


  // F1
  /f[\s-]?1\s+students?\s+welcome/i,
  /f[\s-]?1\s+candidates?\s+welcome/i,
  /support\s+f[\s-]?1/i,

  // International
  /international\s+candidates?\s+welcome/i,
  /international\s+applicants?\s+welcome/i,
  /international\s+students?\s+encouraged\s+to\s+apply/i,

  // Explicit future sponsorship
  /future\s+sponsorship\s+available/i,
  /employment\s+visa\s+sponsorship\s+available/i,
  /immigration\s+sponsorship\s+available/i

];

module.exports = {
    NoH1BSponsorshipPhrases,
    NoOPTCPTSupportPhrases,
    PermanentAuthOnlyPhrases,
    noH1BSponsorshipRegexes,
    noOPTCPTRegexes,
    permanentAuthOnlyRegexes,
    sponsorshipFriendlyPhrases,
    sponsorshipFriendlyRegexes
};