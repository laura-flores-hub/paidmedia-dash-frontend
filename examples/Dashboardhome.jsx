import React, { useState, useRef, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate as fmAnimate,
  useInView,
} from "framer-motion";

/* ------------------------------------------------------------------ *
 *  Dashboard Home — anime.js-dark aesthetic
 *  Mock data only. No Supabase, no fetch.
 *
 *  Layout:
 *    [ Overview do período (grande) ]
 *    [ Deals ]   [ MRR ]        <- clicláveis, 3 estados cada
 *    [ Gráfico de linha: mês atual vs anterior, degradê sutil ]
 *
 *  Box state cycle (click anywhere on the box advances):
 *    0 -> número grande
 *    1 -> gauge meia-lua vs meta
 *    2 -> split inbound vs outbound
 *  Transições com AnimatePresence (o "destrinchamento" do anime.js).
 * ------------------------------------------------------------------ */

// ---- anime.js dark palette (lida dos prints) ----------------------
const C = {
  bg: "#0d0d10",
  surface: "#16161c",
  surfaceHi: "#1c1c24",
  border: "#26262f",
  text: "#e8e8ef",
  textSoft: "#8d8c9f",
  textFaint: "#5a5a68",
  cyan: "#6fd1e7", // accent principal (anime.js)
  cyanDim: "#46badd",
  teal: "#35a48e",
  purple: "#9785ff",
  green: "#4ed364",
  red: "#f27777",
  lime: "#aee67f",
  dot: "rgba(255,255,255,0.04)",
};

// paleta das linhas de canal (estado 2 do gráfico)
const CHANNEL_COLORS = {
  Meta: "#6fd1e7",
  Google: "#9785ff",
  LinkedIn: "#46badd",
  Organic: "#4ed364",
  Outbound: "#f4c83f",
};

const EASE = [0.16, 1, 0.3, 1];
const SPRING = { type: "spring", stiffness: 140, damping: 20 };

// ---- Mock data ----------------------------------------------------
const PERIOD = {
  label: "Trimestre atual",
  range: "abr — jun 2026",
  spend: 184320,
  newDeals: 142,
  mrr: 96400,
};

const DEALS = {
  count: 142,
  goal: 180,
  inbound: 88,
  outbound: 54,
};

const MRR = {
  value: 96400,
  goal: 110000,
  inbound: 61200, // expansão/novos via inbound
  outbound: 35200,
};

// gráfico clicável: 3 visões, cada uma mês atual vs anterior
const CHART_VIEWS = {
  revenue: {
    label: "receita",
    unit: "R$ mil",
    current: [12, 18, 22, 19, 28, 35, 41, 38, 47, 53, 58, 64],
    previous: [10, 14, 16, 20, 23, 26, 30, 33, 36, 40, 43, 48],
  },
  deals: {
    label: "volume de deals",
    unit: "deals",
    current: [3, 5, 6, 8, 9, 12, 14, 13, 17, 19, 21, 24],
    previous: [2, 4, 5, 6, 7, 9, 10, 12, 13, 15, 16, 18],
  },
  channels: {
    label: "volume por canal",
    unit: "deals",
    // 5 séries (mês atual). comparação vs anterior aqui é o total tracejado.
    series: {
      Meta: [1, 2, 2, 3, 3, 4, 5, 5, 6, 7, 8, 9],
      Google: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7],
      LinkedIn: [0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4],
      Organic: [1, 1, 1, 2, 1, 2, 2, 2, 2, 3, 3, 3],
      Outbound: [0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1],
    },
    previousTotal: [2, 4, 5, 6, 7, 9, 10, 12, 13, 15, 16, 18],
  },
};
const CHART_ORDER = ["revenue", "deals", "channels"];

// ---- Filtros ------------------------------------------------------
// Janela de dado real: últimos 90 dias a partir de hoje (19/06/2026).
// Seleção fora de [WINDOW_START, TODAY] fica desabilitada no calendário.
const TODAY = new Date(2026, 5, 19); // mês 5 = junho
const WINDOW_DAYS = 90;
const WINDOW_START = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - WINDOW_DAYS);

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_PT_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DOW_PT = ["d", "s", "t", "q", "q", "s", "s"];

// normaliza pra meia-noite (compara só a data, ignora hora)
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => a && b && dayStart(a).getTime() === dayStart(b).getTime();
const fmtDate = (d) => d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "—";
const inWindow = (d) => {
  const t = dayStart(d).getTime();
  return t >= dayStart(WINDOW_START).getTime() && t <= dayStart(TODAY).getTime();
};

