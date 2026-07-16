# Contexto

Esse é um dashboard de paid media (Next.js + TypeScript + Supabase, 
deploy na Vercel) já funcionando numa v1 que mostra spend por 
campanha/plataforma/data. Essa tarefa é uma EVOLUÇÃO desse projeto 
existente — trabalhe nos arquivos já criados, não recrie do zero.

Regra geral: nunca use dados mockados. Se uma query falhar ou um dado 
esperado não existir, mostre erro explícito — nunca esconda ou 
aproxime.

Antes de começar, teste se a leitura de `static_rules_geo_validation_ads_accounts` 
e `validation_geo_campaigns_country_bridge_v2` retorna dados via anon 
key (a mesma key já usada no `.env.local`). Se vier vazio ou erro de 
permissão, PARE e me avise exatamente qual das duas falhou.

# Mudança 1 — Separar spend por moeda (USD vs ARS)

Algumas contas HISPAM (Meta/Google/LinkedIn) são cobradas em ARS, não 
USD. A moeda de cada conta está em `static_rules_geo_validation_ads_accounts`:
- `platform` (text — "Meta", "Google", "LinkedIn")
- `ad_account_id` (text)
- `currency` (text — ex: "USD", "ARS")

Ao ler `data_meta_v2`, `data_google_v2`, `data_linkedin_v2`, faça JOIN 
com essa tabela por `ad_account_id` (comparação case-insensitive). Some 
o spend SEPARADO por moeda — nunca converta ARS↔USD, nunca some os dois 
num número só.

Se algum `ad_account_id` presente nos dados de spend NÃO tiver linha 
correspondente nessa tabela, isso é erro de dado que não deveria 
acontecer: pare e mostre erro claro identificando qual `ad_account_id` 
está sem moeda mapeada. Não assuma USD como fallback.

Nos cards de resumo, mostre o total em USD e o total em ARS como dois 
números separados. Na tabela de campanhas, adicione a coluna de moeda 
em cada linha.

# Mudança 2 — Filtro de região e país

Filtro cascateado (país depende da região selecionada), usando a VIEW 
`validation_geo_campaigns_country_bridge_v2`:
- `ad_account_id`, `campaign_id`, `campaign_name` (texto)
- `region_consolidated` (texto — ex: "HISPAM")
- `country_code` (texto — ex: "AR", "MX")
- outras colunas (geo_detection_source, geo_confidence, country_scope, 
  validation_run_date) — não usar na v1.

ATENÇÃO: um mesmo `campaign_id` pode ter MÚLTIPLAS linhas (uma por país, 
quando `country_scope = 'multi_country'`). Consolide por `campaign_id` 
antes de usar: agregue os `country_code` numa lista, e pegue o 
`region_consolidated` (assumindo mesmo valor pra todas as linhas do 
mesmo campaign_id — se encontrar valores diferentes, loggue mas não 
quebre a aplicação).

`campaign_id` sozinho já é único o suficiente pra dar join com as 3 
tabelas de spend.

Lógica do filtro:
- Região: só mostra campanhas cujo `region_consolidated` bate com a 
  selecionada
- País: só mostra campanhas cuja lista consolidada de países contém o 
  país selecionado
- Campanhas SEM nenhuma linha na view (não mapeadas): quando o filtro 
  de região OU país estiver ativo, são EXCLUÍDAS do resultado. Sem 
  filtro de região/país ativo, aparecem normalmente.
- As opções dos dropdowns vêm dos valores distintos que existem na 
  própria view (não hardcode a lista de regiões/países).

# Mudança 3 — Agregação por período, não por dia

Hoje a tabela mostra spend quebrado dia a dia. Mude para: somar o 
spend do PERÍODO INTEIRO selecionado no filtro de data, por campanha e 
por moeda (conforme Mudança 1). A tabela de campanhas deve ter UMA 
linha por campanha (não uma linha por campanha×dia). Isso precisa 
continuar respondendo a todos os filtros (data, plataforma, região, 
país) — mudar qualquer filtro reagrega tudo de novo, não só refiltra 
uma tabela dia-a-dia já calculada.

# Mudança 4 — Visual + troca de idioma

