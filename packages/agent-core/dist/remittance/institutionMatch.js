const SUBSTRING_FILLER = [
    "microfinance",
    "financial",
    "finance",
    "nigeria",
    "limited",
    "bank",
    "mfb",
    "plc",
    "nig",
    "ltd"
];
const ACRONYM_STOPWORDS = new Set([
    "of",
    "for",
    "the",
    "and",
    "plc",
    "limited",
    "ltd",
    "nigeria",
    "nig",
    "microfinance",
    "mfb"
]);
const ALIASES = {
    momo: [
        "mobile",
        "money"
    ],
    mobilemoney: [
        "mobile",
        "money"
    ],
    mtn: [
        "mtn"
    ],
    mtnmomo: [
        "mtn"
    ],
    mtnmobilemoney: [
        "mtn"
    ],
    vodafone: [
        "vodafone"
    ],
    voda: [
        "vodafone"
    ],
    vodacash: [
        "vodafone"
    ],
    telecel: [
        "telecel"
    ],
    telecelcash: [
        "telecel"
    ],
    airteltigo: [
        "airtel",
        "tigo"
    ],
    airtel: [
        "airtel"
    ],
    tigo: [
        "tigo"
    ],
    mpesa: [
        "mpesa"
    ],
    "m-pesa": [
        "mpesa"
    ],
    orange: [
        "orange"
    ],
    orangemoney: [
        "orange"
    ],
    moov: [
        "moov"
    ],
    moovmoney: [
        "moov"
    ]
};
function rawNormalize(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function normalizeForSubstring(name) {
    let out = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const w of [
        ...SUBSTRING_FILLER
    ].sort((a, b)=>b.length - a.length)){
        out = out.split(w).join("");
    }
    return out;
}
function acronymFor(name) {
    return name.split(/[^a-zA-Z0-9]+/).filter(Boolean).filter((w)=>w.toLowerCase() === "bank" || !ACRONYM_STOPWORDS.has(w.toLowerCase())).map((w)=>w[0].toUpperCase()).join("");
}
function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({
        length: b.length + 1
    }, (_, j)=>j);
    for(let i = 1; i <= a.length; i++){
        const row = [
            i
        ];
        for(let j = 1; j <= b.length; j++){
            row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], row[j - 1]);
        }
        prev = row;
    }
    return prev[b.length];
}
export function findInstitutionMatches(query, institutions) {
    const aliasKey = rawNormalize(query);
    const aliasKeywords = ALIASES[aliasKey];
    if (aliasKeywords) {
        const aliasMatches = institutions.filter((inst)=>{
            const rawName = rawNormalize(inst.name);
            return aliasKeywords.every((kw)=>rawName.includes(kw));
        });
        if (aliasMatches.length > 0) return aliasMatches;
    }
    const qSub = normalizeForSubstring(query);
    if (!qSub) return [];
    if (qSub.length >= 3) {
        const substringMatches = institutions.filter((inst)=>{
            const iSub = normalizeForSubstring(inst.name);
            return iSub.length >= 3 && (iSub.includes(qSub) || qSub.includes(iSub));
        });
        if (substringMatches.length > 0) return substringMatches;
    }
    if (qSub.length >= 2) {
        const exactAcronym = institutions.filter((inst)=>acronymFor(inst.name).toLowerCase() === qSub);
        if (exactAcronym.length > 0) return exactAcronym;
        const prefixAcronym = institutions.filter((inst)=>{
            const iAcr = acronymFor(inst.name).toLowerCase();
            return iAcr.length >= 2 && (iAcr.startsWith(qSub) || qSub.startsWith(iAcr));
        });
        if (prefixAcronym.length > 0) return prefixAcronym;
    }
    if (qSub.length >= 4) {
        const scored = institutions.map((inst)=>{
            const iSub = normalizeForSubstring(inst.name);
            const dist = levenshtein(qSub, iSub);
            const maxLen = Math.max(qSub.length, iSub.length);
            return {
                inst,
                dist,
                maxLen
            };
        }).filter(({ dist, maxLen })=>dist <= Math.max(1, Math.floor(maxLen * 0.3)));
        if (scored.length > 0) {
            const bestDist = Math.min(...scored.map((s)=>s.dist));
            return scored.filter((s)=>s.dist === bestDist).map((s)=>s.inst);
        }
    }
    return [];
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/remittance/institutionMatch.ts