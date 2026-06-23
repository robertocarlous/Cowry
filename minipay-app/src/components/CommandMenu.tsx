"use client";
import { useEffect } from "react";
import Image from "next/image";

type Action = "cross-chain" | "tx-history";

interface GridItem {
  label:    string;
  desc:     string;
  template?: string;
  action?:  Action;
  iconBg:   string;
  icon:     React.ReactNode;
}

interface ListItem {
  label:    string;
  desc:     string;
  template?: string;
  action?:  Action;
  icon:     React.ReactNode;
}

const GRID_ITEMS: GridItem[] = [
  {
    label: "Buy USDC",
    desc:  "Buy USDC with local currency",
    template: "Buy USDC with ",
    iconBg: "bg-cowry-green shadow-[0_0_18px_4px_rgba(0,212,55,0.45)]",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-black">
        <path d="M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zm0 3v2h16V9H4zm0 5v2h6v-2H4z" />
      </svg>
    ),
  },
  {
    label: "Send Abroad",
    desc:  "Send to a bank account",
    template: "Send $50 to a bank account in ",
    iconBg: "bg-cowry-green/15 border border-cowry-green/30 shadow-[0_0_18px_4px_rgba(0,212,55,0.2)]",
    icon: <Image src="/Vector.png" alt="" width={18} height={18} />,
  },
];

const LIST_ITEMS: ListItem[] = [
  {
    label: "Cross-chain send",
    desc:  "Send to another chain",
    action: "cross-chain",
    icon: <Image src="/Vector%202.png" alt="" width={20} height={20} />,
  },
  {
    label: "My Wallet",
    desc:  "Check your balance",
    template: "What's my balance",
    icon: <Image src="/Vector%201.png" alt="" width={20} height={20} />,
  },
  {
    label: "Transaction History",
    desc:  "View your payment history",
    action: "tx-history",
    icon: <Image src="/Frame%209.png" alt="" width={20} height={20} />,
  },
  {
    label: "Help Support",
    desc:  "See everything Cowry can help you with",
    template: "What can you do",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-[1.5]">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 115 .5c0 1.5-2.5 1.5-2.5 3.5" strokeLinecap="round" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

interface Props {
  onSelect:        (template: string) => void;
  onOpenCrossChain: () => void;
  onOpenTxHistory:  () => void;
  onClose:         () => void;
}

export function CommandMenu({ onSelect, onOpenCrossChain, onOpenTxHistory, onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const run = (item: { template?: string; action?: Action }) => {
    if (item.action === "cross-chain") onOpenCrossChain();
    else if (item.action === "tx-history") onOpenTxHistory();
    else if (item.template) onSelect(item.template);
    onClose();
  };

  return (
    /* Backdrop */
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Sheet */}
      <div
        className="relative bg-cowry-dark border-t border-cowry-border rounded-t-3xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-40 bg-glow-green pointer-events-none" />
        <div className="w-10 h-1 bg-cowry-border rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pb-6 pt-4 space-y-6">

          {/* Grid */}
          <div className="grid grid-cols-2 gap-3">
            {GRID_ITEMS.map((item) => (
              <button
                key={item.label}
                onClick={() => run(item)}
                className="text-left bg-cowry-card border border-cowry-border hover:border-cowry-green/40 rounded-2xl p-4 transition-all shadow-[0_8px_24px_-8px_rgba(0,212,55,0.12)]"
              >
                <span className={`flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${item.iconBg}`}>
                  {item.icon}
                </span>
                <p className="text-sm font-bold text-white">{item.label}</p>
                <p className="text-xs text-cowry-muted mt-0.5 leading-snug">{item.desc}</p>
              </button>
            ))}
          </div>

          {/* List */}
          <div className="space-y-5">
            {LIST_ITEMS.map((item) => (
              <button
                key={item.label}
                onClick={() => run(item)}
                className="w-full flex items-center gap-3 text-left text-cowry-muted hover:text-white transition-colors"
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span>
                  <p className="text-sm font-bold text-white">{item.label}</p>
                  <p className="text-xs text-cowry-muted">{item.desc}</p>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
