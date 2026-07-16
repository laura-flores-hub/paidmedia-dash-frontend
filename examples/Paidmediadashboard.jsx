import React, { useState, useRef, useEffect } from "react";
import { motion, useInView, useMotionValue, animate as fmAnimate, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ *
 *  Paid Media Dashboard — motion prototype
 *  Mock data only. No Supabase, no fetch. Demonstrates three patterns:
 *    1. Reveal on scroll (stagger as sections enter the viewport)
 *    2. Number / bar tweening (values count up, bars grow with easing)
 *    3. Interpolated state transitions (filters morph data, no hard refresh)
 *
 *  Design tokens = Humand foundations (light theme, Roboto, brand blue).
 *  Motion vocabulary borrowed from anime.js: stagger, inOutExpo-ish easing,
 *  spring on interaction. Kept restrained: motion only on entry + state change.
 * ------------------------------------------------------------------ */

// ---- Tokens (from design-system-foundations) ----------------------
const T = {
  bg: "#f5f6f8",
  surface: "#ffffff",
  ink: "#303036",
  inkSoft: "#636271",
  inkFaint: "#aaaaba",
  brand50: "#f1f4fd",
  brand100: "#dee5fb",
  brand400: "#6f93eb",
  brand500: "#496be3",
  brand600: "#3851d8",
  brand900: "#29317f",
  border: "#eeeef1",
  success: "#28c040",
  error: "#e74444",
  // funnel accent ramp (brand -> purple -> teal), one hue per stage
  stage: ["#496be3", "#6330f7", "#35a48e", "#de920c"],
  shadow4: "-1px 4px 8px 0px rgba(233,233,244,1)",
  shadow8: "-1px 8px 16px 0px rgba(170,170,186,0.45)",
};

// anime.js-flavoured easing (approx inOutExpo) + a soft spring
const EASE = [0.16, 1, 0.3, 1];
const SPRING = { type: "spring", stiffness: 120, damping: 18 };

// ---- Mock data: three "channels", each with funnel + KPIs ----------
const DATA = {
  all: {
    label: "Todos os canais",
    kpis: { spend: 184320, leads: 2940, cpl: 62.7, roas: 4.3 },
    funnel: [
      { stage: "Impressões", value: 1_240_000 },
      { stage: "Cliques", value: 38_200 },
      { stage: "Leads", value: 2_940 },
      { stage: "MQLs", value: 612 },
    ],
  },
  meta: {
    label: "Meta",
    kpis: { spend: 82110, leads: 1510, cpl: 54.4, roas: 4.9 },
    funnel: [
      { stage: "Impressões", value: 720_000 },
      { stage: "Cliques", value: 21_400 },
      { stage: "Leads", value: 1_510 },
      { stage: "MQLs", value: 358 },
    ],
  },
  google: {
    label: "Google",
    kpis: { spend: 71200, leads: 1080, cpl: 65.9, roas: 4.1 },
    funnel: [
      { stage: "Impressões", value: 420_000 },
      { stage: "Cliques", value: 13_900 },
      { stage: "Leads", value: 1_080 },
      { stage: "MQLs", value: 201 },
    ],
  },
  linkedin: {
    label: "LinkedIn",
    kpis: { spend: 31010, leads: 350, cpl: 88.6, roas: 3.2 },
    funnel: [
      { stage: "Impressões", value: 100_000 },
      { stage: "Cliques", value: 2_900 },
      { stage: "Leads", value: 350 },
      { stage: "MQLs", value: 53 },
    ],
  },
};
const CHANNELS = ["all", "meta", "google", "linkedin"];

// ---- Pattern 2: a number that tweens to its target -----------------
function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString("pt-BR"), duration = 1.1 }) {
  const ref = useRef(null);
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(format(0));

  useEffect(() => {
    const controls = fmAnimate(mv, value, {
      duration,
      ease: EASE,
      onUpdate: (latest) => setDisplay(format(latest)),
    });
    return () => controls.stop();
  }, [value]);

  return <span ref={ref}>{display}</span>;
}

// ---- KPI card: reveals on scroll, value tweens on data change ------
function KpiCard({ label, value, format, sub, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: EASE, delay: index * 0.08 }}
      style={{
        background: T.surface,
        borderRadius: 16,
        padding: "20px 22px",
        boxShadow: T.shadow4,
        border: `1px solid ${T.border}`,
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 0.2, color: T.inkFaint, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, lineHeight: 1.3, fontWeight: 600, color: T.ink }}>
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub && <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>{sub}</div>}
    </motion.div>
  );
}