**Visual**: base é a linha CLARA e oficial da Humand (tokens do 
`PaidMediaDashboard.jsx` deste projeto):

bg: #f5f6f8, surface: #ffffff, ink: #303036, inkSoft: #636271,
inkFaint: #aaaaba, border: #eeeef1
brand50: #f1f4fd, brand100: #dee5fb, brand400: #6f93eb,
brand500: #496be3, brand600: #3851d8, brand900: #29317f
shadow4: -1px 4px 8px 0px rgba(233,233,244,1)
shadow8: -1px 8px 16px 0px rgba(170,170,186,0.45)
fontFamily: Roboto, system-ui, sans-serif
easing: [0.16, 1, 0.3, 1] (aproximação de inOutExpo)

Mantenha os padrões de motion desse arquivo: reveal-on-scroll com 
`useInView` (fade + slide de 24px, stagger leve entre cards), números 
que "contam" até o valor com `useMotionValue`/`animate`, pill de filtro 
com `layoutId` fazendo transição spring entre opções, cards com 
`border-radius: 16px` e a `shadow4` como sombra padrão.

Accent de cor vem do `DashboardHome.jsx` (paleta anime.js), usado com 
MODERAÇÃO — não trocar fundo pra dark, só aplicar essas cores em 
elementos de destaque (indicador de moeda, badge de plataforma, estado 
ativo de filtro, glow sutil em hover):

cyan: #6fd1e7, cyanDim: #46badd, purple: #9785ff, teal: #35a48e

Sugestão de uso: badge de moeda ARS em `purple`, USD em `cyan`; cores 
de plataforma podem seguir `Meta: cyan, Google: purple, LinkedIn: 
cyanDim` (mesmo mapeamento do `CHANNEL_COLORS` do arquivo dark). Pode 
usar um glow radial sutil (`radial-gradient`) nos cards de resumo, 
como feito no `DashboardHome.jsx`, mas em tom mais discreto por estar 
sobre fundo claro.

Se o ambiente tiver a skill `design-system-foundations` disponível, 
consulte-a antes de aplicar qualquer cor/tipografia pra garantir que 
os tokens estão atualizados — não confie de olho nos valores acima se 
a skill disser algo diferente.

**Troca de idioma**: botão no canto da tela (ex: canto superior direito) 
que alterna entre PT (padrão) → EN → ES, ciclando ou como dropdown 
pequeno. Só traduz TEXTO ESTRUTURAL da interface — labels de filtro 
("Região", "Plataforma", "De", "Até", "Campanha", "Moeda", títulos de 
seção, mensagens de erro/loading, etc). NUNCA traduz dado que vem do 
Supabase (nomes de campanha, códigos de país, nomes de plataforma como 
"Meta"/"Google"/"LinkedIn" ficam como estão).

Implementar como um dicionário de traduções simples (objeto JS com 
chaves tipo `filters.region`, `filters.dateFrom`, `table.campaign`, 
`errors.currencyMissing`, etc, com os 3 idiomas), consumido via um hook 
ou contexto de idioma. Persistir a escolha em localStorage pra manter 
ao recarregar a página.

# Critério de aceite

- Spend em USD e ARS aparecem separados em todo lugar, nunca somados
- Erro claro e visível se algum ad_account_id não tiver moeda mapeada
- Filtro de região e país funcionam em cascata e realmente refiltram
- Campanhas não mapeadas na view de geo desaparecem corretamente quando 
  região/país está filtrado, e reaparecem quando não está
- Tabela mostra uma linha por campanha (spend somado do período), não 
  mais por dia
- Botão de idioma troca PT/EN/ES e persiste ao recarregar; nenhum dado 
  do Supabase é traduzido, só o texto estrutural
- Visual usa os tokens claros oficiais como base, com cyan/purple/teal 
  só como accent em elementos específicos (moeda, plataforma, estados 
  ativos) — não um redesign completo pra dark

Antes de escrever código, me mostre o plano (join de moeda e geo na API 
route, estrutura do dicionário de tradução, e onde exatamente vai 
aplicar cada cor de accent) pra eu confirmar antes de você seguir.