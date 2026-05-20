"use client";
import { useState, useEffect, useCallback } from "react";
import {
  isMiniPay,
  getConnectedAddress,
  requestAccounts,
  shortAddress,
} from "@/lib/wallet";

export function useWallet() {
  const [address,   setAddress]   = useState<`0x${string}` | null>(null);
  const [inMiniPay, setInMiniPay] = useState(false);
  const [loading,   setLoading]   = useState(true);

  const connect = useCallback(async () => {
    const addr = await requestAccounts();
    setAddress(addr);
    return addr;
  }, []);

  useEffect(() => {
    const init = async () => {
      setInMiniPay(isMiniPay());
      // Auto-connect when running inside MiniPay
      const addr = await getConnectedAddress();
      if (addr) {
        setAddress(addr);
      } else if (isMiniPay()) {
        await connect();
      }
      setLoading(false);
    };
    init();
  }, [connect]);

  return {
    address,
    shortAddress: address ? shortAddress(address) : null,
    inMiniPay,
    loading,
    connect,
    isConnected: !!address,
  };
}
