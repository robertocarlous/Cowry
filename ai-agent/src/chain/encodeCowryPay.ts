import { encodeFunctionData } from "viem";
import { cowrypayContract } from "../abi/index.js";

export type EncodedCall = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: `0x${string}`;
  description: string;
};

export function encodePay(
  token: `0x${string}`,
  to: `0x${string}`,
  amountBaseUnits: bigint,
): EncodedCall {
  const data = encodeFunctionData({
    abi: cowrypayContract.abi,
    functionName: "pay",
    args: [token, to, amountBaseUnits],
  });
  return {
    to: cowrypayContract.address,
    data,
    value: "0x0",
    description: `CowryPay.pay(token → ${to})`,
  };
}

export function encodePayGroupEqual(
  token: `0x${string}`,
  groupId: bigint,
  amountPerMemberBaseUnits: bigint,
): EncodedCall {
  const data = encodeFunctionData({
    abi: cowrypayContract.abi,
    functionName: "payGroupEqual",
    args: [token, groupId, amountPerMemberBaseUnits],
  });
  return {
    to: cowrypayContract.address,
    data,
    value: "0x0",
    description: `CowryPay.payGroupEqual(group ${groupId}, ${amountPerMemberBaseUnits} per member)`,
  };
}

export function encodePayGroupSplit(
  token: `0x${string}`,
  groupId: bigint,
  totalAmountBaseUnits: bigint,
): EncodedCall {
  const data = encodeFunctionData({
    abi: cowrypayContract.abi,
    functionName: "payGroupSplit",
    args: [token, groupId, totalAmountBaseUnits],
  });
  return {
    to: cowrypayContract.address,
    data,
    value: "0x0",
    description: `CowryPay.payGroupSplit(group ${groupId}, total ${totalAmountBaseUnits} base units)`,
  };
}

export function encodedCallToJson(c: EncodedCall): {
  to: string;
  data: string;
  value: string;
  description: string;
} {
  return {
    to: c.to,
    data: c.data,
    value: c.value,
    description: c.description,
  };
}
