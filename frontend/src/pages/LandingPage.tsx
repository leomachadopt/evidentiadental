import { Link } from 'react-router-dom';
import {
  Search,
  ShieldCheck,
  FileText,
  Clock,
  Sparkles,
  Check,
  ArrowRight,
  Unlock,
  Library,
  AlertTriangle,
  BadgeCheck,
  Quote,
} from 'lucide-react';

/**
 * Sales landing page — psychology levers are noted per section.
 * AIDA structure: Attention (hero) -> Interest (problem) -> Desire (how/why/proof)
 * -> Action (pricing + CTA). Single repeated CTA reduces choice paralysis (Hick's Law).
 */

const REGISTER = '/login?mode=register';

// Real data sources — used as honest trust signals (Authority Bias), not invented logos.
const SOURCES = ['PubMed', 'Europe PMC', 'ClinicalTrials.gov', 'Crossref', 'Unpaywall', 'PubMed Central'];

const STEPS = [
  { n: '01', title: 'Escreve a pergunta', body: 'Em linguagem natural. Nós convertemos em PICO e numa query PubMed otimizada.' },
  { n: '02', title: 'Busca real, multi-fonte', body: 'PubMed, Europe PMC e ClinicalTrials.gov de uma vez — ordenados por relevância clínica.' },
  { n: '03', title: 'Síntese citável', body: 'Resposta clínica em 4 secções, com cada afirmação ligada a um [PMID] real.' },
];

// Same features for everyone — only the billing cadence differs.
const PLAN_FEATURES = [
  '30 buscas por mês',
  'Mini-sínteses com citações validadas',
  'Biblioteca pessoal + exports',
  'Acesso a texto completo (legal)',
];

