export function normalizeUsernameForRegistry(raw) {
    const s = raw.replace(/^@/, "").trim().toLowerCase();
    if (!/^[a-z0-9]{3,32}$/.test(s)) {
        return {
            ok: false,
            reason: "Usernames must be 3–32 characters: lowercase letters and numbers only. Strip @ before resolving."
        };
    }
    return {
        ok: true,
        name: s
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/normalizeUsername.ts