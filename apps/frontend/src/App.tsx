import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Terminal, 
  Server, 
  Activity,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Lock,
  Coins
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
type LogEvent = {
  id: string;
  type: string;
  source: "agent" | "provider" | "system";
  timestamp: string;
  data: Record<string, any>;
};

// ── Helpers ────────────────────────────────────────────────────────
const formatTime = (isoString: string) => {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { 
    hour12: false, 
    hour: "2-digit", 
    minute: "2-digit", 
    second: "2-digit"
  });
};

const generateId = () => Math.random().toString(36).substring(2, 9);

// ── Components ─────────────────────────────────────────────────────

const PanelHeader = ({ icon: Icon, title, status }: { icon: any, title: string, status: "online" | "waiting" }) => (
  <div className="flex items-center justify-between p-4 border-b border-phantom-border bg-phantom-surface sticky top-0 z-10 backdrop-blur-md bg-opacity-90">
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-phantom-card border border-phantom-border">
        <Icon size={18} className="text-phantom-accent" />
      </div>
      <h2 className="font-semibold text-phantom-text tracking-wide text-sm">{title}</h2>
    </div>
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${status === "online" ? "bg-phantom-success animate-pulse-slow" : "bg-phantom-warning"}`} />
      <span className="text-xs text-phantom-muted uppercase tracking-wider font-mono">
        {status}
      </span>
    </div>
  </div>
);

const LogEntry = ({ log }: { log: LogEvent }) => {
  const isAgent = log.source === "agent";
  
  let icon = <Activity size={14} />;
  let colorClass = "text-phantom-muted";
  
  if (log.type === "CHALLENGE_RECEIVED") {
    icon = <Lock size={14} />;
    colorClass = "text-phantom-warning";
  } else if (log.type === "PAYMENT_SIGNED") {
    icon = <ShieldCheck size={14} />;
    colorClass = "text-phantom-accent";
  } else if (log.type === "DATA_SERVED") {
    icon = <CheckCircle2 size={14} />;
    colorClass = "text-phantom-success";
  } else if (log.type === "FETCH_ATTEMPT") {
    icon = <Zap size={14} />;
    colorClass = "text-phantom-text";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`p-3 rounded-lg border border-phantom-border bg-phantom-card mb-2 hover:border-phantom-accent-dim transition-colors ${
        isAgent ? "border-l-2 border-l-phantom-accent" : "border-r-2 border-r-phantom-success"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-2 ${colorClass}`}>
          {icon}
          <span className="text-xs font-semibold tracking-wider font-mono">
            {log.type.replace(/_/g, " ")}
          </span>
        </div>
        <span className="text-xs font-mono text-phantom-muted">
          {formatTime(log.timestamp)}
        </span>
      </div>
      <div className="text-sm font-mono text-phantom-text/80 overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(log.data, null, 2)}
      </div>
    </motion.div>
  );
};

// ── Main App ───────────────────────────────────────────────────────

function App() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const agentLogs = logs.filter(l => l.source === "agent");
  const providerLogs = logs.filter(l => l.source === "provider");
  const settlementLogs = logs.filter(l => l.type === "PAYMENT_SIGNED" || l.type === "DATA_SERVED");

  const agentEndRef = useRef<HTMLDivElement>(null);
  const providerEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    agentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentLogs]);

  useEffect(() => {
    providerEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [providerLogs]);

  useEffect(() => {
    const providerUrl = import.meta.env.VITE_PROVIDER_URL || "https://swarm-broker.onrender.com";
    const wsUrl = providerUrl.replace(/^http/, "ws") + "/ws";
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setLogs(prev => [...prev, { id: generateId(), ...payload }]);
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-phantom-bg text-phantom-text overflow-hidden font-sans">
      
      {/* Top Bar */}
      <header className="h-14 border-b border-phantom-border bg-phantom-surface flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-phantom-accent to-phantom-accent-dim flex items-center justify-center shadow-[0_0_15px_rgba(171,159,242,0.3)]">
            <Coins size={14} className="text-phantom-bg" />
          </div>
          <h1 className="font-bold tracking-tight text-lg">Swarm Broker</h1>
          <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-mono bg-phantom-card border border-phantom-border text-phantom-accent">
            x402 Protocol
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-phantom-muted font-mono">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-phantom-success animate-pulse-slow"></div>
            BOT Chain Testnet
          </span>
        </div>
      </header>

      {/* Main Split View */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Agent Client */}
        <div className="flex-1 border-r border-phantom-border flex flex-col bg-phantom-bg relative">
          <PanelHeader 
            icon={Terminal} 
            title="Master Agent" 
            status={agentLogs.length > 0 ? "online" : "waiting"} 
          />
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar relative">
            {agentLogs.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-phantom-muted font-mono text-sm">
                Waiting for Agent Client...
              </div>
            )}
            <AnimatePresence initial={false}>
              {agentLogs.map(log => (
                <LogEntry key={log.id} log={log} />
              ))}
            </AnimatePresence>
            <div ref={agentEndRef} />
          </div>
        </div>

        {/* Center Divider Visualizer */}
        <div className="w-16 flex flex-col items-center justify-center bg-phantom-surface border-r border-phantom-border relative z-10 shrink-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-8">
            <motion.div 
              animate={{ 
                y: [0, 10, 0], 
                opacity: [0.3, 1, 0.3] 
              }} 
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-phantom-accent"
            >
              <ArrowRight size={20} />
            </motion.div>
            <div className="w-px h-32 bg-gradient-to-b from-transparent via-phantom-border to-transparent" />
            <motion.div 
              animate={{ 
                y: [0, -10, 0], 
                opacity: [0.3, 1, 0.3] 
              }} 
              transition={{ repeat: Infinity, duration: 2, delay: 1 }}
              className="text-phantom-success"
            >
              <ArrowRight size={20} className="rotate-180" />
            </motion.div>
          </div>
        </div>

        {/* Right: Provider Node */}
        <div className="flex-1 flex flex-col bg-phantom-bg relative">
          <PanelHeader 
            icon={Server} 
            title="Provider Node (DePIN)" 
            status={providerLogs.length > 0 ? "online" : "waiting"} 
          />
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar relative">
            {providerLogs.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-phantom-muted font-mono text-sm">
                Waiting for Provider Node...
              </div>
            )}
            <AnimatePresence initial={false}>
              {providerLogs.map(log => (
                <LogEntry key={log.id} log={log} />
              ))}
            </AnimatePresence>
            <div ref={providerEndRef} />
          </div>
        </div>

      </div>

      {/* Bottom Panel: Settlement Ledger */}
      <div className="h-48 border-t border-phantom-border bg-phantom-surface shrink-0 flex flex-col">
        <div className="px-4 py-2 border-b border-phantom-border flex justify-between items-center bg-phantom-card">
          <span className="text-xs font-semibold text-phantom-muted uppercase tracking-wider">
            On-Chain Settlements (MockUSDC)
          </span>
          <span className="text-xs font-mono text-phantom-accent">EIP-712 Structured Signatures</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <AnimatePresence initial={false}>
            {settlementLogs.map(log => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 text-sm font-mono mb-2"
              >
                <span className="text-phantom-muted w-24 shrink-0">{formatTime(log.timestamp)}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  log.type === "PAYMENT_SIGNED" 
                    ? "bg-phantom-accent/10 text-phantom-accent border border-phantom-accent/20"
                    : "bg-phantom-success/10 text-phantom-success border border-phantom-success/20"
                }`}>
                  {log.type === "PAYMENT_SIGNED" ? "TX_SIGNED" : "SETTLED"}
                </span>
                <span className="text-phantom-text/80 truncate">
                  {log.type === "PAYMENT_SIGNED" 
                    ? `Agent authorized 0.01 USDC payment via EIP-712` 
                    : `Provider verified payment and served data payload`}
                </span>
              </motion.div>
            ))}
            {settlementLogs.length === 0 && (
              <div className="h-full flex items-center justify-center text-phantom-muted font-mono text-sm">
                Awaiting first micropayment...
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}

export default App;