// ---- Pattern 3: funnel bars that morph between channel states ------
function FunnelBar({ stage, value, max, color, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const pct = (value / max) * 100;
  return (
    <div ref={ref} style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{stage}</span>
        <span style={{ fontSize: 14, color: T.inkSoft, fontVariantNumeric: "tabular-nums" }}>
          <AnimatedNumber value={value} />
        </span>
      </div>
      <div style={{ height: 14, background: T.brand50, borderRadius: 999, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          // animate to pct: morphs smoothly whenever value/max changes (state transition)
          animate={inView ? { width: `${pct}%` } : { width: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: index * 0.1 }}
          style={{
            height: "100%",
            borderRadius: 999,
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          }}
        />
      </div>
    </div>
  );
}

// ---- Section wrapper: reveal-on-scroll with an eyebrow label -------
function Section({ eyebrow, title, children }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: EASE }}
      style={{ marginBottom: 64 }}
    >
      <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: T.brand500, marginBottom: 6, fontWeight: 600 }}>
        {eyebrow}
      </div>
      <h2 style={{ fontSize: 24, lineHeight: 1.3, color: T.ink, margin: "0 0 28px", fontWeight: 600 }}>{title}</h2>
      {children}
    </motion.section>
  );
}

// ---- Channel filter: spring pill that slides between options -------
function ChannelFilter({ active, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: T.surface, borderRadius: 999, padding: 4, border: `1px solid ${T.border}`, boxShadow: T.shadow4, position: "relative" }}>
      {CHANNELS.map((c) => {
        const isActive = c === active;
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            style={{
              position: "relative",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "8px 18px",
              fontSize: 14,
              fontWeight: 600,
              color: isActive ? T.surface : T.inkSoft,
              borderRadius: 999,
              zIndex: 1,
              transition: "color 0.3s",
            }}
          >
            {isActive && (
              <motion.span
                layoutId="pill"
                transition={SPRING}
                style={{ position: "absolute", inset: 0, background: T.brand500, borderRadius: 999, zIndex: -1 }}
              />
            )}
            {DATA[c].label}
          </button>
        );
      })}
    </div>
  );
}

// ---- Hero: page-load orchestrated sequence (anime.js timeline vibe)-
function Hero() {
  return (
    <div style={{ padding: "72px 0 56px" }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: T.brand500, fontWeight: 600, marginBottom: 12 }}
      >
        Paid Media · Visão consolidada
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        style={{ fontSize: 44, lineHeight: 1.1, color: T.ink, margin: 0, fontWeight: 600, maxWidth: 620 }}
      >
        Do investimento ao MQL, em um só lugar.
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
        style={{ fontSize: 18, color: T.inkSoft, marginTop: 18, maxWidth: 540 }}
      >
        Meta, Google e LinkedIn unificados. Role para destrinchar cada etapa do funil.
      </motion.p>
    </div>
  );
}

export default function PaidMediaDashboard() {
  const [channel, setChannel] = useState("all");
  const d = DATA[channel];
  const maxFunnel = Math.max(...d.funnel.map((f) => f.value));

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "Roboto, system-ui, sans-serif", color: T.ink, padding: "0 24px 120px" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <Hero />

        {/* Sticky-ish filter — drives the state transitions below */}
        <div style={{ position: "sticky", top: 0, background: T.bg, padding: "16px 0", zIndex: 10, marginBottom: 8 }}>
          <ChannelFilter active={channel} onChange={setChannel} />
        </div>

        {/* KPIs — re-key on channel so numbers re-tween on change */}
        <Section eyebrow="Resumo" title="Indicadores do período">
          <div key={channel} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <KpiCard index={0} label="Investimento" value={d.kpis.spend} format={(n) => "R$ " + Math.round(n).toLocaleString("pt-BR")} sub="período atual" />
            <KpiCard index={1} label="Leads" value={d.kpis.leads} sub="total capturado" />
            <KpiCard index={2} label="CPL" value={d.kpis.cpl} format={(n) => "R$ " + n.toFixed(1).replace(".", ",")} sub="custo por lead" />
            <KpiCard index={3} label="ROAS" value={d.kpis.roas} format={(n) => n.toFixed(1).replace(".", ",") + "x"} sub="retorno sobre investimento" />
          </div>
        </Section>

        {/* Funnel — bars morph between channels (Pattern 3) */}
        <Section eyebrow="Funil" title="Da impressão ao MQL">
          <div style={{ background: T.surface, borderRadius: 16, padding: 28, boxShadow: T.shadow4, border: `1px solid ${T.border}` }}>
            {d.funnel.map((f, i) => (
              <FunnelBar key={f.stage} stage={f.stage} value={f.value} max={maxFunnel} color={T.stage[i]} index={i} />
            ))}
            <div style={{ marginTop: 8, fontSize: 12, color: T.inkFaint }}>
              Taxa impressão → MQL: <strong style={{ color: T.ink }}>{((d.funnel[3].value / d.funnel[0].value) * 100).toFixed(3)}%</strong>
            </div>
          </div>
        </Section>

        {/* Channel breakdown — animated mini-bars revealing on scroll */}
        <Section eyebrow="Comparativo" title="Leads por canal">
          <div style={{ display: "grid", gap: 14 }}>
            {CHANNELS.filter((c) => c !== "all").map((c, i) => {
              const leads = DATA[c].kpis.leads;
              const maxLeads = Math.max(...CHANNELS.filter((x) => x !== "all").map((x) => DATA[x].kpis.leads));
              return (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ width: 80, fontSize: 14, color: T.inkSoft }}>{DATA[c].label}</span>
                  <div style={{ flex: 1 }}>
                    <FunnelBar stage="" value={leads} max={maxLeads} color={T.stage[i]} index={i} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}