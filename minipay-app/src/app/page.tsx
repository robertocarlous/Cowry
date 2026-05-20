import Image from "next/image";
import Link from "next/link";

const FEATURES = [
  {
    icon: "💬",
    title: "Talk to Pay",
    desc: "Just type what you want — "Send 20 USDm to @ada". No forms, no addresses, no complexity.",
  },
  {
    icon: "👥",
    title: "Group Payments",
    desc: "Create named groups, split bills, or pay every member at once in a single transaction.",
  },
  {
    icon: "🌉",
    title: "Cross-Chain",
    desc: "Send from Ethereum, Base, Arbitrum, or any major chain. Recipients get USDm or USDC on Celo.",
  },
  {
    icon: "🤖",
    title: "AI-Powered",
    desc: "An onchain AI agent — registered with Self Agent ID (ERC-8004) — parses your intent and executes.",
  },
  {
    icon: "🔐",
    title: "Always Confirm",
    desc: "No transaction ever executes without your explicit approval. You stay in control at every step.",
  },
  {
    icon: "⚡",
    title: "Built on Celo",
    desc: "Sub-cent fees, instant finality, and native MiniPay support — built for everyday payments.",
  },
];

const STEPS = [
  { step: "01", title: "Open Cowry in MiniPay", desc: "No signup. Your MiniPay wallet connects automatically." },
  { step: "02", title: "Register your @username", desc: "Claim a unique name that maps to your wallet on-chain — forever." },
  { step: "03", title: "Type what you want", desc: "\"Send $5 USDm to @tolu\" or \"Split $30 among Friends group\"." },
  { step: "04", title: "Tap Confirm", desc: "Review the preview, tap Confirm. Cowry handles the rest." },
];

const CHAINS = ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon", "BNB Chain", "Avalanche", "Celo"];

