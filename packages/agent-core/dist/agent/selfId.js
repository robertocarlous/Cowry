export const SELF_AGENT_REGISTRY = "0xaC3DF9ABf80d0F5c020C06B04Cced27763355944";
export const SELF_HUMAN_PROOF_PROVIDER = "0x4b036aFD959B457A208F676cf44Ea3ef73Ea3E3d";
const REGISTRY_ABI = [
    {
        name: "isVerifiedAgent",
        type: "function",
        stateMutability: "view",
        inputs: [
            {
                name: "agentKey",
                type: "bytes32"
            }
        ],
        outputs: [
            {
                name: "",
                type: "bool"
            }
        ]
    },
    {
        name: "getAgentId",
        type: "function",
        stateMutability: "view",
        inputs: [
            {
                name: "agentKey",
                type: "bytes32"
            }
        ],
        outputs: [
            {
                name: "",
                type: "uint256"
            }
        ]
    }
];
function addressToAgentKey(address) {
    return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}
export async function isAgentVerified(client, agentAddress) {
    const agentKey = addressToAgentKey(agentAddress);
    return client.readContract({
        address: SELF_AGENT_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "isVerifiedAgent",
        args: [
            agentKey
        ]
    });
}
export async function getAgentNftId(client, agentAddress) {
    const agentKey = addressToAgentKey(agentAddress);
    try {
        const id = await client.readContract({
            address: SELF_AGENT_REGISTRY,
            abi: REGISTRY_ABI,
            functionName: "getAgentId",
            args: [
                agentKey
            ]
        });
        return id > 0n ? id : null;
    } catch  {
        return null;
    }
}
export async function getAgentIdStatus(client, agentAddress) {
    const [verified, nftId] = await Promise.all([
        isAgentVerified(client, agentAddress),
        getAgentNftId(client, agentAddress)
    ]);
    if (verified && nftId !== null) {
        return {
            registered: true,
            agentId: nftId,
            agentAddress
        };
    }
    return {
        registered: false,
        agentAddress,
        hint: "Run `npm run register:agent` to register this agent with Self Agent ID (ERC-8004). Requires a one-time passport scan via the Self app."
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/agent/selfId.ts