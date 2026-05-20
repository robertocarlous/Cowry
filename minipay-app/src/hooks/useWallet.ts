"use client";
import { useState, useEffect, useCallback } from "react";
import {
  isMiniPay,
  getConnectedAddress,
  requestAccounts,
  shortAddress,
} from "@/lib/wallet";
import { resolveUsername, setCachedUsername } from "@/lib/registry";

type RegistrationState = "unknown" | "checking" | "unregistered" | "registered";

export function useWallet() {
  const [address,      setAddress]      = useState<`0x${string}` | null>(null);
  const [username,     setUsername]     = useState<string | null>(null);
  const [regState,     setRegState]     = useState<RegistrationState>("unknown");
  const [inMiniPay,    setInMiniPay]    = useState(false);
  const [loading,      setLoading]      = useState(true);

  const checkRegistration = useCallback(async (addr: `0x${string}`) => {
    setRegState("checking");
    const { registered, username: name } = await resolveUsername(addr);
    setRegState(registered ? "registered" : "unregistered");
    setUsername(name ?? null);
  }, []);

  const connect = useCallback(async () => {
    const addr = await requestAccounts();
    setAddress(addr);
    if (addr) await checkRegistration(addr);
    return addr;
  }, [checkRegistration]);

  useEffect(() => {
    const init = async () => {
      setInMiniPay(isMiniPay());
      const addr = await getConnectedAddress();
      if (addr) {
        setAddress(addr);
        await checkRegistration(addr);
      } else if (isMiniPay()) {
        await connect();
      }
      setLoading(false);
    };
    init();
  }, [connect, checkRegistration]);

  /** Called by RegisterScreen once the on-chain registration is confirmed. */
  const onRegistered = useCallback((name: string) => {
    if (!address) return;
    setCachedUsername(address, name);
    setUsername(name);
    setRegState("registered");
  }, [address]);

  return {
    address,
    username,
    shortAddress:  address ? shortAddress(address) : null,
    inMiniPay,
    loading,
    connect,
    onRegistered,
    isConnected:   !!address,
    isRegistered:  regState === "registered",
    isChecking:    regState === "checking" || regState === "unknown",
  };
}
