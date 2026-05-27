/**
 * Seed a starter set of curated dental queries.
 *
 * These are EXAMPLES with is_validated = false. The clinical validation of each
 * PICO + PubMed query is Leonardo's job (it's the product moat) — run this to
 * bootstrap the table, then validate/edit each query in the DB or admin UI.
 *
 * Idempotent: skips a query if one with the same clinical_question already exists.
 *
 *   npm run seed:curated
 */

import { pool, query } from '../src/db/client.js';

interface CuratedSeed {
  area: string;
  subarea: string | null;
  clinical_question: string;
  description: string;
  pico_template: {
    population: string;
    intervention: string;
    comparator: string;
    outcomes: string[];
  };
  pubmed_query: string;
}

const SEEDS: CuratedSeed[] = [
  {
    area: 'Implantologia',
    subarea: 'Socket preservation',
    clinical_question: 'PRF em socket preservation após extração: melhora a preservação do rebordo alveolar?',
    description: 'Uso de fibrina rica em plaquetas (PRF) na preservação alveolar pós-extração.',
    pico_template: {
      population: 'Pacientes submetidos a extração dentária com necessidade de preservação alveolar',
      intervention: 'Platelet-rich fibrin (PRF) no alvéolo pós-extração',
      comparator: 'Cicatrização natural ou outro biomaterial',
      outcomes: ['Preservação de altura/largura óssea', 'Qualidade óssea', 'Cicatrização de tecidos moles'],
    },
    pubmed_query:
      '("platelet-rich fibrin"[tiab] OR PRF[tiab]) AND ("socket preservation"[tiab] OR "alveolar ridge preservation"[tiab] OR "tooth extraction"[mh]) AND humans[mh]',
  },
  {
    area: 'Implantologia',
    subarea: 'Peri-implantite',
    clinical_question: 'Laser Er:YAG no tratamento de peri-implantite: é eficaz vs desbridamento convencional?',
    description: 'Eficácia do laser Er:YAG na descontaminação de superfícies em peri-implantite.',
    pico_template: {
      population: 'Pacientes com peri-implantite',
      intervention: 'Laser Er:YAG',
      comparator: 'Desbridamento mecânico convencional',
      outcomes: ['Redução de profundidade de sondagem', 'Sangramento à sondagem', 'Nível ósseo radiográfico'],
    },
    pubmed_query:
      '("Er:YAG"[tiab] OR "erbium laser"[tiab]) AND (peri-implantitis[tiab] OR "peri-implant"[tiab]) AND humans[mh]',
  },
  {
    area: 'Periodontia',
    subarea: 'Mucosite peri-implantar',
    clinical_question: 'Ácido hialurónico na mucosite peri-implantar: a evidência atual suporta o uso?',
    description: 'Adjuvante de ácido hialurónico no tratamento de mucosite peri-implantar.',
    pico_template: {
      population: 'Pacientes com mucosite peri-implantar',
      intervention: 'Ácido hialurónico adjuvante',
      comparator: 'Desbridamento isolado',
      outcomes: ['Sangramento à sondagem', 'Índice de placa', 'Inflamação'],
    },
    pubmed_query:
      '("hyaluronic acid"[tiab]) AND ("peri-implant mucositis"[tiab] OR mucositis[tiab]) AND humans[mh]',
  },
  {
    area: 'Implantologia',
    subarea: 'Carga imediata',
    clinical_question: 'Implante imediato vs tardio em molar inferior: que outcomes diferem?',
    description: 'Comparação de protocolos de colocação imediata vs diferida em região posterior.',
    pico_template: {
      population: 'Pacientes com necessidade de implante em molar inferior',
      intervention: 'Implante imediato pós-extração',
      comparator: 'Implante tardio (diferido)',
      outcomes: ['Sobrevivência do implante', 'Estabilidade marginal óssea', 'Estética', 'Complicações'],
    },
    pubmed_query:
      '("immediate implant"[tiab] OR "immediate placement"[tiab]) AND ("delayed implant"[tiab] OR conventional[tiab]) AND (molar[tiab] OR posterior[tiab]) AND humans[mh]',
  },
  {
    area: 'Endodontia',
    subarea: 'Retratamento',
    clinical_question: 'Sucesso do retratamento endodôntico não-cirúrgico vs cirurgia apical?',
    description: 'Taxas de sucesso comparadas entre retratamento ortógrado e cirurgia perirradicular.',
    pico_template: {
      population: 'Pacientes com periodontite apical persistente após tratamento endodôntico',
      intervention: 'Retratamento endodôntico não-cirúrgico',
      comparator: 'Cirurgia apical (apicectomia)',
      outcomes: ['Taxa de sucesso/cura', 'Sobrevivência do dente', 'Cicatrização periapical'],
    },
    pubmed_query:
      '("endodontic retreatment"[tiab] OR "nonsurgical retreatment"[tiab]) AND ("apical surgery"[tiab] OR apicoectomy[tiab] OR "endodontic surgery"[tiab]) AND humans[mh]',
  },
  {
    area: 'Ortodontia',
    subarea: 'Alinhadores',
    clinical_question: 'Alinhadores transparentes vs aparelho fixo: que diferenças em controlo de movimento?',
    description: 'Eficácia de alinhadores vs brackets em diferentes tipos de movimento dentário.',
    pico_template: {
      population: 'Pacientes em tratamento ortodôntico',
      intervention: 'Alinhadores transparentes (clear aligners)',
      comparator: 'Aparelho fixo (brackets)',
      outcomes: ['Eficiência de movimento', 'Duração do tratamento', 'Saúde periodontal', 'Satisfação'],
    },
    pubmed_query:
      '("clear aligners"[tiab] OR "Invisalign"[tiab]) AND ("fixed appliance"[tiab] OR braces[tiab] OR brackets[tiab]) AND humans[mh]',
  },
  {
    area: 'DTM/Oclusão',
    subarea: 'Goteiras oclusais',
    clinical_question: 'Goteiras oclusais no tratamento de DTM muscular: são superiores a terapia conservadora?',
    description: 'Eficácia das goteiras oclusais em disfunção temporomandibular de origem muscular.',
    pico_template: {
      population: 'Pacientes com disfunção temporomandibular (DTM) muscular',
      intervention: 'Goteira oclusal (occlusal splint)',
      comparator: 'Terapia conservadora / placebo',
      outcomes: ['Dor (escala)', 'Função mandibular', 'Qualidade de vida'],
    },
    pubmed_query:
      '("occlusal splint"[tiab] OR "stabilization splint"[tiab]) AND ("temporomandibular"[tiab] OR TMD[tiab]) AND humans[mh]',
  },
  {
    area: 'Estética',
    subarea: 'Branqueamento',
    clinical_question: 'Branqueamento em consultório vs caseiro: que diferenças em eficácia e sensibilidade?',
    description: 'Comparação entre branqueamento profissional in-office e técnicas em casa.',
    pico_template: {
      population: 'Pacientes que procuram branqueamento dentário',
      intervention: 'Branqueamento em consultório (in-office)',
      comparator: 'Branqueamento caseiro (at-home)',
      outcomes: ['Alteração de cor', 'Sensibilidade dentária', 'Durabilidade do resultado'],
    },
    pubmed_query:
      '("in-office bleaching"[tiab] OR "in office whitening"[tiab]) AND ("at-home"[tiab] OR "home bleaching"[tiab]) AND (tooth[tiab] OR dental[tiab]) AND humans[mh]',
  },
];

async function seed() {
  let inserted = 0;
  let skipped = 0;

  for (const s of SEEDS) {
    const existing = await query('SELECT id FROM curated_queries WHERE clinical_question = $1', [
      s.clinical_question,
    ]);
    if (existing.rows.length > 0) {
      skipped++;
      continue;
    }
    await query(
      `INSERT INTO curated_queries (area, subarea, clinical_question, pico_template, pubmed_query, description, is_validated)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
      [s.area, s.subarea, s.clinical_question, JSON.stringify(s.pico_template), s.pubmed_query, s.description],
    );
    inserted++;
  }

  console.log(`[seed:curated] inserted ${inserted}, skipped ${skipped} (already present)`);
  console.log('[seed:curated] NOTE: all seeds are is_validated=false — validate clinically before relying on them.');
}

seed()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
