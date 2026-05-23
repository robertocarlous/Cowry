"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  isMiniPay,
  waitForProvider,
  getConnectedAddress,
  getCurrentChainId,
  requestAccounts,
  switchToCelo,
  shortAddress,
} from "@/lib/wallet";
import { resolveUsername, setCachedUsername } from "@/lib/registry";

type RegistrationState = "unknown" | "checking" | "unregistered" | "registered";

export function useWallet() {
  const [address,     setAddress]     = useState<`0x${string}` | null>(null);
  const [username,    setUsername]    = useState<string | null>(null);
  const [regState,    setRegState]    = useState<RegistrationState>("unknown");
  const [inMiniPay,   setInMiniPay]   = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [wrongChain,  setWrongChain]  = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Prevent duplicate auto-connect attempts (MiniPay docs requirement)
  const hasAttempted = useRef(false);

  const checkRegistration = useCallback(async (addr: `0x${string}`) => {
    setRegState("checking");
    const { registered, username: name } = await resolveUsername(addr);
    setRegState(registered ? "registered" : "unregistered");
    setUsername(name ?? null);
  }, []);

  const ensureCelo = useCallback(async () => {
    try {
      await switchToCelo();
      setWrongChain(false);
    } catch {
      setWrongChain(true);
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
      // Single attempt guard (MiniPay docs requirement)
      if (hasAttempted.current) return;
      hasAttempted.current = true;

      try {
        // Wait for window.ethereum to be injected — MiniPay may inject after load
        const ready = await waitForProvider(3000);
        if (!ready) {
          // No wallet found — not inside MiniPay or any Web3 browser
          setLoading(false);
          return;
        }

        const miniPay = isMiniPay();
        setInMiniPay(miniPay);

        if (miniPay) {
          // Inside MiniPay — auto-connect immediately, no prompt shown
          const addr = await requestAccounts();
          if (addr) {
            setAddress(addr);
            await checkRegistration(addr);
          }
        } else {
          // Regular browser wallet — get already-connected accounts silently
          const addr = await getConnectedAddress();
          if (addr) {
            setAddress(addr);
            const chainId = await getCurrentChainId();
            if (chainId !== 42220) {
              try { await switchToCelo(); } catch { setWrongChain(true); }
            }
            await checkRegistration(addr);
          }
        }
      } catch (e) {
        setWalletError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };

    init();

    // ── Event listeners ────────────────────────────────────────────────────
    type Provider = {
      on?:             (event: string, fn: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, fn: (...args: unknown[]) => void) => void;
    };
    const provider = (window as unknown as { ethereum?: Provider }).ethereum;

    const handleChainChange = (hexId: unknown) => {
      const id = parseInt(String(hexId), 16);
      setWrongChain(id !== 42220);
    };

    const handleAccountsChange = (accounts: unknown) => {
      const list = accounts as string[];
      const next = (list[0] ?? null) as `0x${string}` | null;
      setAddress(next);
      if (next) {
        checkRegistration(next);
      } else {
        setUsername(null);
        setRegState("unknown");
      }
    };

    provider?.on?.("chainChanged",    handleChainChange);
    provider?.on?.("accountsChanged", handleAccountsChange);

    return () => {
      provider?.removeListener?.("chainChanged",    handleChainChange);
      provider?.removeListener?.("accountsChanged", handleAccountsChange);
    };
  }, [connect, checkRegistration]);

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
