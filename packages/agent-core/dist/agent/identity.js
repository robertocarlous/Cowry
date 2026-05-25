import { getAgentWallet } from "./wallet.js";
import { getAgentIdStatus } from "./selfId.js";
export function getAgentAddressOrNull() {
    try {
        return getAgentWallet().address;
    } catch  {
        return null;
    }
}
export async function getAgentIdentity(client) {
    const address = getAgentAddressOrNull();
    if (!address) return null;
    if (!client) {
        return {
            address
        };
    }
    try {
        const status = await getAgentIdStatus(client, address);
        if (status.registered) {
            return {
                address,
                erc8004: {
                    registered: true,
                    agentId: status.agentId.toString()
                }
            };
        }
        return {
            address,
            erc8004: {
                registered: false,
                hint: status.hint
            }
        };
    } catch  {
        return {
            address
        };
    }
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/agent/identity.ts