export function LandingPage() {
  return (
    <div className="animate-fade-up">
      {/* ===== HERO — Jobs-to-be-Done (outcome, not features) + single CTA ===== */}
      <section className="py-12 md:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3 py-1 text-xs font-medium text-primary-700 backdrop-blur-sm">
              <BadgeCheck className="h-3.5 w-3.5" /> Evidência verificada por arquitetura
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-slate-900 md:text-5xl">
              A resposta clínica que demorava uma tarde,
              <span className="text-primary-600"> em 90 segundos.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Faz uma pergunta dentária em português. O EvidentiaDental pesquisa as bases
              científicas reais e devolve uma mini-síntese com citações verificadas — pronta a usar
              com o paciente, na formação ou no artigo.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to={REGISTER} className="btn-primary px-5 py-3 text-base">
                <Sparkles className="h-4 w-4" /> Começar trial
              </Link>
              <a href="#como-funciona" className="btn-secondary px-5 py-3 text-base">
                Ver como funciona
              </a>
            </div>
            {/* Zero-price + regret aversion microcopy */}
            <p className="mt-3 text-sm text-slate-500">7 dias grátis, depois 9,90€/mês · cancela quando quiseres</p>
          </div>

          {/* Hero proof card — shows the "after": a cited synthesis */}
          <div className="card lg:ml-auto lg:max-w-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Mini-síntese</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Citações validadas
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              O PRF reduziu a reabsorção do rebordo alveolar de forma significativa após extração{' '}
              <span className="rounded bg-primary-50 px-1 font-mono text-xs text-primary-700">[PMID 41907965]</span>,
              com melhor cicatrização dos tecidos moles{' '}
              <span className="rounded bg-primary-50 px-1 font-mono text-xs text-primary-700">[PMID 41963870]</span>.
            </p>
            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium uppercase">Evidência: moderada</span>
              <span>· 5 artigos · gerado em 90s</span>
            </div>
          </div>
        </div>

        {/* Authority: real sources strip */}
        <div className="mt-12 border-t border-white/60 pt-6">
          <p className="text-center text-xs font-medium uppercase tracking-widest text-slate-400">
            Dados reais de
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {SOURCES.map((s) => (
              <span key={s} className="text-sm font-medium text-slate-500">{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PROBLEM / CONTRAST — sets the "before" (Contrast + Loss Aversion) ===== */}
      <section className="py-12">
        <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
          Hoje, a evidência custa-te <span className="text-primary-600">tempo</span> ou{' '}
          <span className="text-primary-600">confiança</span>.
        </h2>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="card">
            <Clock className="h-6 w-6 text-slate-400" strokeWidth={1.75} />
            <h3 className="mt-3 font-semibold text-slate-900">Ir ao PubMed à mão</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Fiável — mas tens de saber montar a query, e depois ler e sintetizar 200 abstracts. Lá
              se vai a tarde.
            </p>
          </div>
          <div className="card">
            <AlertTriangle className="h-6 w-6 text-amber-500" strokeWidth={1.75} />
            <h3 className="mt-3 font-semibold text-slate-900">Perguntar ao ChatGPT</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Rápido — mas inventa referências. Citar um estudo que não existe à frente de um
              paciente ou colega é um risco que não vale a pena.
            </p>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg text-slate-700">
          O EvidentiaDental vive na lacuna entre os dois: a <strong>velocidade do ChatGPT</strong>{' '}
          com a <strong>fiabilidade do PubMed</strong>.
        </p>
      </section>

      {/* ===== HOW IT WORKS — Goal-Gradient + low activation energy ===== */}
      <section id="como-funciona" className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Três passos. Noventa segundos.</h2>
        <p className="mt-2 max-w-xl text-slate-600">Da pergunta de consultório à resposta fundamentada.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card">
              <span className="font-mono text-sm font-semibold text-primary-600">{s.n}</span>
              <h3 className="mt-2 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== THE MOAT — Authority Bias: the guarantee nobody else has ===== */}
      <section className="py-12">
        <div className="card overflow-hidden border-primary-200/60 bg-gradient-to-br from-primary-50/70 to-white/70">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary-700">
                <ShieldCheck className="h-4 w-4" /> O diferencial
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                A IA não consegue inventar uma referência.
              </h2>
              <p className="mt-3 leading-relaxed text-slate-600">
                Não é "uma IA que tenta não alucinar". É uma arquitetura onde cada PMID vem de uma
                chamada real às bases científicas, e um validador rejeita qualquer citação que o
                modelo tente inventar. Confiança por construção, não por sorte.
              </p>
            </div>
            <ul className="space-y-3">
              {[
                'Cada [PMID] é real e clicável para o PubMed',
                'Cada afirmação factual tem de estar citada',
                'O backend valida — e repete até estar correto',
                'Força da evidência classificada (alta a insuficiente)',
              ].map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-slate-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== BENEFITS — JTBD framing, asymmetric (avoids generic 3-card row) ===== */}
      <section className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">O que ganhas</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-6">
          <Benefit className="md:col-span-3" icon={Clock} title="Recuperas a tua tarde">
            A leitura e síntese que te tomava 30-60 min fica feita em segundos — com a decisão clínica
            já destilada.
          </Benefit>
          <Benefit className="md:col-span-3" icon={FileText} title="Pronto a citar">
            Exporta em Markdown (Obsidian) ou PDF estilo Vancouver. Usa na formação, no artigo, ou
            com o paciente.
          </Benefit>
          <Benefit className="md:col-span-2" icon={Search} title="Multi-fonte">
            PubMed + Europe PMC + ensaios clínicos, numa só busca.
          </Benefit>
          <Benefit className="md:col-span-2" icon={Unlock} title="Texto completo, legal">
            Open-access, PubMed Central e o teu acesso institucional — num clique.
          </Benefit>
          <Benefit className="md:col-span-2" icon={Library} title="A tua biblioteca">
            Guarda, organiza por pastas e anota os artigos que importam.
          </Benefit>
        </div>
      </section>

      {/* ===== SOCIAL PROOF — real signals + clearly-marked testimonial placeholders ===== */}
      <section className="py-12">
        <div className="grid gap-4 md:grid-cols-3">
          {/* PLACEHOLDER: substitui por testemunhos reais antes de publicar. Não inventes citações. */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <Quote className="h-6 w-6 text-primary-300" />
              <p className="mt-3 text-sm italic leading-relaxed text-slate-400">
                [Espaço para testemunho real de um dentista do beta — adiciona quando os tiveres.]
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-100" />
                <div className="text-xs text-slate-400">
                  <div className="font-medium">Nome · Especialidade</div>
                  <div>Clínica</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">
          Em beta com dentistas da rede Método RNS / OdontoGrowth.
        </p>
      </section>

      {/* ===== PRICING — Good-Better-Best, anchoring, default highlight, mental accounting ===== */}
      <section id="precos" className="py-12">
        <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">Um plano. Paga como preferires.</h2>
        <p className="mt-2 text-center text-slate-600">
          Começa com 7 dias grátis. Cancela antes do fim e não és cobrado. Mensal ou anual — as mesmas funcionalidades.
        </p>

        <div className="mx-auto mt-8 grid max-w-2xl items-stretch gap-4 sm:grid-cols-2">
          {/* Monthly — the low-friction entry */}
          <PriceCard name="Mensal" price="9,90€" period="/mês" plan="monthly" cta="Começar trial" features={PLAN_FEATURES} />
          {/* Annual — anchored as the better value (saves ~2 months) */}
          <PriceCard
            name="Anual"
            price="99€"
            period="/ano"
            plan="annual"
            highlight
            note="≈ 2 meses grátis vs mensal"
            cta="Começar trial"
            features={PLAN_FEATURES}
          />
        </div>
        <p className="mx-auto mt-5 max-w-xl text-center text-sm text-slate-500">
          Uma hora do teu tempo clínico vale muito mais do que 9,90€/mês. O EvidentiaDental
          devolve-te várias por semana.
        </p>
      </section>

      {/* ===== PRATFALL — honest limits build trust ===== */}
      <section className="py-12">
        <div className="mx-auto max-w-2xl rounded-2xl border border-white/60 bg-white/55 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-semibold tracking-tight">Sejamos honestos sobre o que isto não é</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
            <li>— Não substitui uma revisão sistemática formal. Para isso, há tempo e método próprios.</li>
            <li>— A síntese é ao nível de abstract, não uma leitura integral de cada full text.</li>
            <li>— O PubMed continua gratuito. O que vendemos é o teu tempo e a tua tranquilidade.</li>
          </ul>
        </div>
      </section>

      {/* ===== FAQ — objection handling (Regret Aversion, Confirmation Bias) ===== */}
      <section className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Perguntas frequentes</h2>
        <div className="mt-6 divide-y divide-white/60 overflow-hidden rounded-2xl border border-white/60 bg-white/55 backdrop-blur-sm">
          {[
            { q: 'Porquê pagar se o PubMed é grátis?', a: 'O PubMed dá-te resultados crus; nós damos-te uma resposta fundamentada e citável em 90s. Pagas pelo tempo poupado e pela confiança de não citar algo falso.' },
            { q: 'A IA inventa referências, como o ChatGPT?', a: 'Não consegue. Cada PMID vem de uma chamada real às bases e um validador rejeita qualquer citação fora da lista de artigos encontrados.' },
            { q: 'Preciso de saber pesquisar no PubMed?', a: 'Não. Escreves em português; nós geramos o PICO e a query otimizada por ti.' },
            { q: 'E os artigos pagos?', a: 'Mostramos sempre as vias legais — open-access, PubMed Central e, se configurares, o teu acesso institucional (LibKey/EZproxy).' },
          ].map((item) => (
            <details key={item.q} className="group p-5">
              <summary className="flex cursor-pointer items-center justify-between font-medium text-slate-900">
                {item.q}
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ===== FINAL CTA — Reciprocity + single repeated action ===== */}
      <section className="py-16">
        <div className="card mx-auto max-w-2xl bg-gradient-to-br from-primary-50/70 to-white/70 text-center">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Começa o teu trial de 7 dias.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-slate-600">
            Cancela quando quiseres, sem compromisso. Vê uma síntese citada com os teus próprios olhos
            em menos de dois minutos.
          </p>
          <Link to={REGISTER} className="btn-primary mt-6 px-6 py-3 text-base">
            <Sparkles className="h-4 w-4" /> Começar trial
          </Link>
        </div>
      </section>
    </div>
  );
}

function Benefit({
  icon: Icon,
  title,
  children,
  className = '',
}: {
  icon: typeof Clock;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      <Icon className="h-6 w-6 text-primary-600" strokeWidth={1.75} />
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}

function PriceCard({
  name,
  price,
  period,
  features,
  cta,
  plan,
  highlight = false,
  note,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  plan: 'monthly' | 'annual';
  highlight?: boolean;
  note?: string;
}) {
  return (
    <div className={`card flex flex-col ${highlight ? 'border-primary-400 ring-1 ring-primary-200' : ''}`}>
      {highlight && (
        <span className="mb-2 self-start rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
          Recomendado
        </span>
      )}
      <div className="text-lg font-semibold">{name}</div>
      <div className="mt-1">
        <span className="text-3xl font-bold tracking-tight">{price}</span>
        <span className="text-sm text-slate-500">{period}</span>
      </div>
      {note && <div className="mt-1 text-xs text-primary-700">{note}</div>}
      <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
            {f}
          </li>
        ))}
      </ul>
      <Link to={`${REGISTER}&plan=${plan}`} className={`mt-5 ${highlight ? 'btn-primary' : 'btn-secondary'} w-full`}>
        {cta}
      </Link>
    </div>
  );
}
