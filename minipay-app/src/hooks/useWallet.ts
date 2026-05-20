"use client";
import { useState, useEffect, useCallback } from "react";
import {
  isMiniPay,
  getConnectedAddress,
  getCurrentChainId,
  requestAccounts,
  switchToCelo,
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
  const [wrongChain,   setWrongChain]   = useState(false);

  const checkRegistration = useCallback(async (addr: `0x${string}`) => {
    setRegState("checking");
    const { registered, username: name } = await resolveUsername(addr);
    setRegState(registered ? "registered" : "unregistered");
    setUsername(name ?? null);
  }, []);

  /** Switch to Celo and update wrongChain state. */
  const ensureCelo = useCallback(async () => {
    try {
      await switchToCelo();
      setWrongChain(false);
    } catch {
      // User rejected the switch — flag it
      const chainId = await getCurrentChainId();
      setWrongChain(chainId !== 42220);
    }
  }, []);

  const connect = useCallback(async () => {
    const addr = await requestAccounts();
    setAddress(addr);
    if (addr) {
      await ensureCelo();
      await checkRegistration(addr);
    }
    return addr;
  }, [checkRegistration, ensureCelo]);

  useEffect(() => {
    const init = async () => {
      setInMiniPay(isMiniPay());
      const addr = await getConnectedAddress();
      if (addr) {
        setAddress(addr);
        // Check chain first — auto-switch silently on page load
        const chainId = await getCurrentChainId();
        if (chainId !== 42220 && !isMiniPay()) {
          try { await switchToCelo(); } catch { setWrongChain(true); }
        }
        await checkRegistration(addr);
      } else if (isMiniPay()) {
        await connect();
      }
      setLoading(false);
    };
    init();

    // React to chain changes from the user manually switching in wallet
    const provider = (window as unknown as { ethereum?: { on?: (e: string, fn: (id: string) => void) => void } }).ethereum;
    const handleChainChange = (hexId: string) => {
      const id = parseInt(hexId, 16);
      setWrongChain(id !== 42220);
    };
    provider?.on?.("chainChanged", handleChainChange);
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
    ensureCelo,
    wrongChain,
    isConnected:   !!address,
    isRegistered:  regState === "registered",
    isChecking:    regState === "checking" || regState === "unknown",
  };
}