// Geo. Regiões reais do negócio. O mapa região→países vive no Supabase;
// no real, popular via query no mount (RLS leitura anônima, como nas *_v2).
// Ex: select distinct region, country from <tabela_geo> order by region, country
// Aqui ficam países-exemplo só pra demonstrar a cascata visual.
const REGIONS = {
  Todas: [],
  Brazil: ["Brasil"],
  HISPAM: ["México", "Argentina", "Chile", "Colômbia", "Peru"],
  NA: ["Estados Unidos", "Canadá"],
  EMEA: ["Reino Unido", "Alemanha", "França", "Espanha", "Emirados Árabes"],
  APAC: ["Índia", "Singapura", "Austrália", "Japão"],
};
const REGION_ORDER = ["Todas", "Brazil", "HISPAM", "NA", "EMEA", "APAC"];

// ---- helpers ------------------------------------------------------
const fmtBRL = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const fmtNum = (n) => Math.round(n).toLocaleString("pt-BR");

// número que conta até o alvo
function Counter({ value, format = fmtNum, duration = 1.0 }) {
  const mv = useMotionValue(0);
  const [d, setD] = useState(format(0));
  useEffect(() => {
    const c = fmAnimate(mv, value, { duration, ease: EASE, onUpdate: (v) => setD(format(v)) });
    return () => c.stop();
  }, [value]);
  return <span>{d}</span>;
}

// dot-grid de fundo (igual aos cards do anime.js)
const dotGrid = {
  backgroundImage: `radial-gradient(${C.dot} 1px, transparent 1px)`,
  backgroundSize: "16px 16px",
};

// ---- Gauge meia-lua (estado 2 dos boxes) --------------------------
function HalfGauge({ value, goal, color, format }) {
  const pct = Math.min(value / goal, 1);
  const r = 70;
  const circ = Math.PI * r; // meio círculo
  const mv = useMotionValue(0);
  const [dash, setDash] = useState(circ);
  useEffect(() => {
    const c = fmAnimate(mv, pct, {
      duration: 1.1,
      ease: EASE,
      onUpdate: (v) => setDash(circ * (1 - v)),
    });
    return () => c.stop();
  }, [pct]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="180" height="100" viewBox="0 0 180 100">
        <path d={`M 20 95 A ${r} ${r} 0 0 1 160 95`} fill="none" stroke={C.border} strokeWidth="10" strokeLinecap="round" />
        <motion.path
          d={`M 20 95 A ${r} ${r} 0 0 1 160 95`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dash}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div style={{ marginTop: -12, textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {Math.round(pct * 100)}%
        </div>
        <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>
          {format(value)} / {format(goal)}
        </div>
      </div>
    </div>
  );
}

// ---- Split inbound/outbound (estado 3) ----------------------------
function Split({ inbound, outbound, format }) {
  const total = inbound + outbound;
  const inPct = (inbound / total) * 100;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: C.border }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${inPct}%` }}
          transition={{ duration: 0.9, ease: EASE }}
          style={{ background: C.cyan }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${100 - inPct}%` }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.05 }}
          style={{ background: C.purple }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: C.cyan }} />
            <span style={{ fontSize: 12, color: C.textSoft }}>Inbound</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginTop: 4 }}>{format(inbound)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            <span style={{ fontSize: 12, color: C.textSoft }}>Outbound</span>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: C.purple }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginTop: 4 }}>{format(outbound)}</div>
        </div>
      </div>
    </div>
  );
}

// ---- Box clicável com 3 estados -----------------------------------
const STATE_LABELS = ["Total", "vs Meta", "Origem"];

function MetricBox({ title, data, color, format, index }) {
  const [state, setState] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  const next = () => setState((s) => (s + 1) % 3);

  return (
    <motion.div
      ref={ref}
      onClick={next}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: EASE, delay: index * 0.1 }}
      whileHover={{ y: -3 }}
      style={{
        ...dotGrid,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 24,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        height: 240,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* glow no topo */}
      <div style={{ position: "absolute", top: -40, left: -40, width: 120, height: 120, background: `radial-gradient(circle, ${color}22, transparent 70%)`, pointerEvents: "none" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: C.textSoft, fontFamily: "monospace", textTransform: "lowercase" }}>{title}</span>
        {/* dots indicando estado atual */}
        <div style={{ display: "flex", gap: 5 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: i === state ? color : C.border, transition: "background 0.3s" }} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AnimatePresence mode="wait">
          {state === 0 && (
            <motion.div
              key="total"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.35, ease: EASE }}
              style={{ textAlign: "center" }}
            >
              <div style={{ fontSize: 44, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                <Counter value={data.value ?? data.count} format={format} />
              </div>
              <div style={{ fontSize: 12, color: C.textFaint, marginTop: 8 }}>no período</div>
            </motion.div>
          )}
          {state === 1 && (
            <motion.div key="gauge" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.35, ease: EASE }}>
              <HalfGauge value={data.value ?? data.count} goal={data.goal} color={color} format={format} />
            </motion.div>
          )}
          {state === 2 && (
            <motion.div key="split" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.35, ease: EASE }} style={{ width: "100%" }}>
              <Split inbound={data.inbound} outbound={data.outbound} format={format} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ fontSize: 11, color: C.textFaint, fontFamily: "monospace", marginTop: 12 }}>
        {STATE_LABELS[state]} · clique para alternar
      </div>
    </motion.div>
  );
}

