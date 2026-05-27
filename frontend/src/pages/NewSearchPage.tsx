import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';

const EXAMPLES = [
  'Vale a pena fazer PRF em socket preservation após extração de molar?',
  'Implante imediato vs tardio em molar inferior: que outcomes diferem?',
  'Ácido hialurónico na mucosite peri-implantar: a evidência suporta o uso?',
  'Quão eficaz é o laser Er:YAG no tratamento de peri-implantite?',
];

const STEPS = [
  { n: '01', label: 'PICO', body: 'Convertemos a tua pergunta em estrutura PICO + query PubMed.' },
  { n: '02', label: 'Busca', body: 'Executamos no PubMed, Europe PMC e ClinicalTrials.gov.' },
  { n: '03', label: 'Síntese', body: 'Mini-síntese clínica com cada PMID validado.' },
];

export function NewSearchPage() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = question.trim().length < 10;

  async function handleSubmit() {
    if (tooShort) {
      setError('A pergunta tem que ter pelo menos 10 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.createSearch(question);
      navigate(`/searches/${result.search.id}`);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="grid animate-fade-up gap-10 lg:grid-cols-[1.5fr_1fr]">
      {/* Composer */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary-600">
          Pergunta clínica
        </span>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-900 md:text-4xl">
          O que diz a evidência?
        </h1>
        <p className="mt-3 max-w-xl leading-relaxed text-slate-600">
          Escreve em linguagem natural. Convertemos em PICO, executamos a busca real e devolvemos uma
          síntese com citações verificadas.
        </p>

        <div className="mt-6 rounded-2xl border border-white/60 bg-white/75 shadow-card transition focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-500/20">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
            placeholder="Ex: vale a pena fazer PRF em socket preservation após extração de molar?"
            rows={4}
            className="w-full resize-none rounded-2xl bg-transparent px-5 py-4 text-base leading-relaxed placeholder:text-slate-400 focus:outline-none"
            disabled={loading}
            autoFocus
          />
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-400">
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px]">⌘</kbd>
              {' + '}
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
              {' '}para analisar
            </span>
            <button onClick={handleSubmit} disabled={loading || tooShort} className="btn-primary">
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> A gerar PICO…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Analisar pergunta</>
              )}
            </button>
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        <div className="mt-7">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Experimenta</div>
          <div className="flex flex-col gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setQuestion(ex)}
                className="group flex items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/65 px-4 py-3 text-left text-sm text-slate-700 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white/85 hover:shadow-card"
              >
                <span>{ex}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-primary-500" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* How it works rail */}
      <aside className="lg:pt-12">
        <div className="rounded-2xl border border-white/60 bg-white/75 p-6 shadow-card">
          <h2 className="text-sm font-semibold text-slate-900">Como funciona</h2>
          <ol className="mt-4 divide-y divide-slate-100">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <span className="font-mono text-sm font-medium text-primary-600">{s.n}</span>
                <div>
                  <div className="text-sm font-medium text-slate-900">{s.label}</div>
                  <div className="mt-0.5 text-sm leading-relaxed text-slate-500">{s.body}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-4 px-1 text-xs leading-relaxed text-slate-400">
          Nenhum PMID é inventado pelo modelo. Cada identificador vem de uma chamada real às bases
          científicas.
        </p>
      </aside>
    </div>
  );
}