export default function LandingPage() {
  return (
    <div className="min-h-full bg-cowry-dark text-white overflow-x-hidden">

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-cowry-dark/80 backdrop-blur-md border-b border-cowry-border">
        <div className="flex items-center gap-2.5">
          <Image src="/cowry.png" alt="Cowry" width={36} height={36} className="rounded-lg" />
          <span className="font-bold text-lg tracking-tight text-white">Cowry</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="#features"
            className="hidden sm:block text-sm text-cowry-muted hover:text-white transition-colors"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="hidden sm:block text-sm text-cowry-muted hover:text-white transition-colors"
          >
            How it works
          </a>
          <Link
            href="/app"
            className="text-sm font-semibold bg-cowry-blue text-cowry-darker px-4 py-2 rounded-full hover:bg-cowry-mint transition-colors"
          >
            Open App →
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 text-center overflow-hidden">
        {/* Background glows */}
        <div className="absolute inset-0 bg-glow-blue pointer-events-none" />
        <div className="absolute inset-0 bg-glow-purple pointer-events-none" />
        {/* Floating logo */}
        <div className="relative flex justify-center mb-8 animate-float">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-2xl bg-cowry-blue/20 scale-150" />
            <Image
              src="/cowry.png"
              alt="Cowry"
              width={120}
              height={120}
              className="relative rounded-2xl shadow-2xl"
            />
          </div>
        </div>

        <p className="text-cowry-blue text-sm font-semibold tracking-widest uppercase mb-4">
          Talk. Send. Automate.
        </p>
        <h1 className="text-4xl sm:text-6xl font-black leading-tight mb-6 glow-text">
          Send money as easily
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cowry-blue to-cowry-mint">
            as sending a message
          </span>
        </h1>
        <p className="max-w-xl mx-auto text-cowry-muted text-base sm:text-lg leading-relaxed mb-10">
          Cowry is an AI-powered crypto payment app built on Celo. Just type what
          you want to do — the AI understands, confirms, and executes.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/app"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-cowry-blue text-cowry-darker font-bold px-8 py-3.5 rounded-full text-sm hover:bg-cowry-mint transition-colors animate-glow"
          >
            <span>Open in MiniPay</span>
            <span>→</span>
          </Link>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-cowry-border text-white font-medium px-8 py-3.5 rounded-full text-sm hover:border-cowry-blue/60 transition-colors"
          >
            See how it works
          </a>
        </div>

        {/* Demo command preview */}
        <div className="mt-14 max-w-sm mx-auto">
          <div className="bg-cowry-card border border-cowry-border rounded-2xl p-4 text-left space-y-3">
            {[
              { user: true,  text: "Send 20 USDm to @ada" },
              { user: false, text: "💳 Payment Preview\n• @ada: 20 USDm\nTotal: 20 USDm\n\nConfirm or Cancel?" },
              { user: true,  text: "Confirm" },
              { user: false, text: "✅ Done! 20 USDm sent to @ada." },
            ].map((msg, i) => (
              <div key={i} className={`flex ${msg.user ? "justify-end" : "justify-start"}`}>
                <div
                  className={`px-3 py-2 rounded-xl text-xs max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                    msg.user
                      ? "bg-cowry-blue text-cowry-darker font-medium"
                      : "bg-cowry-darker border border-cowry-border text-cowry-muted"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-cowry-muted text-xs mt-3">Live on Celo Mainnet</p>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-cowry-blue text-xs font-semibold tracking-widest uppercase mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-black">Everything you need to pay anyone</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="gradient-border bg-cowry-card rounded-2xl p-6 hover:bg-cowry-card/80 transition-colors"
              >
                <span className="text-3xl block mb-3">{f.icon}</span>
                <h3 className="font-bold text-white mb-2">{f.title}</h3>
                <p className="text-cowry-muted text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-6 py-20 bg-cowry-darker">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-cowry-blue text-xs font-semibold tracking-widest uppercase mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-black">Four steps from zero to paid</h2>
          </div>
          <div className="space-y-6">
            {STEPS.map((s, i) => (
              <div key={s.step} className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-cowry-card border border-cowry-blue/30 flex items-center justify-center">
                  <span className="text-cowry-blue font-black text-xs">{s.step}</span>
                </div>
                <div className="pt-1">
                  <h3 className="font-bold text-white mb-1">{s.title}</h3>
                  <p className="text-cowry-muted text-sm leading-relaxed">{s.desc}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="absolute left-[2.35rem] mt-14 w-px h-6 bg-cowry-border hidden sm:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cross-chain ─────────────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-cowry-blue text-xs font-semibold tracking-widest uppercase mb-3">Cross-Chain</p>
          <h2 className="text-3xl sm:text-4xl font-black mb-4">Send from anywhere, receive on Celo</h2>
          <p className="text-cowry-muted text-base max-w-xl mx-auto mb-10 leading-relaxed">
            Powered by LI.FI. Your recipient gets USDm or USDC on Celo — no matter which chain you send from.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {CHAINS.map((c) => (
              <span
                key={c}
                className="px-4 py-2 rounded-full border border-cowry-border bg-cowry-card text-sm text-cowry-muted hover:border-cowry-blue/40 hover:text-white transition-colors"
              >
                {c}
              </span>
            ))}
          </div>
          <p className="mt-5 text-cowry-muted text-xs">+ more chains via LI.FI</p>
        </div>
      </section>

      {/* ── Tokens ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-16 bg-cowry-darker">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-cowry-blue text-xs font-semibold tracking-widest uppercase mb-3">Supported Tokens</p>
          <h2 className="text-2xl sm:text-3xl font-black mb-8">Pay in USDm or USDC</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {[
              { symbol: "USDm", name: "Mento Dollar", desc: "Native Celo stablecoin — 18 decimals. Default in MiniPay.", color: "from-cowry-blue to-cowry-mint" },
              { symbol: "USDC", name: "USD Coin",     desc: "Circle's native USDC on Celo — 6 decimals.",              color: "from-blue-500 to-blue-400" },
            ].map((t) => (
              <div
                key={t.symbol}
                className="flex-1 bg-cowry-card border border-cowry-border rounded-2xl p-6 text-left gradient-border"
              >
                <div className={`inline-block text-transparent bg-clip-text bg-gradient-to-r ${t.color} text-3xl font-black mb-2`}>
                  {t.symbol}
                </div>
                <p className="font-semibold text-white text-sm mb-1">{t.name}</p>
                <p className="text-cowry-muted text-xs leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="px-6 py-24 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-glow-blue pointer-events-none" />
        <div className="relative max-w-lg mx-auto">
          <Image
            src="/cowry.png"
            alt="Cowry"
            width={80}
            height={80}
            className="mx-auto mb-6 rounded-xl"
          />
          <h2 className="text-3xl sm:text-5xl font-black mb-4 glow-text">Ready to try Cowry?</h2>
          <p className="text-cowry-muted mb-8 leading-relaxed">
            Open in MiniPay, register your @username, and send your first payment in under a minute.
          </p>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 bg-cowry-blue text-cowry-darker font-bold px-10 py-4 rounded-full text-sm hover:bg-cowry-mint transition-colors animate-glow"
          >
            Get started — it&apos;s free →
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-cowry-border px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/cowry.png" alt="Cowry" width={24} height={24} className="rounded" />
            <span className="text-sm font-semibold text-cowry-muted">Cowry</span>
            <span className="text-cowry-border">·</span>
            <span className="text-xs text-cowry-border">Talk. Send. Automate.</span>
          </div>
          <p className="text-xs text-cowry-border">Built on Celo · Powered by LI.FI · ERC-8004 Agent Identity</p>
        </div>
      </footer>

    </div>
  );
}