// ---- Gráfico de linha: atual vs anterior --------------------------
// ---- Gráfico de linha clicável: 3 visões -------------------------
function LineChart() {
  const [view, setView] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const key = CHART_ORDER[view];
  const cfg = CHART_VIEWS[key];

  const w = 720, h = 240, pad = 24;

  // escala: pega o máximo de tudo que vai ser desenhado nesta visão
  let max;
  if (key === "channels") {
    const allSeries = Object.values(cfg.series).flat();
    max = Math.max(...allSeries, ...cfg.previousTotal);
  } else {
    max = Math.max(...cfg.current, ...cfg.previous);
  }

  const toXY = (arr) =>
    arr.map((v, i) => [
      pad + (i / (arr.length - 1)) * (w - pad * 2),
      h - pad - (v / max) * (h - pad * 2),
    ]);
  const path = (pts) => pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(" ");

  const next = () => setView((v) => (v + 1) % CHART_ORDER.length);

  return (
    <motion.div
      ref={ref}
      onClick={next}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: EASE }}
      whileHover={{ y: -2 }}
      style={{ ...dotGrid, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, marginTop: 24, position: "relative", overflow: "hidden", cursor: "pointer" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: C.textSoft, fontFamily: "monospace" }}>
          {cfg.label} · mês atual vs anterior
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* legenda muda conforme a visão */}
          <AnimatePresence mode="wait">
            <motion.div
              key={key + "-legend"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}
            >
              {key === "channels" ? (
                Object.keys(cfg.series).map((ch) => (
                  <span key={ch} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textSoft }}>
                    <span style={{ width: 12, height: 2, background: CHANNEL_COLORS[ch] }} /> {ch}
                  </span>
                ))
              ) : (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.textSoft }}>
                    <span style={{ width: 16, height: 2, background: C.cyan }} /> atual
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.textSoft }}>
                    <span style={{ width: 16, height: 2, background: C.textFaint }} /> anterior
                  </span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
          {/* dots de estado */}
          <div style={{ display: "flex", gap: 5 }}>
            {CHART_ORDER.map((_, i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: i === view ? C.cyan : C.border, transition: "background 0.3s" }} />
            ))}
          </div>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.cyan} stopOpacity="0.22" />
            <stop offset="100%" stopColor={C.cyan} stopOpacity="0" />
          </linearGradient>
        </defs>

        <AnimatePresence mode="wait">
          <motion.g
            key={key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {key === "channels" ? (
              <>
                {/* total do mês anterior como referência tracejada */}
                <motion.path
                  d={path(toXY(cfg.previousTotal))}
                  fill="none"
                  stroke={C.textFaint}
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, ease: EASE }}
                />
                {/* uma linha por canal, desenhando com stagger */}
                {Object.entries(cfg.series).map(([ch, arr], i) => (
                  <motion.path
                    key={ch}
                    d={path(toXY(arr))}
                    fill="none"
                    stroke={CHANNEL_COLORS[ch]}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 3px ${CHANNEL_COLORS[ch]}55)` }}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.2, ease: EASE, delay: i * 0.12 }}
                  />
                ))}
              </>
            ) : (
              <>
                {/* degradê sob a linha atual */}
                <motion.path
                  d={`${path(toXY(cfg.current))} L ${toXY(cfg.current)[cfg.current.length - 1][0]} ${h - pad} L ${toXY(cfg.current)[0][0]} ${h - pad} Z`}
                  fill="url(#fade)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
                {/* mês anterior */}
                <motion.path
                  d={path(toXY(cfg.previous))}
                  fill="none"
                  stroke={C.textFaint}
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.1, ease: EASE }}
                />
                {/* mês atual */}
                <motion.path
                  d={path(toXY(cfg.current))}
                  fill="none"
                  stroke={C.cyan}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 4px ${C.cyan}55)` }}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.3, ease: EASE, delay: 0.15 }}
                />
              </>
            )}
          </motion.g>
        </AnimatePresence>
      </svg>

      <div style={{ fontSize: 11, color: C.textFaint, fontFamily: "monospace", marginTop: 8 }}>
        clique para alternar a métrica
      </div>
    </motion.div>
  );
}

