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
import { useRef } from "react";
import { resolveUsername, setCachedUsername } from "@/lib/registry";

type RegistrationState = "unknown" | "checking" | "unregistered" | "registered";

export function useWallet() {
  const [address,      setAddress]      = useState<`0x${string}` | null>(null);
  const [username,     setUsername]     = useState<string | null>(null);
  const [regState,     setRegState]     = useState<RegistrationState>("unknown");
  const [inMiniPay,    setInMiniPay]    = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [wrongChain,   setWrongChain]   = useState(false);
  const [walletError,  setWalletError]  = useState<string | null>(null);

  // Prevent duplicate auto-connect attempts (MiniPay docs requirement)
  const hasAttempted = useRef(false);

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
      // Guard: only attempt auto-connect once (MiniPay docs requirement)
      if (hasAttempted.current) return;
      hasAttempted.current = true;

      const miniPay = isMiniPay();
      setInMiniPay(miniPay);

      try {
        const addr = await getConnectedAddress();
        if (addr) {
          setAddress(addr);
          const chainId = await getCurrentChainId();
          if (chainId !== 42220 && !miniPay) {
            try { await switchToCelo(); } catch { setWrongChain(true); }
          }
          await checkRegistration(addr);
        } else if (miniPay) {
          // Inside MiniPay — auto-connect is required, no user prompt
          await connect();
        }
      } catch (e) {
        setWalletError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    init();

    // Typed provider reference for event listeners
    type Provider = {
      on?:          (event: string, fn: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, fn: (...args: unknown[]) => void) => void;
    };
    const provider = (window as unknown as { ethereum?: Provider }).ethereum;

    // chainChanged — update wrongChain flag and re-check chain
    const handleChainChange = (hexId: unknown) => {
      const id = parseInt(String(hexId), 16);
      setWrongChain(id !== 42220);
    };

    // accountsChanged — fired by MiniPay when the active account switches
    const handleAccountsChange = (accounts: unknown) => {
      const list = accounts as string[];
      const next = (list[0] ?? null) as `0x${string}` | null;
      setAddress(next);
      if (next) {
        checkRegistration(next);
      } else {
        // Disconnected
        setUsername(null);
        setRegState("unknown");
      }
    };

    provider?.on?.("chainChanged",    handleChainChange);
    provider?.on?.("accountsChanged", handleAccountsChange);

    // Cleanup — prevent memory leaks on unmount
    return () => {
      provider?.removeListener?.("chainChanged",    handleChainChange);
      provider?.removeListener?.("accountsChanged", handleAccountsChange);
    };
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
    walletError,
    connect,
    onRegistered,
    ensureCelo,
    wrongChain,
    isConnected:   !!address,
    isRegistered:  regState === "registered",
    isChecking:    regState === "checking" || regState === "unknown",
  };
}
