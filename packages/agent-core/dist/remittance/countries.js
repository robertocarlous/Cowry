const COUNTRIES = {
    nigeria: {
        countryCode: "NG",
        currencyCode: "NGN",
        name: "Nigeria"
    },
    ng: {
        countryCode: "NG",
        currencyCode: "NGN",
        name: "Nigeria"
    },
    naira: {
        countryCode: "NG",
        currencyCode: "NGN",
        name: "Nigeria"
    },
    kenya: {
        countryCode: "KE",
        currencyCode: "KES",
        name: "Kenya"
    },
    ke: {
        countryCode: "KE",
        currencyCode: "KES",
        name: "Kenya"
    },
    shilling: {
        countryCode: "KE",
        currencyCode: "KES",
        name: "Kenya"
    },
    uganda: {
        countryCode: "UG",
        currencyCode: "UGX",
        name: "Uganda"
    },
    ug: {
        countryCode: "UG",
        currencyCode: "UGX",
        name: "Uganda"
    },
    tanzania: {
        countryCode: "TZ",
        currencyCode: "TZS",
        name: "Tanzania"
    },
    tz: {
        countryCode: "TZ",
        currencyCode: "TZS",
        name: "Tanzania"
    },
    malawi: {
        countryCode: "MW",
        currencyCode: "MWK",
        name: "Malawi"
    },
    mw: {
        countryCode: "MW",
        currencyCode: "MWK",
        name: "Malawi"
    }
};
export const SUPPORTED_COUNTRIES = [
    "Nigeria",
    "Kenya",
    "Uganda",
    "Tanzania",
    "Malawi"
];
const CURRENCY_SYMBOLS = {
    NGN: "₦",
    KES: "KSh",
    UGX: "USh",
    TZS: "TSh",
    MWK: "MK"
};
export function getCurrencySymbol(currencyCode) {
    return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] ?? `${currencyCode} `;
}
export function resolveCountry(text) {
    if (!text) return null;
    const key = text.trim().toLowerCase();
    if (COUNTRIES[key]) return COUNTRIES[key];
    const byCurrency = Object.values(COUNTRIES).find((c)=>c.currencyCode.toLowerCase() === key);
    if (byCurrency) return byCurrency;
    const byName = Object.values(COUNTRIES).find((c)=>c.name.toLowerCase().includes(key) || key.includes(c.name.toLowerCase()));
    return byName ?? null;
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/remittance/countries.ts