// ---- Overview (box grande do topo) --------------------------------
function Overview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE }}
      style={{ ...dotGrid, background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, position: "relative", overflow: "hidden" }}
    >
      <div style={{ position: "absolute", top: -60, right: -40, width: 220, height: 220, background: `radial-gradient(circle, ${C.cyan}18, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: C.cyan, fontFamily: "monospace", marginBottom: 12 }}>
        {PERIOD.label} · {PERIOD.range}
      </div>
      <div style={{ display: "flex", gap: 48, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 13, color: C.textSoft, marginBottom: 6 }}>Receita recorrente (MRR)</div>
          <div style={{ fontSize: 52, fontWeight: 600, color: C.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            <Counter value={PERIOD.mrr} format={fmtBRL} duration={1.3} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 40, paddingBottom: 6 }}>
          <div>
            <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 4 }}>Novos deals</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: C.text }}><Counter value={PERIOD.newDeals} /></div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 4 }}>Investimento</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: C.text }}><Counter value={PERIOD.spend} format={fmtBRL} /></div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---- Calendário de range (clica início e fim) --------------------
function RangeCalendar({ range, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const { start, end } = range;

  const pick = (d) => {
    if (!start || (start && end)) {
      onChange({ start: d, end: null }); // começa novo range
    } else {
      // segundo clique: ordena
      if (d < start) onChange({ start: d, end: start });
      else onChange({ start, end: d });
      setOpen(false);
    }
  };

  // dias do mês em view, com padding pro 1º dia cair no dia da semana certo
  const firstDow = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));

  const inRange = (d) => {
    if (!d) return false;
    const s = start, e = end || hover;
    if (!s || !e) return false;
    const lo = s < e ? s : e, hi = s < e ? e : s;
    const t = dayStart(d).getTime();
    return t > dayStart(lo).getTime() && t < dayStart(hi).getTime();
  };

  // limites de navegação: não deixa ir antes do mês de WINDOW_START
  const canPrev = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1) >=
    new Date(WINDOW_START.getFullYear(), WINDOW_START.getMonth(), 1);
  const canNext = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1) <=
    new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

  const label = start ? `${fmtDate(start)} – ${fmtDate(end)}` : "selecionar intervalo";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ fontSize: 11, color: C.textFaint, fontFamily: "monospace", marginBottom: 6 }}>período</div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 200, display: "flex", justifyContent: "space-between", alignItems: "center",
          background: C.surface, border: `1px solid ${open ? C.cyan : C.border}`, borderRadius: 10,
          padding: "9px 12px", color: start ? C.text : C.textSoft, fontSize: 13, cursor: "pointer",
          fontFamily: "inherit", transition: "border-color 0.2s",
        }}
      >
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{label}</span>
        <span style={{ color: C.textSoft, fontSize: 13, marginLeft: 8 }}>▦</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: EASE }}
            style={{
              position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 50, width: 280,
              background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {/* header de navegação */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <button
                onClick={() => canPrev && setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                disabled={!canPrev}
                style={{ background: "none", border: "none", color: canPrev ? C.text : C.textFaint, cursor: canPrev ? "pointer" : "not-allowed", fontSize: 16, padding: "0 6px" }}
              >‹</button>
              <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
                {MONTHS_PT_FULL[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </span>
              <button
                onClick={() => canNext && setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                disabled={!canNext}
                style={{ background: "none", border: "none", color: canNext ? C.text : C.textFaint, cursor: canNext ? "pointer" : "not-allowed", fontSize: 16, padding: "0 6px" }}
              >›</button>
            </div>

            {/* dias da semana */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
              {DOW_PT.map((d, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: 10, color: C.textFaint, fontFamily: "monospace", padding: "2px 0" }}>{d}</div>
              ))}
            </div>

            {/* grade de dias */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const enabled = inWindow(d);
                const isStart = sameDay(d, start);
                const isEnd = sameDay(d, end);
                const isEdge = isStart || isEnd;
                const mid = inRange(d);
                return (
                  <button
                    key={i}
                    onClick={() => enabled && pick(d)}
                    onMouseEnter={() => setHover(d)}
                    disabled={!enabled}
                    style={{
                      aspectRatio: "1", border: "none", borderRadius: 7, fontSize: 12,
                      fontFamily: "inherit", fontVariantNumeric: "tabular-nums",
                      cursor: enabled ? "pointer" : "not-allowed",
                      color: !enabled ? C.textFaint : isEdge ? C.bg : C.text,
                      opacity: enabled ? 1 : 0.3,
                      background: isEdge ? C.cyan : mid ? C.cyan + "22" : "transparent",
                      fontWeight: isEdge ? 600 : 400,
                      transition: "background 0.15s",
                    }}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: C.textFaint, fontFamily: "monospace" }}>
                dado real: últimos 90 dias
              </span>
              <button
                onClick={() => { onChange({ start: null, end: null }); setHover(null); }}
                style={{ background: "none", border: "none", color: C.cyan, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
              >limpar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Dropdown genérico (dark, estilo anime.js) -------------------
function Dropdown({ label, value, children, width = 160 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ fontSize: 11, color: C.textFaint, fontFamily: "monospace", marginBottom: 6 }}>{label}</div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width, display: "flex", justifyContent: "space-between", alignItems: "center",
          background: C.surface, border: `1px solid ${open ? C.cyan : C.border}`, borderRadius: 10,
          padding: "9px 12px", color: C.text, fontSize: 13, cursor: "pointer",
          fontFamily: "inherit", transition: "border-color 0.2s",
        }}
      >
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ color: C.textSoft, fontSize: 10, marginLeft: 8 }}>▾</motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: EASE }}
            style={{
              position: "absolute", top: "100%", left: 0, marginTop: 6, minWidth: width, zIndex: 50,
              background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", maxHeight: 280, overflowY: "auto",
            }}
          >
            {typeof children === "function" ? children(setOpen) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Option({ children, active, disabled, badge, onClick }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: active ? C.cyan + "1f" : "transparent", border: "none", borderRadius: 7,
        padding: "8px 10px", color: disabled ? C.textFaint : active ? C.cyan : C.text,
        fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
        textAlign: "left", opacity: disabled ? 0.55 : 1,
      }}
    >
      <span>{children}</span>
      {badge && (
        <span style={{
          fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: "monospace",
          color: C.purple, border: `1px solid ${C.purple}55`, borderRadius: 5, padding: "2px 5px",
        }}>{badge}</span>
      )}
    </button>
  );
}

// ---- Barra de filtros --------------------------------------------
function FilterBar({ filters, setFilters }) {
  const countries = REGIONS[filters.region] ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "flex-end" }}
    >
      {/* Período — calendário de range */}
      <RangeCalendar
        range={filters.range}
        onChange={(range) => setFilters((f) => ({ ...f, range }))}
      />

      {/* Região */}
      <Dropdown label="região" value={filters.region} width={180}>
        {(close) => REGION_ORDER.map((r) => (
          <Option
            key={r}
            active={r === filters.region}
            onClick={() => { setFilters((f) => ({ ...f, region: r, country: "Todos" })); close(false); }}
          >
            {r}
          </Option>
        ))}
      </Dropdown>

      {/* País (cascata da região) */}
      <Dropdown label="país" value={filters.country} width={170}>
        {(close) => (
          <>
            <Option active={filters.country === "Todos"} onClick={() => { setFilters((f) => ({ ...f, country: "Todos" })); close(false); }}>
              Todos
            </Option>
            {countries.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 12, color: C.textFaint }}>selecione uma região</div>
            )}
            {countries.map((c) => (
              <Option key={c} active={c === filters.country} onClick={() => { setFilters((f) => ({ ...f, country: c })); close(false); }}>
                {c}
              </Option>
            ))}
          </>
        )}
      </Dropdown>
    </motion.div>
  );
}

export default function DashboardHome() {
  const [filters, setFilters] = useState({
    range: { start: WINDOW_START, end: TODAY }, // default: janela cheia de 90 dias
    region: "Todas",
    country: "Todos",
  });

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Roboto', system-ui, sans-serif", color: C.text, padding: "48px 24px 96px" }}>
      <div style={{ maxWidth: 768, margin: "0 auto" }}>
        <FilterBar filters={filters} setFilters={setFilters} />
        <Overview />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 24 }}>
          <MetricBox index={0} title="deals" data={DEALS} color={C.cyan} format={fmtNum} />
          <MetricBox index={1} title="mrr" data={MRR} color={C.teal} format={fmtBRL} />
        </div>

        <LineChart />
      </div>
    </div>
  );
}