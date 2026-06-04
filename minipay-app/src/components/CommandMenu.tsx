"use client";
import { useEffect } from "react";

interface Command {
  label:    string;
  template: string;
  desc:     string;
}

interface Category {
  icon:     string;
  title:    string;
  commands: Command[];
}

const CATEGORIES: Category[] = [
  {
    icon: "💸",
    title: "Send Money",
    commands: [
      { label: "Send USDC",               template: "Send 10 USDC to @",              desc: "Send USDC to anyone on Cowry" },
      { label: "Send USDm",               template: "Send 10 USDm to @",              desc: "Send USDm to anyone on Cowry" },
      { label: "Split a bill",            template: "Split 60 USDC among @",          desc: "Divide an amount equally among people" },
      { label: "Pay everyone in a group", template: "Send 20 USDC to everyone in ",   desc: "Same amount to every group member" },
      { label: "Split across a group",    template: "Split 120 USDC across group ",   desc: "Divide a total among all group members" },
    ],
  },
  {
    icon: "👥",
    title: "Groups",
    commands: [
      { label: "Create a group",   template: "Create a group called ",        desc: "Start a new payment group with members" },
      { label: "See my groups",    template: "Show my groups",                desc: "List all your groups and who's in them" },
      { label: "Add someone",      template: "Add @ to my ",                  desc: "Add a new member to an existing group" },
      { label: "Remove someone",   template: "Remove @ from my ",             desc: "Remove a member from a group" },
    ],
  },
  {
    icon: "💰",
    title: "My Wallet",
    commands: [
      { label: "Check my balance",  template: "What's my balance",            desc: "See how much USDC and USDm you have" },
      { label: "Recent payments",   template: "Show my recent transactions",  desc: "View your payment history" },
      { label: "Claim a username",  template: "Register as ",                 desc: "Claim your unique @username on Cowry" },
    ],
  },
  {
    icon: "↗️",
    title: "Send from another chain",
    commands: [
      { label: "Bridge to Celo",    template: "",                             desc: "Send USDC from Ethereum, Base, Arbitrum and more" },
    ],
  },
  {
    icon: "❓",
    title: "Help",
    commands: [
      { label: "What can Cowry do?", template: "What can you do",             desc: "See everything Cowry can help you with" },
    ],
  },
];

interface Props {
  onSelect: (template: string) => void;
  onClose:  () => void;
}

export function CommandMenu({ onSelect, onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Sheet */}
      <div
        className="bg-cowry-dark border-t border-cowry-border rounded-t-3xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle + title */}
        <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-cowry-border">
          <div className="w-10 h-1 bg-cowry-border rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Commands</h2>
            <button
              onClick={onClose}
              className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors"
            >
              Close ✕
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pb-6 pt-2 space-y-5">
          {CATEGORIES.map((cat) => (
            <div key={cat.title}>
              {/* Category header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{cat.icon}</span>
                <span className="text-xs font-semibold text-cowry-blue uppercase tracking-widest">
                  {cat.title}
                </span>
              </div>

              {/* Commands */}
              <div className="space-y-1.5">
                {cat.commands.map((cmd) => (
                  <button
                    key={cmd.label}
                    onClick={() => { onSelect(cmd.template); onClose(); }}
                    disabled={!cmd.template}
                    className="w-full flex items-center justify-between gap-3 bg-cowry-card hover:bg-cowry-card/70 border border-cowry-border hover:border-cowry-blue/30 rounded-xl px-4 py-3 text-left transition-all group disabled:opacity-40 disabled:cursor-default"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-cowry-blue transition-colors">
                        {cmd.label}
                      </p>
                      <p className="text-xs text-cowry-muted mt-0.5 truncate">{cmd.desc}</p>
                    </div>
                    {cmd.template && (
                      <span className="text-cowry-border group-hover:text-cowry-blue transition-colors flex-shrink-0 text-xs">
                        →
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
