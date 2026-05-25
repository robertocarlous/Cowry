import { normalizeUsernameForRegistry } from "./chain/normalizeUsername.js";
const ADDR = (hex)=>hex;
export function createDefaultRegistry() {
    const usernames = new Map([
        [
            "tolu",
            ADDR("0x1111111111111111111111111111111111111111")
        ],
        [
            "ada",
            ADDR("0x2222222222222222222222222222222222222222")
        ],
        [
            "john",
            ADDR("0x3333333333333333333333333333333333333333")
        ]
    ]);
    const groups = new Map([
        [
            "friends",
            [
                "tolu",
                "ada",
                "john"
            ]
        ],
        [
            "family",
            [
                "tolu",
                "ada"
            ]
        ]
    ]);
    return {
        usernames,
        groups
    };
}
function normalizeUser(h) {
    return h.replace(/^@/, "").toLowerCase();
}
function normalizeGroup(name) {
    return name.trim().toLowerCase();
}
export function resolveUsername(ctx, handle) {
    const u = normalizeUser(handle);
    const address = ctx.usernames.get(u);
    if (!address) return {
        ok: false,
        username: u
    };
    return {
        ok: true,
        username: u,
        address
    };
}
export function resolveGroup(ctx, name) {
    const key = normalizeGroup(name);
    const members = ctx.groups.get(key);
    if (!members) return {
        ok: false,
        name: key
    };
    return {
        ok: true,
        name: key,
        members: [
            ...members
        ]
    };
}
export function createGroup(ctx, displayName, memberHandles) {
    const key = normalizeGroup(displayName);
    if (ctx.groups.has(key)) {
        return {
            ok: false,
            reason: `Group "${displayName}" already exists`
        };
    }
    const resolved = [];
    for (const h of memberHandles){
        const r = resolveUsername(ctx, h);
        if (!r.ok) return {
            ok: false,
            reason: `Unknown username @${r.username}`
        };
        resolved.push(r.username);
    }
    ctx.groups.set(key, resolved);
    return {
        ok: true,
        name: key,
        members: resolved
    };
}
export function registerMockUsername(ctx, rawName, wallet) {
    const norm = normalizeUsernameForRegistry(rawName);
    if (!norm.ok) return {
        ok: false,
        reason: norm.reason
    };
    const n = norm.name;
    const taken = ctx.usernames.get(n);
    if (taken && taken.toLowerCase() !== wallet.toLowerCase()) {
        return {
            ok: false,
            reason: `Name @${n} is already linked to another wallet (mock).`
        };
    }
    for (const [uname, addr] of ctx.usernames){
        if (addr.toLowerCase() === wallet.toLowerCase() && uname !== n) {
            return {
                ok: false,
                reason: `This wallet already owns @${uname} in mock (one name per wallet).`
            };
        }
    }
    ctx.usernames.set(n, wallet);
    return {
        ok: true,
        username: n
    };
}
export function isWalletRegisteredMock(ctx, wallet) {
    const w = wallet.toLowerCase();
    for (const addr of ctx.usernames.values()){
        if (addr.toLowerCase() === w) return true;
    }
    return false;
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/resolvers.ts