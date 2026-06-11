"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  isMiniPay,
  waitForProvider,
  requestAccounts,
  switchToCelo,
  shortAddress,
} from "@/lib/wallet";
import {
  getCachedUsername,
  clearCachedUsername,
  getUsernameFromChain,
  isWalletRegistered,
  setCachedUsername,
} from "@/lib/registry";
import { readErc20Allowance } from "@/lib/erc20";

// CowryPay v2 — spender we check allowance against
const COWRYPAY = "0xf253dde47ca717737be3aefb76326180c2239e04" as `0x${string}`;
const USDM     = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`;
const USDC     = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`;
// Minimum allowance to consider "granted" — $10 worth (USDm 18 dec, USDC 6 dec)
const MIN_USDM_ALLOWANCE = 10n * 10n ** 18n;
const MIN_USDC_ALLOWANCE = 10n * 10n ** 6n;

type AccessState = "unknown" | "checking" | "not_granted" | "granted";

export function useWallet() {
  const [address,      setAddress]      = useState<`0x${string}` | null>(null);
  const [username,     setUsername]     = useState<string | null>(null);
  const [accessState,  setAccessState]  = useState<AccessState>("unknown");
  const [inMiniPay,    setInMiniPay]    = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [wrongChain,   setWrongChain]   = useState(false);
  const [walletError,  setWalletError]  = useState<string | null>(null);

  const hasAttempted = useRef(false);

  /** Check if the user has approved CowryPay to move their tokens. */
  const checkAccess = useCallback(async (addr: `0x${string}`) => {
    setAccessState("checking");
    try {
      const [usdmAllow, usdcAllow] = await Promise.all([
        readErc20Allowance(USDM, addr, COWRYPAY),
        readErc20Allowance(USDC, addr, COWRYPAY),
      ]);
      const granted = usdmAllow >= MIN_USDM_ALLOWANCE || usdcAllow >= MIN_USDC_ALLOWANCE;
      setAccessState(granted ? "granted" : "not_granted");
    } catch {
      // RPC unavailable — default to not_granted so user sees the grant screen
      setAccessState("not_granted");
    }
  }, []);

  /** Fetch @name from chain in background (slow); never blocks the chat gate. */
  const fetchUsernameInBackground = useCallback((addr: `0x${string}`) => {
    void getUsernameFromChain(addr).then((name) => {
      if (name) {
        setCachedUsername(addr, name);
        setUsername(name);
      }
    });
  }, []);

  /** Background lookup of @name for the header display — never blocks the UI. */
  const checkRegistration = useCallback(async (addr: `0x${string}`) => {
    const cached = getCachedUsername(addr);
    if (cached) setUsername(cached);

    try {
      const registered = await isWalletRegistered(addr);
      if (!registered) {
        // Clear any stale localStorage cache from a previous contract deployment
        clearCachedUsername(addr);
        setUsername(null);
        return;
      }
      if (!cached) {
        fetchUsernameInBackground(addr);
      }
    } catch {
      // Best-effort — username is purely cosmetic in the header
    }
  }, [fetchUsernameInBackground]);

  const ensureCelo = useCallback(async () => {
    try {
      await switchToCelo();
      setWrongChain(false);
    } catch {
      setWrongChain(true);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      if (hasAttempted.current) return;
      hasAttempted.current = true;

      try {
        const ready = await waitForProvider(1500);
        if (!ready) {
          setWalletError("Please open this app inside MiniPay.");
          return;
        }

        const miniPay = isMiniPay();
        setInMiniPay(miniPay);

        if (!miniPay) {
          setWalletError("Please open this app inside MiniPay.");
          return;
        }

        const addr = await requestAccounts();
        if (!addr) {
          setWalletError("Connection failed. Unlock MiniPay and try again.");
          return;
        }

        setAddress(addr);
        // Unblock UI — access check drives the gate, registration is just for the header
        setIsConnecting(false);
        void checkAccess(addr);
        void checkRegistration(addr);
      } catch (e) {
        setWalletError(e instanceof Error ? e.message : String(e));
        setIsConnecting(false);
      }
    };

    init();

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
        void checkAccess(next);
        void checkRegistration(next);
      } else {
        setUsername(null);
        setAccessState("unknown");
      }
    };

    provider?.on?.("chainChanged",    handleChainChange);
    provider?.on?.("accountsChanged", handleAccountsChange);

    return () => {
      provider?.removeListener?.("chainChanged",    handleChainChange);
      provider?.removeListener?.("accountsChanged", handleAccountsChange);
    };
  }, [checkAccess, checkRegistration]);

  const onAccessGranted = useCallback(() => {
    setAccessState("granted");
  }, []);

  return {
    address,
    username,
    shortAddress:    address ? shortAddress(address) : null,
    inMiniPay,
    isConnecting,
    walletError,
    onAccessGranted,
    ensureCelo,
    wrongChain,
    isConnected:     !!address,
    hasGrantedAccess: accessState === "granted",
    isCheckingAccess: accessState === "checking",
  };
}
