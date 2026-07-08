# Contexto

Estou construindo um dashboard de paid media para a Humand (empresa B2B), 
que vai rodar na Vercel e usar Supabase como fonte de dados. Essa é a 
primeira versão: o objetivo é ter dados REAIS e funcionando, sem 
preocupação com design ainda (isso vem depois). Nunca use dados mockados 
ou fictícios — se algo não estiver disponível ou a query falhar, mostre 
um estado de erro/vazio explícito em vez de inventar números.

# Stack

- Next.js (App Router) + TypeScript
- pnpm como package manager
- Tailwind (só utilitário básico, sem preocupação estética por agora)
- Supabase JS client (@supabase/supabase-js) — leitura via API routes 
  do Next.js, não direto no client
- Deploy: Vercel
- Repositório novo, pessoal (não é dentro de um monorepo existente)
- Sem autenticação nessa etapa — dashboard aberto, isso entra depois

# Dados (Supabase)

Três tabelas de paid media, uma por plataforma. ATENÇÃO: os nomes de 
coluna NÃO são iguais entre elas — normalize tudo pra um formato único 
antes de retornar na API.

## data_google_v2
- campaign_id (text)
- campaign_name (text)
- spend (double precision)   ← nome diferente das outras duas!
- date (date)                ← nome diferente das outras duas!
- ad_account_id (text)
- dt_h_recording_data (timestamp with time zone) — timestamp de quando 
  o ETL gravou a linha, NÃO é a data da métrica. Não use pra filtro de 
  período, só como metadado de "última atualização" se precisar.

## data_meta_v2
- campaign_id (text)
- campaign_name (text)
- cost (double precision)     ← equivalente a spend
- date_start (date)           ← equivalente a date
- ad_account_id (text)
- dt_h_recording_data (timestamp with time zone)

## data_linkedin_v2
- campaign_id (text)
- campaign_name (text)
- cost (double precision)     ← equivalente a spend
- date_start (date)           ← equivalente a date
- ad_account_id (text)
- dt_h_recording_data (timestamp with time zone)

Normalize as 3 pra um shape único, por exemplo:
{ platform: 'google' | 'meta' | 'linkedin', campaign_id, campaign_name,
ad_account_id, spend: number, date: string }

IMPORTANTE: essas tabelas NÃO têm impressions, clicks, nem breakdown por 
adset/ad. Não calcule CTR, CPC ou qualquer métrica que dependa disso — 
essa v1 é só sobre spend. Se o código tiver algum lugar pra essas 
métricas no futuro, deixe estruturado pra receber depois, mas não 
invente valor nem esconda que não existe.

Exemplo de linha real (data_google_v2):
```json
{
  "campaign_name": "GAds_Lead_Gen_BOFU_BRAZIL_Brasil_Search_Brand",
  "spend": 16.01619,
  "date": "2026-05-29",
  "ad_account_id": "1805339996",
  "campaign_id": "23584392642"
}
```

# Acesso ao Supabase

- RLS está ativo nas 3 tabelas, mas existe policy "allow anon read" para 
  o role anon nas 3 — então a anon key É SUFICIENTE pra leitura, não 
  precisa de service role key.
- As env vars já existem no meu .env como SUPABASE_URL e SUPABASE_KEY 
  (mesmo padrão usado nos scripts Python do projeto). Use esses MESMOS 
  nomes no .env.local do Next.js, sem prefixo NEXT_PUBLIC_ (a leitura é 
  só server-side, dentro da API route, o client nunca chama o Supabase 
  direto).

# O que construir (v1 — só o essencial funcionando)

1. **API route** (`/api/paid-media`) que:
   - Lê as 3 tabelas do Supabase
   - Normaliza pro shape único descrito acima
   - Aceita filtros via query params: `from`, `to` (intervalo de datas) 
     e `platform` (opcional: google/meta/linkedin)
   - Retorna erro claro em JSON se a query falhar (não silencia erro)

2. **Página única de dashboard** (`/`) com:
   - Cards de resumo: spend total, spend por plataforma (breakdown 
     simples, tipo 3 números lado a lado)
   - Filtro de data (range) e filtro de plataforma (Google/Meta/
     LinkedIn/Todas)
   - Tabela com spend por campanha, ordenável por spend (maior pro 
     menor), mostrando: plataforma, nome da campanha, spend, data
   - Loading state enquanto busca dados
   - Estado de erro visível se a API falhar

3. Sem gráficos, animações ou componentes visuais elaborados nesta 
   etapa. Foco 100% em dado real, correto e responsivo (funciona em 
   mobile também).

# Setup esperado

- Criar o projeto com `create-next-app` (App Router, TypeScript, 
  Tailwind)
- Instruções claras de como rodar localmente (`pnpm install && pnpm dev`)
- Deixar pronto para deploy na Vercel (só precisa das env vars 
  SUPABASE_URL e SUPABASE_KEY configuradas lá também)

# Critério de aceite

- Rodando localmente, o spend total dos cards bate com uma query manual 
  feita direto no SQL Editor do Supabase (eu vou validar isso)
- Filtro de data e de plataforma realmente refiltram os dados
- Nenhum dado mockado em nenhum lugar do código
- Nenhuma métrica inventada (nada de CTR/CPC/impressions/clicks — não 
  existem nos dados)
- Responsivo (funciona numa tela de celular sem quebrar)

Antes de escrever código, me mostre o plano de implementação (estrutura 
de pastas, formato de resposta da API, e como vai normalizar os 3 
formatos de coluna) para eu confirmar antes de você seguir.