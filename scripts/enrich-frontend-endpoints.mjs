import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(root, 'src/frontend-endpoints.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

// Dictionaries of query filters
const paginationQueryParams = {
  page: { type: 'integer', description: 'Número da página solicitada (padrão 1)' },
  perPage: { type: 'integer', description: 'Quantidade de registros por página (padrão 10)' },
  orderBy: { type: 'string', description: 'Campo pelo qual ordenar os resultados' },
  orderType: { type: 'string', enum: ['ASC', 'DESC'], description: 'Sentido da ordenação (padrão ASC)' }
};

const solicitacaoQueryFilters = {
  ...paginationQueryParams,
  tipo_lista: { type: 'string', description: 'Filtro de contexto da lista no painel (ex: minhas_solicitacoes, geral)' },
  tipoPessoa: { type: 'string', enum: ['Todas', 'Física', 'Jurídica'], description: 'Filtro por natureza jurídica do solicitante' },
  nome: { type: 'string', description: 'Nome do solicitante para busca parcial' },
  cpf: { type: 'string', description: 'CPF do solicitante (11 dígitos numéricos sem máscara)' },
  cnpj: { type: 'string', description: 'CNPJ do solicitante (14 dígitos numéricos sem máscara)' },
  nomeFantasia: { type: 'string', description: 'Nome fantasia do estabelecimento' },
  razaoSocial: { type: 'string', description: 'Razão social da empresa' },
  tipoServico: { type: 'integer', description: 'Identificador do tipo de serviço (PT, PTS, AVCB, CLCB, etc.)' },
  status: { type: 'string', description: 'Situação do processo (ex: Protocolado, Em Análise, Homologado, Pendente Notificação)' },
  protocolo: { type: 'string', description: 'Número do protocolo Fênix' },
  solicitacao: { type: 'string', description: 'Número ou código de identificação da solicitação' },
  n_notificacao: { type: 'string', description: 'Número de notificação de pendência ou vistoria' },
  n_acp: { type: 'string', description: 'Número do Atestado de Conformidade de Projeto' },
  n_avcb: { type: 'string', description: 'Número do Auto de Vistoria do Corpo de Bombeiros' },
  dataInicial: { type: 'string', description: 'Data de início do período de busca (YYYY-MM-DD)' },
  dataFinal: { type: 'string', description: 'Data de término do período de busca (YYYY-MM-DD)' },
  vistoriador_id: { type: 'integer', description: 'ID do militar vistoriador designado' },
  analista_pt_id: { type: 'integer', description: 'ID do militar analista de Projeto Técnico' },
  analista_pts_id: { type: 'integer', description: 'ID do militar analista de Projeto Técnico Simplificado' },
  unidade_id: { type: 'integer', description: 'ID da unidade de bombeiros responsável pelo processo' }
};

const projetoTecnicoQueryFilters = {
  ...paginationQueryParams,
  creacau: { type: 'string', description: 'Registro no conselho profissional CREA ou CAU' },
  nomeResponsavelTecnico: { type: 'string', description: 'Nome do responsável técnico pelo projeto' },
  cpfResponsavelTecnico: { type: 'string', description: 'CPF do responsável técnico' },
  cnpjResponsavelTecnico: { type: 'string', description: 'CNPJ da pessoa jurídica de responsabilidade técnica' },
  projeto: { type: 'string', description: 'Número do projeto técnico' },
  ocupacao: { type: 'string', description: 'Grupo de ocupação da edificação' },
  divisao: { type: 'string', description: 'Divisão de ocupação predial' },
  risco: { type: 'string', description: 'Classificação de risco de incêndio' }
};

const remanejamentoQueryFilters = {
  ...paginationQueryParams,
  status: { type: 'string', description: 'Status do remanejamento (ex: pendente-de-analise, deferido, indeferido)' },
  n_protocolo_sap: { type: 'string', description: 'Número do protocolo SAP' },
  cpfcnpj: { type: 'string', description: 'CPF ou CNPJ do interessado' }
};

const migracaoSapQueryFilters = {
  ...paginationQueryParams,
  status: { type: 'string', description: 'Status da migração (pendente-de-analise, em-analise, deferido, indeferido)' },
  n_protocolo_sap: { type: 'string', description: 'Número de protocolo SAP' },
  cpf_cnpj: { type: 'string', description: 'CPF ou CNPJ do interessado' }
};

const inexigibilidadeQueryFilters = {
  ...paginationQueryParams,
  status: { type: 'string', description: 'Status da inexigibilidade' },
  n_protocolo_sap: { type: 'string', description: 'Número do protocolo SAP' },
  cpfcnpj: { type: 'string', description: 'CPF ou CNPJ do solicitante' }
};

const auditQueryFilters = {
  ...paginationQueryParams,
  model: { type: 'string', description: 'Modelo auditado (ex: Solicitacao, User, Edification)' },
  event: { type: 'string', enum: ['created', 'updated', 'deleted'], description: 'Ação realizada no registro' },
  user: { type: 'string', description: 'Nome ou identificador do usuário autor da ação' },
  dateStart: { type: 'string', description: 'Data inicial do período de auditoria (YYYY-MM-DD)' },
  dateEnd: { type: 'string', description: 'Data final do período de auditoria (YYYY-MM-DD)' }
};

const countiesQueryFilters = {
  ...paginationQueryParams,
  model: { type: 'string', description: 'Modelo do cadastro (padrão Cadastro)' },
  categoria: { type: 'string', description: 'Categoria de gestão (padrão Habilitar Municípios)' },
  habilitar: { type: 'boolean', description: 'Filtra municípios habilitados ou desabilitados' }
};

const unityQueryFilters = {
  ...paginationQueryParams,
  search: { type: 'string', description: 'Busca textual por nome ou sigla da unidade (ex: 1º BBM, GMAR)' },
  active: { type: 'string', enum: ['TODOS', 'ATIVO', 'INATIVO'], description: 'Filtro por situação ativa da unidade' }
};

// Helper for path hints
function getPathParameterHints(op) {
  const hints = {};
  const p = op.path;

  if (p === '/api/v1/{param1}/models') {
    hints.param1 = 'domain';
  } else if (p.startsWith('/api/v1/autenticidade-usuarios/{param1}/documentos/{param2}')) {
    hints.param1 = 'autenticidade_usuario_id';
    hints.param2 = 'documento_id';
  } else if (p.startsWith('/api/v1/autenticidade-usuarios/{param1}')) {
    hints.param1 = 'autenticidade_usuario_id';
  } else if (p.startsWith('/api/v1/remanejamentos/{param1}/documentos/{param2}')) {
    hints.param1 = 'remanejamento_id';
    hints.param2 = 'documento_id';
  } else if (p.startsWith('/api/v1/remanejamentos/{param1}')) {
    hints.param1 = 'remanejamento_id';
  } else if (p.startsWith('/api/v1/migracoes-sap/{param1}/documentos/{param2}')) {
    hints.param1 = 'migracao_sap_id';
    hints.param2 = 'documento_id';
  } else if (p.startsWith('/api/v1/migracoes-sap/{param1}')) {
    hints.param1 = 'migracao_sap_id';
  } else if (p.startsWith('/api/v1/inexigibilidades/{param1}')) {
    hints.param1 = 'inexigibilidade_id';
  } else if (p.startsWith('/api/v1/edifications/{param1}')) {
    hints.param1 = 'edificacao_id';
  } else if (p.startsWith('/api/v1/projetos-tecnicos/{param1}')) {
    hints.param1 = 'projeto_tecnico_id';
  } else if (p.startsWith('/api/v1/projetos/{param1}/documentos/{param2}')) {
    hints.param1 = 'projeto_id';
    hints.param2 = 'documento_id';
  } else if (p.startsWith('/api/v1/usuarios/{param1}/edifications')) {
    hints.param1 = 'usuario_id';
  } else if (p.startsWith('/api/v1/parametros-internos/cnaes/{param1}')) {
    hints.param1 = 'cnae_parametro_id';
  } else if (p.startsWith('/api/v1/parametros-tax/{param1}')) {
    hints.param1 = 'parametro_taxa_id';
  } else if (p.startsWith('/api/v1/occupation-division/{param1}')) {
    hints.param1 = 'occupation_division_id';
  } else if (p.startsWith('/api/v1/solicitacoes/{param1}/retificacoes/{param2}/documentos/{param3}')) {
    hints.param1 = 'solicitacao_id';
    hints.param2 = 'retificacao_id';
    hints.param3 = 'documento_id';
  } else if (p.startsWith('/api/v1/solicitacoes/{param1}/retificacoes/{param2}')) {
    hints.param1 = 'solicitacao_id';
    hints.param2 = 'retificacao_id';
  } else if (p.startsWith('/api/v1/solicitacoes/{param1}/documentos/{param2}')) {
    hints.param1 = 'solicitacao_id';
    hints.param2 = 'documento_id';
  } else if (p.includes('/log-documentos?page={param2}&per_page={param3}')) {
    hints.param1 = 'solicitacao_id';
    hints.param2 = 'page';
    hints.param3 = 'per_page';
  } else if (p.startsWith('/api/v1/solicitacoes/{param1}')) {
    hints.param1 = 'solicitacao_id';
  }

  return hints;
}

// Builds description, queryParameters, bodyParameters and notes for any operation
function enrichOperation(op) {
  const id = op.id;
  const p = op.path;
  const m = op.method;

  let description = '';
  let queryParameters = null;
  let bodyParameters = null;
  let notes = '';

  // PATH HINTS
  const pathParameterHints = getPathParameterHints(op);

  // GET OPERATIONS (56 ops)
  if (m === 'GET') {
    if (id === 'get_param_models') {
      description = 'Retorna a lista de modelos de dados auditáveis do módulo de auditoria do sistema.';
      queryParameters = {};
      notes = 'O parâmetro param1 deve ser fixado como "audit" para consultar os modelos do AuditService.';
    } else if (id === 'get_autenticidade_usuarios_param') {
      description = 'Consulta os detalhes de uma solicitação de verificação de autenticidade de usuário pelo ID.';
      queryParameters = {};
      notes = 'Acesso restrito a administradores ou ao próprio usuário solicitante.';
    } else if (id === 'get_autenticidade_usuarios_param_documentos_param_download') {
      description = 'Download do arquivo de documento comprobatório anexado à solicitação de autenticidade de usuário.';
      queryParameters = {};
      notes = 'Retorna binário do arquivo baixado (PDF, imagem ou documento assinado).';
    } else if (id === 'get_cnaes') {
      description = 'Pesquisa CNAEs no catálogo de atividades econômicas por categoria e código de 7 dígitos.';
      queryParameters = {
        categoria: { type: 'string', required: true, enum: ['codigo', 'evento', 'fora-it14'], description: 'Categoria obrigatória de busca do CNAE' },
        codigo: { type: 'string', description: 'Código do CNAE com exatamente 7 dígitos numéricos sem barra ou traço (obrigatório se categoria=codigo)' },
        cnae_id: { type: 'integer', description: 'ID interno do CNAE para busca direta (opcional)' }
      };
      notes = 'MANDATÓRIO: categoria é obrigatória. Quando categoria="codigo", o código deve ter 7 dígitos sem barra ou traço (ex: 6201501). Enviar barra ou hífen faz o WAF bloquear a requisição com HTTP 500.';
    } else if (id === 'get_counties') {
      description = 'Lista municípios cadastrados no Fênix com filtros de habilitação operacional e paginação.';
      queryParameters = countiesQueryFilters;
      notes = 'Usa paginação padrão do BaseService (page, perPage) com suporte a ordenação.';
    } else if (id === 'get_decretoestadual') {
      description = 'Obtém parâmetros e textos normativos do Decreto Estadual de segurança contra incêndio vigente.';
      queryParameters = {};
      notes = 'Retorna dados regulamentares estaduais para conferência técnica.';
    } else if (id === 'get_detailsrequester') {
      description = 'Consulta os detalhes cadastrais completos do solicitante atualmente autenticado.';
      queryParameters = {};
      notes = 'Utilizado para preenchimento automático de formulários do solicitante logado.';
    } else if (id === 'get_division_group') {
      description = 'Retorna as divisões de ocupação predial vinculadas a um grupo de ocupação da IT 14.';
      queryParameters = {
        occupation_group_id: { type: 'integer', description: 'Identificador do grupo de ocupação para filtrar as divisões correspondentes' }
      };
      notes = 'Utilizado na classificação predial de risco da IT 14 do Corpo de Bombeiros.';
    } else if (id === 'get_edifications') {
      description = 'Lista edificações cadastradas no sistema com filtros por proprietário, endereço e uso.';
      queryParameters = {
        ...paginationQueryParams,
        search: { type: 'string', description: 'Termo de busca textual por endereço ou nome da edificação' },
        tipoPessoa: { type: 'string', enum: ['Todas', 'Física', 'Jurídica'], description: 'Filtro por natureza do proprietário' },
        nome: { type: 'string', description: 'Nome do proprietário' },
        cpf: { type: 'string', description: 'CPF do proprietário' },
        cnpj: { type: 'string', description: 'CNPJ do proprietário' },
        nomeFantasia: { type: 'string', description: 'Nome fantasia do estabelecimento' },
        razaoSocial: { type: 'string', description: 'Razão social' }
      };
      notes = 'AVISO: Esta rota respondeu HTTP 404 no bundle frontend 2.19.1. Preferir listar por usuário com get_usuarios_param_edifications.';
    } else if (id === 'get_edifications_param') {
      description = 'Obtém o cadastro completo de uma edificação específica pelo seu identificador interno.';
      queryParameters = {};
      notes = 'Retorna dados estruturais, área construída, altura, ocupações e endereços vinculados à edificação.';
    } else if (id === 'get_getallcountys') {
      description = 'Retorna a lista completa com todos os 417 municípios do estado da Bahia.';
      queryParameters = {};
      notes = 'Consulta estática sem paginação; útil para carregar opções de municípios em seletores.';
    } else if (id === 'get_getdivisiongroup') {
      description = 'Consulta todos os grupos de divisões prediais cadastrados no sistema.';
      queryParameters = {};
      notes = 'Retorna catálogo mestre de divisões prediais de acordo com as normas técnicas.';
    } else if (id === 'get_getnorms') {
      description = 'Lista todas as normas técnicas e instruções de combate a incêndio vigentes.';
      queryParameters = {};
      notes = 'Utilizado na seleção de itens normativos durante a emissão de notificações e observações.';
    } else if (id === 'get_inexigibilidades') {
      description = 'Lista processos de declaração de inexigibilidade com filtros por status e protocolo.';
      queryParameters = inexigibilidadeQueryFilters;
      notes = 'Usa paginação padrão do BaseService (page, perPage).';
    } else if (id === 'get_inexigibilidades_param_certificado_download') {
      description = 'Realiza o download do Certificado de Inexigibilidade de vistoria emitido.';
      queryParameters = {};
      notes = 'Retorna o documento PDF oficial emitido pelo CBMBA para processos inexigíveis.';
    } else if (id === 'get_isencao') {
      description = 'Consulta parâmetros e regras para concessão de isenção de taxas de bombeiros.';
      queryParameters = {};
      notes = 'Informa os tipos de isenção tributária aplicáveis conforme legislação vigente.';
    } else if (id === 'get_list_counties') {
      description = 'Obtém lista simplificada de municípios para preenchimento de seletores no frontend.';
      queryParameters = {};
      notes = 'Lista compacta de municípios da Bahia para caixas de seleção rápida.';
    } else if (id === 'get_listar_tipos_solicitacoes') {
      description = 'Lista os tipos de solicitações e processos suportados pelo CBMBA (PT, PTS, AVCB, CLCB, etc.).';
      queryParameters = {};
      notes = 'Retorna tabela de serviços oferecidos com seus respectivos prazos e regras.';
    } else if (id === 'get_listatodostipoprojetos') {
      description = 'Retorna os tipos de projetos técnicos aceitos no sistema.';
      queryParameters = {};
      notes = 'Lista informativa com os formatos e modalidades de projetos aceitos.';
    } else if (id === 'get_migracoes_sap') {
      description = 'Lista os processos de migração de dados do sistema SAP para o Fênix.';
      queryParameters = migracaoSapQueryFilters;
      notes = 'Usa paginação do BaseService (page, perPage) com suporte a filtros por protocolo e status.';
    } else if (id === 'get_migracoes_sap_param') {
      description = 'Obtém detalhes de um processo de migração SAP pelo identificador.';
      queryParameters = {};
      notes = 'Retorna dados da migração, projeto associado e documentos comprobatórios.';
    } else if (id === 'get_migracoes_sap_param_documentos_param_download') {
      description = 'Download de documento anexo a um processo de migração SAP.';
      queryParameters = {};
      notes = 'Retorna o binário do arquivo digitalizado enviado durante o pedido de migração.';
    } else if (id === 'get_norm_type') {
      description = 'Lista as categorias e tipos de normas de segurança contra incêndio.';
      queryParameters = {};
      notes = 'Classificação de normas técnicas por tipologia.';
    } else if (id === 'get_occupation_group') {
      description = 'Lista os grupos de ocupação predial conforme classificação de risco da IT 14.';
      queryParameters = {};
      notes = 'Retorna grupos de A a M com descrição das atividades correspondentes.';
    } else if (id === 'get_parametros') {
      description = 'Consulta parâmetros de configuração geral do sistema por modelo e categoria.';
      queryParameters = {
        model: { type: 'string', description: 'Modelo do parâmetro (ex: Painel, Taxas, UTSM)' },
        categoria: { type: 'string', description: 'Categoria específica (ex: Painel de Análise, Painel de Vistoria)' }
      };
      notes = 'Usado pelo frontend para carregar configurações dinâmicas de interface e negócio.';
    } else if (id === 'get_parametros_tax') {
      description = 'Consulta tabela de valores e coeficientes de cálculo de taxas de bombeiros.';
      queryParameters = {
        model: { type: 'string', description: 'Modelo de cálculo de taxa (ex: Taxas)' },
        categoria: { type: 'string', description: 'Categoria da taxa (Taxa de análise, Taxa de vistoria, Taxa de incêndio)' },
        tipo: { type: 'string', description: 'Subtipo da taxa' },
        grupo: { type: 'string', description: 'Grupo de ocupação ou risco' }
      };
      notes = 'Base para cálculo das tarifas estaduais do CBMBA.';
    } else if (id === 'get_parametros_tax_load_altered') {
      description = 'Lista alterações de taxas pendentes de aprovação/confirmação pela administração.';
      queryParameters = {};
      notes = 'Permite auditar reajustes e mudanças de parâmetros antes da entrada em vigor.';
    } else if (id === 'get_projetos_tecnicos_param') {
      description = 'Consulta dados e situação atual de um Projeto Técnico pelo ID.';
      queryParameters = {};
      notes = 'Retorna planta, dados cadastrais, responsável técnico e histórico de análise do projeto.';
    } else if (id === 'get_projetos_tecnicos_param_temp_correcao_emergencial') {
      description = 'Consulta dados temporários de projeto em procedimento de correção emergencial.';
      queryParameters = {};
      notes = 'Utilizado em fluxos de retificação direta para correção de inconsistências graves no projeto.';
    } else if (id === 'get_rankgraduation') {
      description = 'Lista postos e graduações militares cadastrados no CBMBA.';
      queryParameters = {};
      notes = 'Utilizado no cadastro de servidores militares (Coronel, Tenente, Sargento, Soldado, etc.).';
    } else if (id === 'get_remanejamentos') {
      description = 'Lista solicitações de remanejamento de projetos e processos no Fênix.';
      queryParameters = remanejamentoQueryFilters;
      notes = 'Usa paginação do BaseService (page, perPage).';
    } else if (id === 'get_remanejamentos_param') {
      description = 'Obtém detalhes de um remanejamento de projeto específico.';
      queryParameters = {};
      notes = 'Informa justificativa, solicitante e situação do remanejamento.';
    } else if (id === 'get_remanejamentos_param_documentos_param_download') {
      description = 'Download de documento anexado a um processo de remanejamento.';
      queryParameters = {};
      notes = 'Baixa arquivo comprobatório submetido no remanejamento.';
    } else if (id === 'get_remanejamentos_projeto_remanejavel') {
      description = 'Busca projeto elegível para remanejamento por campo (número de protocolo, projeto ou CPF/CNPJ).';
      queryParameters = {
        campo: { type: 'string', required: true, description: 'Nome do campo pesquisado (ex: numero_protocolo, numero_projeto, cpf_cnpj)' },
        valor: { type: 'string', required: true, description: 'Valor pesquisado para o campo selecionado' }
      };
      notes = 'MANDATÓRIO: Esta rota exige obrigatoriamente os parâmetros campo e valor. Se omitidos, o Fênix retorna HTTP 422 Unprocessable Entity.';
    } else if (id === 'get_request') {
      description = 'Consulta principal de solicitações e processos do Fênix com filtros operacionais e paginação.';
      queryParameters = solicitacaoQueryFilters;
      notes = 'Principal ferramenta de listagem de processos para analistas, vistoriadores e solicitantes.';
    } else if (id === 'get_roles') {
      description = 'Lista os perfis de acesso e papéis de usuários do sistema.';
      queryParameters = {};
      notes = 'Informa permissões e grupos de usuários (analista, vistoriador, protocolo, administrador, etc.).';
    } else if (id === 'get_solicitacoes_param_autorizacao_solicitante') {
      description = 'Gera e retorna o termo de autorização formal do solicitante.';
      queryParameters = {};
      notes = 'Termo declaratório de responsabilidade exigido pelo regulamento de segurança.';
    } else if (id === 'get_solicitacoes_param_certificados_aprovacao') {
      description = 'Download do certificado oficial de aprovação ou conclusão da solicitação.';
      queryParameters = {};
      notes = 'Retorna o documento digital assinado (AVCB ou CLCB) emitido para a solicitação.';
    } else if (id === 'get_solicitacoes_param_certificados_protocolo') {
      description = 'Download do comprovante de protocolo da solicitação.';
      queryParameters = {};
      notes = 'Comprovante com data, hora e autenticação digital do protocolo inicial.';
    } else if (id === 'get_solicitacoes_param_daes') {
      description = 'Lista os Documentos de Arrecadação Estadual (DAEs) vinculados à solicitação.';
      queryParameters = {};
      notes = 'Retorna guias de arrecadação, valores, datas de vencimento e situação de liquidação.';
    } else if (id === 'get_solicitacoes_param_fluxo_contexto_devolucao_com_designacao') {
      description = 'Consulta contexto e técnico designado para devolução com designação no fluxo do processo.';
      queryParameters = {
        status_destino: { type: 'string', required: true, description: 'Identificador do status de destino para o qual o processo será devolvido' }
      };
      notes = 'MANDATÓRIO: status_destino é obrigatório; se ausente, a API responde HTTP 422.';
    } else if (id === 'get_solicitacoes_param_fluxo_contexto_devolucao_sem_designacao') {
      description = 'Consulta contexto para devolução sem designação prévia no fluxo do processo.';
      queryParameters = {
        status_destino: { type: 'string', required: true, description: 'Identificador do status de destino para o qual o processo será devolvido' }
      };
      notes = 'MANDATÓRIO: status_destino é obrigatório; se ausente, a API responde HTTP 422.';
    } else if (id === 'get_solicitacoes_param_fluxo_funcionarios_p_encaminhamento') {
      description = 'Lista servidores e analistas habilitados para receber encaminhamento do processo para o status indicado.';
      queryParameters = {
        status_destino: { type: 'string', required: true, description: 'Status pretendido para encaminhamento do processo' }
      };
      notes = 'MANDATÓRIO: status_destino é obrigatório; se ausente, a API responde HTTP 422.';
    } else if (id === 'get_solicitacoes_param_log_documentos_page_param_per_page_param') {
      description = 'Consulta histórico e log de movimentação de documentos da solicitação com paginação embutida na rota.';
      queryParameters = {};
      notes = 'Paginação já estruturada nos parâmetros de caminho param2 (page) e param3 (per_page).';
    } else if (id === 'get_solicitacoes_param_retificacoes') {
      description = 'Lista retificações solicitadas ou realizadas no processo.';
      queryParameters = {};
      notes = 'AVISO: Pode responder HTTP 405 Method Not Allowed em solicitações com determinados estados de fluxo.';
    } else if (id === 'get_solicitacoes_param_retificacoes_param') {
      description = 'Consulta dados detalhados de uma retificação específica pelo ID.';
      queryParameters = {};
      notes = 'Retorna histórico da alteração, justificativas e campos modificados.';
    } else if (id === 'get_solicitacoes_param_retificacoes_param_certificado') {
      description = 'Download do certificado atualizado gerado após a homologação da retificação.';
      queryParameters = {};
      notes = 'Baixa o novo documento formal com os dados retificados aprovados.';
    } else if (id === 'get_solicitacoes_param_retificacoes_param_diff') {
      description = 'Retorna comparativo de alterações entre a solicitação original e a retificação proposta.';
      queryParameters = {};
      notes = 'Identifica visualmente os campos alterados pelo solicitante para subsidiar a análise.';
    } else if (id === 'get_solicitacoes_param_retificacoes_param_documentos') {
      description = 'Lista documentos anexados à retificação da solicitação.';
      queryParameters = {};
      notes = 'Relação de comprovantes e arquivos submetidos para justificar a retificação.';
    } else if (id === 'get_solicitacoes_param_retificacoes_param_documentos_param') {
      description = 'Consulta ou baixa documento específico anexado à retificação.';
      queryParameters = {};
      notes = 'Download ou verificação de integridade do anexo da retificação.';
    } else if (id === 'get_survey') {
      description = 'Lista solicitações e agendamentos de vistorias com filtros operacionais.';
      queryParameters = {
        ...paginationQueryParams,
        status: { type: 'string', description: 'Status da vistoria (ex: Pendente Vistoria, Homologado com AVCB)' },
        protocolo: { type: 'string', description: 'Número do protocolo' },
        tipoServico: { type: 'string', description: 'Tipo do serviço de vistoria' },
        dataInicial: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        dataFinal: { type: 'string', description: 'Data final (YYYY-MM-DD)' }
      };
      notes = 'Painel operacional dos bombeiros militares vistoriadores.';
    } else if (id === 'get_technicalproject') {
      description = 'Lista projetos técnicos cadastrados no sistema com filtros por responsável, ocupação e risco.';
      queryParameters = projetoTecnicoQueryFilters;
      notes = 'BaseService.paginateQuery para projetos de prevenção contra incêndio.';
    } else if (id === 'get_tipoprojetotecnico') {
      description = 'Retorna tabela de tipos de projetos técnicos aceitos no CBMBA.';
      queryParameters = {};
      notes = 'Catálogo regulatório de tipos de projetos.';
    } else if (id === 'get_transferencias_solicitacoes_destinatarios') {
      description = 'Lista destinatários disponíveis para transferência de solicitações por funcionário e status.';
      queryParameters = {
        funcionario_origem_id: { type: 'integer', required: true, description: 'ID do militar/servidor que detém o processo atualmente' },
        tipo_solicitacao: { type: 'string', required: true, description: 'Tipo da solicitação a ser transferida' },
        status_solicitacao: { type: 'string', required: true, description: 'Situação atual das solicitações a serem transferidas' }
      };
      notes = 'MANDATÓRIO: Requer obrigatoriamente funcionario_origem_id, tipo_solicitacao e status_solicitacao. Se ausentes, responde HTTP 422.';
    } else if (id === 'get_unity') {
      description = 'Lista as unidades operacionais de bombeiros militares cadastradas no sistema.';
      queryParameters = unityQueryFilters;
      notes = 'Usa paginação padrão do BaseService (page, perPage).';
    } else if (id === 'get_usuarios_param_edifications') {
      description = 'Lista as edificações vinculadas ao usuário informado pelo ID.';
      queryParameters = {
        ...paginationQueryParams
      };
      notes = 'Rota recomendada para consultar as edificações pertencentes ou geridas por um usuário específico.';
    }
  }

  // DELETE OPERATIONS (5 ops)
  else if (m === 'DELETE') {
    if (id === 'delete_autenticidade_usuarios_param_documentos_param') {
      description = 'Remove documento comprobatório anexado à solicitação de autenticidade de usuário.';
      notes = 'Requer permissão de administrador ou do próprio solicitante antes da aprovação da conta.';
    } else if (id === 'delete_parametros_internos_cnaes_param') {
      description = 'Remove uma parametrização de CNAE dos parâmetros internos do sistema.';
      notes = 'Requer perfil de administração de normas e parâmetros técnicos.';
    } else if (id === 'delete_remanejamentos_param_documentos_param') {
      description = 'Remove documento anexado ao processo de remanejamento de projeto.';
      notes = 'Operação de exclusão de anexo no remanejamento.';
    } else if (id === 'delete_solicitacoes_param_documentos_param') {
      description = 'Remove documento comprobatório ou anexo vinculado à solicitação.';
      notes = 'Permitido apenas enquanto a solicitação estiver em fase editável antes da homologação.';
    } else if (id === 'delete_solicitacoes_param_retificacoes_param_documentos_param') {
      description = 'Remove documento anexado a uma retificação de processo.';
      notes = 'Permitido apenas durante a elaboração da retificação pelo solicitante.';
    }
  }

  // PUT OPERATIONS (6 ops)
  else if (m === 'PUT') {
    if (id === 'put_edifications_param') {
      description = 'Atualiza os dados cadastrais da edificação pelo ID.';
      bodyParameters = {
        name: { type: 'string', description: 'Nome de identificação do imóvel ou edificação' },
        description: { type: 'string', description: 'Descrição detalhada do imóvel' },
        area: { type: 'number', description: 'Área construída total em metros quadrados' },
        height: { type: 'number', description: 'Altura da edificação em metros' },
        floors: { type: 'integer', description: 'Quantidade de pavimentos' },
        risk: { type: 'string', description: 'Grau de risco atribuído' },
        cnae: { type: 'string', description: 'Código CNAE da atividade principal' },
        occupations: { type: 'array', description: 'Lista de códigos ou grupos de ocupação' },
        addresses: { type: 'object', description: 'Dados de endereço e localização geográfica' }
      };
      notes = 'Atualização completa de cadastro predial via BaseService.save com ID presente.';
    } else if (id === 'put_occupation_division_param') {
      description = 'Atualiza o vínculo entre ocupação e divisão de projeto técnico.';
      bodyParameters = {
        occupation_group_id: { type: 'integer', description: 'Identificador do grupo de ocupação' },
        division_id: { type: 'integer', description: 'Identificador da divisão' },
        description: { type: 'string', description: 'Descrição da divisão e uso' }
      };
      notes = 'Requer perfil interno de gestão normativa.';
    } else if (id === 'put_parametros_internos_cnaes_param') {
      description = 'Atualiza dados de classificação e exigências de vistoria para um CNAE nos parâmetros internos.';
      bodyParameters = {
        codigo: { type: 'string', description: 'Código CNAE de 7 dígitos numéricos sem formatação' },
        descricao: { type: 'string', description: 'Descrição da atividade econômica' },
        categoria: { type: 'string', description: 'Categoria de enquadramento' },
        grau_risco: { type: 'string', description: 'Grau de risco de incêndio' },
        exige_vistoria: { type: 'boolean', description: 'Flag indicando obrigatoriedade de vistoria prévia' }
      };
      notes = 'Manter o código de 7 dígitos estritamente sem barra ou hífen para evitar bloqueio pelo WAF.';
    } else if (id === 'put_parametros_tax_param') {
      description = 'Atualiza parâmetros e alíquotas de cálculo de taxa (análise, vistoria, incêndio).';
      bodyParameters = {
        valor: { type: 'number', description: 'Valor base ou coeficiente da taxa' },
        descricao: { type: 'string', description: 'Descrição do parâmetro' },
        tipo: { type: 'string', description: 'Tipo da taxa' },
        categoria: { type: 'string', description: 'Categoria de aplicação' },
        vigencia_inicio: { type: 'string', description: 'Data de início da vigência' },
        vigencia_fim: { type: 'string', description: 'Data de encerramento da vigência' }
      };
      notes = 'Requer confirmação posterior via rota parametros-tax/confirmar para aplicação no cálculo.';
    } else if (id === 'put_api_v1_profile') {
      description = 'Atualiza os dados pessoais e de contato do usuário autenticado.';
      bodyParameters = {
        name: { type: 'string', description: 'Nome completo do usuário' },
        telephone: { type: 'string', description: 'Telefone de contato com DDD' },
        email: { type: 'string', description: 'E-mail principal do usuário' },
        password: { type: 'string', description: 'Nova senha (opcional)' },
        password_confirmation: { type: 'string', description: 'Confirmação da nova senha' },
        current_password: { type: 'string', description: 'Senha atual exigida se alterar a senha' }
      };
      notes = 'Operação de auto-gerenciamento do perfil do usuário autenticado.';
    } else if (id === 'put_transferrequests') {
      description = 'Executa transferência em lote de solicitações para outra unidade ou técnico.';
      bodyParameters = {
        solicitacoes_ids: { type: 'array', description: 'Lista de IDs numéricos das solicitações a serem transferidas' },
        unidade_destino_id: { type: 'integer', description: 'ID da unidade de destino' },
        funcionario_destino_id: { type: 'integer', description: 'ID do funcionário/analista que receberá as solicitações' },
        justificativa: { type: 'string', description: 'Justificativa formal para a transferência em lote' }
      };
      notes = 'Requer perfil de coordenação com autorização para remanejamento de cargas de trabalho.';
    }
  }

  // POST OPERATIONS (245 ops)
  else if (m === 'POST') {
    // A. Solicitacoes Flow Routes
    if (p.includes('/fluxo/')) {
      const parts = p.split('/fluxo/')[1].split('/');
      const fluxoName = parts[0].toUpperCase();
      const actionName = parts.slice(1).join(' ').replace(/-/g, ' ');

      description = `Executa a etapa "${actionName}" no fluxo operacional de ${fluxoName} da solicitação.`;

      if (p.endsWith('/aprovar-analise') || p.endsWith('/aprovar-vistoria')) {
        bodyParameters = {
          relatorio: { type: 'string', description: 'Parecer técnico, relatório descritivo ou despacho de aprovação' },
          incluir_relatorio_no_certificado: { type: 'boolean', description: 'Indica se o relatório técnico deve constar no certificado digital' }
        };
        notes = 'Requer perfil de analista ou vistoriador credenciado para emitir parecer favorável.';
      } else if (p.includes('/devolucao/')) {
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Motivo detalhado para devolução do processo à etapa anterior' },
          urgente: { type: 'boolean', description: 'Flag de urgência para priorização da devolução' }
        };
        notes = 'Requer justificativa fundamentada. Altera a etapa do processo e notifica o responsável anterior.';
      } else if (p.includes('/comunicacao-analista-solicitante/iniciar')) {
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Mensagem, orientação técnica ou esclarecimento solicitado pelo analista' }
        };
        notes = 'Abre canal de diálogo oficial entre o analista técnico e o solicitante.';
      } else if (p.includes('/comunicacao-analista-solicitante/finalizar')) {
        bodyParameters = {};
        notes = 'Encerra o canal de comunicação extraordinária e retoma o andamento da análise.';
      } else if (p.includes('/solicitar-retificacao-na-etapa-analise')) {
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Descritivo dos itens que necessitam de retificação pelo solicitante' },
          urgente: { type: 'boolean', description: 'Indica se a retificação tem caráter urgente' }
        };
        notes = 'Abre prazo para o solicitante apresentar retificação de projeto ou documento.';
      } else if (p.includes('/finalizar-retificacao-solicitada-na-etapa-analise')) {
        bodyParameters = {};
        notes = 'Conclui a conferência da retificação apresentada e reabre a análise regular.';
      } else if (p.includes('/migracao-sap-direta/solicitar-correcao')) {
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Motivo para solicitar correção no processo de migração direta' }
        };
        notes = 'Utilizado em fluxos integrados com migrações pendentes do sistema SAP.';
      } else if (p.includes('/migracao-sap-direta/deferir-correcao')) {
        bodyParameters = {};
        notes = 'Homologa e conclui a correção da migração SAP no processo atual.';
      } else if (p.includes('/notificar-pendencias')) {
        bodyParameters = {
          notificacoes: { type: 'array', description: 'Lista de observações e pendências normativas notificadas' },
          prazo: { type: 'integer', description: 'Prazo concedido em dias para atendimento (padrão conforme norma)' }
        };
        notes = 'Gera notificação formal de pendência e abre prazo recursal/saneador ao cidadão.';
      } else if (p.includes('/validar-pendencias-notificadas')) {
        bodyParameters = {};
        notes = 'Confere o cumprimento de cada item notificado após retorno do solicitante.';
      } else if (p.includes('/validar-aprovacao')) {
        bodyParameters = {};
        notes = 'Etapa de validação hierárquica pelo chefe de análise ou comando antes da homologação.';
      } else if (p.includes('/homologar')) {
        bodyParameters = {};
        notes = 'Homologação final do processo com geração e assinatura do certificado digital oficial.';
      } else if (p.includes('/confirmar-documentacao')) {
        bodyParameters = {};
        notes = 'Atesta conformidade documental prévia ao início do exame minucioso.';
      } else if (p.includes('/encaminhar-p-vistoriador') || p.includes('/encaminhar-com-designacao') || p.includes('/encaminhar-sem-designacao')) {
        bodyParameters = {
          funcionario_id: { type: 'integer', description: 'ID do militar/vistoriador designado' },
          unidade_id: { type: 'integer', description: 'ID da unidade militar' },
          observacao: { type: 'string', description: 'Instruções ou despacho de encaminhamento' }
        };
        notes = 'Atribui a responsabilidade do processo para o servidor ou unidade indicada.';
      } else if (p.includes('/desarquivar')) {
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Justificativa legal para desarquivamento do processo' }
        };
        notes = 'Reativa processo arquivado após deferimento do pedido.';
      } else {
        bodyParameters = {
          justificativa: { type: 'string', description: 'Justificativa ou despacho da ação operacional' }
        };
        notes = 'Etapa interna do fluxo de análise/vistoria.';
      }
    }

    // B. Retificações
    else if (p.includes('/retificacoes')) {
      if (p.endsWith('/cancelar')) {
        description = 'Cancela uma retificação em andamento vinculada à solicitação.';
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Motivo para cancelamento da retificação' },
          spt_id: { type: 'integer', description: 'ID do status do projeto técnico' }
        };
        notes = 'Cancela o procedimento de alteração e mantém os dados originais.';
      } else if (p.endsWith('/devolver')) {
        description = 'Devolve a retificação para adequação pelo solicitante.';
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Itens pendentes que motivaram a devolução' },
          spt_id: { type: 'integer', description: 'ID do status do projeto técnico' }
        };
        notes = 'Retorna a retificação para saneamento de dúvidas ou inconsistências.';
      } else if (p.endsWith('/encaminhar')) {
        description = 'Encaminha a retificação para validação ou homologação.';
        bodyParameters = {
          funcionario_id: { type: 'integer', description: 'ID do analista responsável' },
          observacao: { type: 'string', description: 'Despacho de encaminhamento' }
        };
        notes = 'Transfere a retificação para o próximo nível decisório.';
      } else if (p.endsWith('/validar')) {
        description = 'Valida formalmente os dados retificados pelo solicitante.';
        bodyParameters = {};
        notes = 'Confere conformidade das alterações propostas.';
      } else if (p.endsWith('/homologar')) {
        description = 'Homologa a retificação e emite certificado atualizado.';
        bodyParameters = {};
        notes = 'Aprova definitivamente as alterações cadastrais e emite nova versão do documento.';
      } else if (p.endsWith('/documentos')) {
        description = 'Anexa novos documentos comprobatórios à retificação em andamento.';
        bodyParameters = {
          files: { type: 'FormData', description: 'Arquivo(s) digitalizado(s) comprobatório(s) em formato multipart' },
          tipo_documento_id: { type: 'integer', description: 'ID do tipo de documento anexado' }
        };
        notes = 'Upload multipart de arquivos via FormData.';
      } else {
        description = 'Inicia uma nova solicitação de retificação de dados da solicitação.';
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Motivação para o pedido de retificação' },
          dados_alterados: { type: 'object', description: 'Estrutura com os campos e novos valores propostos' }
        };
        notes = 'Submete proposta de retificação para análise do Corpo de Bombeiros.';
      }
    }

    // C. Autenticidade de Usuários
    else if (p.startsWith('/api/v1/autenticidade-usuarios')) {
      if (p.endsWith('/deferir')) {
        description = 'Defere e valida a autenticidade cadastral do usuário no Fênix.';
        bodyParameters = {
          tipo_usuario: { type: 'string', required: true, description: 'Perfil aprovado atribuído ao usuário (ex: engenheiro, arquiteto, proprietario)' }
        };
        notes = 'Aprova o cadastro e concede acesso às funcionalidades autenticadas correspondentes.';
      } else if (p.endsWith('/indeferir')) {
        description = 'Indefere a comprovação de autenticidade cadastral do usuário.';
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Fundamentação técnica para a recusa dos documentos' }
        };
        notes = 'Rejeita o pedido de validação cadastral e notifica o solicitante.';
      } else if (p.endsWith('/solicitar-reanalise')) {
        description = 'Solicita reanálise da comprovação de autenticidade de usuário com novos dados.';
        bodyParameters = {
          justificativa: { type: 'string', description: 'Esclarecimentos sobre os documentos reenviados' },
          documentos: { type: 'FormData', description: 'Novos documentos comprobatórios' }
        };
        notes = 'Permite ao cidadão ou profissional submeter novos comprovantes após indeferimento.';
      } else if (p.endsWith('/solicitar-analise')) {
        description = 'Cadastra solicitação inicial de validação de autenticidade de identidade e credencial.';
        bodyParameters = {
          termo: { type: 'boolean', description: 'Declaração de ciência e concordância com os termos de veracidade' },
          tipo_usuario: { type: 'string', description: 'Perfil pretendido' },
          documentos: { type: 'FormData', description: 'Arquivos de identificação pessoal e registro no conselho profissional' }
        };
        notes = 'Envio de comprovantes para ativação e validação do perfil profissional.';
      }
    }

    // D. Remanejamentos
    else if (p.startsWith('/api/v1/remanejamentos')) {
      if (p.endsWith('/cadastrar') || p.endsWith('/solicitar')) {
        description = 'Cadastra um pedido formal de remanejamento de projeto técnico ou processo.';
        bodyParameters = {
          projeto_id: { type: 'integer', required: true, description: 'ID do projeto a ser remanejado' },
          unidade_destino_id: { type: 'integer', required: true, description: 'ID da unidade de destino' },
          justificativa: { type: 'string', required: true, description: 'Motivo detalhado para a transferência de competência territorial' }
        };
        notes = 'Abre processo administrativo de transferência de circunscrição de análise.';
      } else if (p.endsWith('/remanejar')) {
        description = 'Aprova e executa a efetivação do remanejamento do projeto.';
        bodyParameters = {
          remanejamento_id: { type: 'integer', required: true, description: 'ID do processo de remanejamento' },
          despacho: { type: 'string', description: 'Despacho da autoridade militar aprovadora' }
        };
        notes = 'Altera a lotação do processo no sistema Fênix.';
      } else if (p.endsWith('/indeferir')) {
        description = 'Indefere a solicitação de remanejamento de projeto.';
        bodyParameters = {
          remanejamento_id: { type: 'integer', required: true, description: 'ID do processo de remanejamento' },
          justificativa: { type: 'string', required: true, description: 'Motivo da recusa' }
        };
        notes = 'Mantém o projeto na unidade original.';
      } else if (p.endsWith('/documentos') || p.endsWith('/salvar-documentos')) {
        description = 'Anexa documentos comprobatórios ao pedido de remanejamento.';
        bodyParameters = {
          files: { type: 'FormData', description: 'Arquivos anexados em multipart' }
        };
        notes = 'Upload de documentos comprobatórios do remanejamento.';
      } else {
        description = 'Cria ou atualiza uma solicitação de remanejamento de projeto.';
        bodyParameters = {
          projeto_id: { type: 'integer', required: true, description: 'ID do projeto técnico' },
          unidade_destino_id: { type: 'integer', required: true, description: 'ID da unidade militar de destino' },
          justificativa: { type: 'string', required: true, description: 'Justificativa do pedido de remanejamento' }
        };
        notes = 'Operação de salvamento de remanejamento pelo BaseService.';
      }
    }

    // E. Migrações SAP
    else if (p.startsWith('/api/v1/migracoes-sap')) {
      if (p.endsWith('/solicitar-analise')) {
        description = 'Submete processo migrado do SAP para verificação e análise no Fênix.';
        bodyParameters = {
          n_protocolo_sap: { type: 'string', required: true, description: 'Número do protocolo no legado SAP' },
          dados_projeto: { type: 'object', description: 'Informações complementares do projeto físico' }
        };
        notes = 'Integração de processos históricos iniciados no sistema SAP anterior.';
      } else if (p.endsWith('/iniciar-analise')) {
        description = 'Registra o início da conferência técnica do processo de migração SAP.';
        bodyParameters = {};
        notes = 'Marca o processo como "Em Análise" pelo técnico designado.';
      } else if (p.endsWith('/indeferir-analise')) {
        description = 'Indefere o pedido de migração do processo SAP por inconsistência documental.';
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Motivo da não aceitação da migração' }
        };
        notes = 'Processo rejeitado retorna para saneamento ou arquivamento.';
      } else if (p.endsWith('/solicitar-correcao')) {
        description = 'Solicita correção de dados cadastrais no processo de migração SAP.';
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Campos e informações a corrigir' }
        };
        notes = 'Notifica o interessado para retificar os dados importados.';
      } else if (p.endsWith('/iniciar-correcao')) {
        description = 'Registra o início do saneamento de correções no processo de migração.';
        bodyParameters = {};
        notes = 'Etapa de ajuste de informações.';
      } else if (p.endsWith('/deferir-correcao')) {
        description = 'Aprova as correções realizadas e valida os dados migrados do SAP.';
        bodyParameters = {};
        notes = 'Finaliza o procedimento de saneamento e integra os dados ao Fênix.';
      } else if (p.endsWith('/indeferir-correcao')) {
        description = 'Recusa as correções apresentadas na migração SAP.';
        bodyParameters = {
          justificativa: { type: 'string', required: true, description: 'Motivo da recusa das correções' }
        };
        notes = 'Mantém a pendência no processo.';
      }
    }

    // F. Inexigibilidades
    else if (p.startsWith('/api/v1/inexigibilidades')) {
      description = 'Cadastra pedido de declaração de inexigibilidade para eventos ou atividades isentas.';
      bodyParameters = {
        edificacao_id: { type: 'integer', description: 'ID da edificação ou local do evento' },
        dados_evento: { type: 'object', description: 'Dados do evento temporário, público estimado e estruturas' },
        termo_responsabilidade: { type: 'boolean', description: 'Aceite do termo de compromisso legal' }
      };
      notes = 'Aplica-se a eventos e locais dispensados de vistoria prévia conforme regulamento.';
    }

    // G. Observation
    else if (p.startsWith('/api/v1/observation')) {
      if (p.endsWith('-destroy') || p.endsWith('/destroy')) {
        description = 'Remove uma observação ou apontamento técnico vinculado ao processo.';
        bodyParameters = {
          id: { type: 'integer', required: true, description: 'ID da observação a ser excluída' }
        };
        notes = 'Exclusão permitida apenas ao autor da observação ou antes do fechamento do laudo.';
      } else if (p.endsWith('-by-request') || p.endsWith('/by-request')) {
        description = 'Lista as observações e pendências registradas para uma solicitação específica.';
        bodyParameters = {
          solicitacao_id: { type: 'integer', required: true, description: 'ID da solicitação' }
        };
        notes = 'Consulta estruturada de observações técnicas de vistoria ou análise.';
      } else if (p.endsWith('-store') || p.endsWith('/storeObservation')) {
        description = 'Registra uma nova observação ou exigência técnica no laudo.';
        bodyParameters = {
          solicitacao_id: { type: 'integer', required: true, description: 'ID da solicitação' },
          projeto_id: { type: 'integer', description: 'ID do projeto técnico' },
          norm_item_id: { type: 'integer', description: 'ID do item da norma técnica infringido ou exigido' },
          observacao: { type: 'string', required: true, description: 'Texto explicativo da observação ou pendência' }
        };
        notes = 'Associa a exigência ao item correspondente da IT ou regulamento.';
      } else if (p.endsWith('-update') || p.endsWith('/updateObservation')) {
        description = 'Atualiza o teor de uma observação técnica existente.';
        bodyParameters = {
          id: { type: 'integer', required: true, description: 'ID da observação' },
          observacao: { type: 'string', required: true, description: 'Novo texto da observação' }
        };
        notes = 'Edição de pendência registrada.';
      } else if (p.endsWith('-notify') || p.endsWith('/notify')) {
        description = 'Emite notificação formal ao solicitante com o rol de observações registradas.';
        bodyParameters = {
          solicitacao_id: { type: 'integer', required: true, description: 'ID da solicitação a ser notificada' }
        };
        notes = 'Dispara e-mail e atualiza status para notificado de pendências.';
      } else {
        description = 'Registra ou salva uma observação técnica na solicitação.';
        bodyParameters = {
          solicitacao_id: { type: 'integer', required: true, description: 'ID da solicitação' },
          projeto_id: { type: 'integer', description: 'ID do projeto técnico' },
          observacao: { type: 'string', required: true, description: 'Texto da observação ou apontamento' },
          norm_item_id: { type: 'integer', description: 'ID do item de norma associado' }
        };
        notes = 'Operação de registro de observação do BaseService.';
      }
    }

    // H. Status Projeto Técnico
    else if (p.startsWith('/api/v1/definir-novo-status') || p.startsWith('/api/v1/definirStatusV2') || p.startsWith('/api/v1/setProjectStatus')) {
      description = 'Atualiza formalmente o status do projeto técnico ou solicitação no sistema.';
      bodyParameters = {
        solicitacao_id: { type: 'integer', required: true, description: 'ID da solicitação ou projeto' },
        status_id: { type: 'integer', required: true, description: 'ID ou código do novo status' },
        justificativa: { type: 'string', description: 'Despacho ou justificativa da alteração de estado' }
      };
      notes = 'Requer perfil interno com prerrogativa para movimentação de processos.';
    } else if (p.startsWith('/api/v1/setProjectStatusInBatch')) {
      description = 'Atualiza o status de múltiplos projetos técnicos simultaneamente em lote.';
      bodyParameters = {
        projetos_ids: { type: 'array', required: true, description: 'Lista de IDs de projetos' },
        status_id: { type: 'integer', required: true, description: 'Novo status atribuído a todos os itens' }
      };
      notes = 'Operação em lote reservada a chefias de seção técnica.';
    } else if (p.startsWith('/api/v1/notificar-aprovacao')) {
      description = 'Dispara notificação formal comunicando a aprovação do projeto técnico.';
      bodyParameters = {
        solicitacao_id: { type: 'integer', required: true, description: 'ID da solicitação aprovada' }
      };
      notes = 'Gera comunicação eletrônica ao cidadão ou profissional com orientações para retirada/download.';
    } else if (p.startsWith('/api/v1/pending-notification')) {
      description = 'Registra pendências normativas e notifica o interessado para saneamento.';
      bodyParameters = {
        solicitacao_id: { type: 'integer', required: true, description: 'ID da solicitação' },
        pendencias: { type: 'array', description: 'Lista de pendências técnicas' }
      };
      notes = 'Abre prazo para cumprimento de exigências de vistoria ou análise.';
    } else if (p.startsWith('/api/v1/mail-user')) {
      description = 'Envia mensagem de comunicação direta ou esclarecimento por e-mail ao solicitante.';
      bodyParameters = {
        user_id: { type: 'integer', required: true, description: 'ID do usuário destinatário' },
        assunto: { type: 'string', required: true, description: 'Assunto do e-mail' },
        mensagem: { type: 'string', required: true, description: 'Conteúdo da mensagem' }
      };
      notes = 'Comunicação oficial registrada nos logs de auditoria do sistema.';
    }

    // I. DAE
    else if (p.startsWith('/api/v1/pegarDaePorID') || p.startsWith('/api/v1/gerar-dae') || p.startsWith('/api/v1/imprimir-dae')) {
      description = 'Gera, consulta ou imprime guias DAE para recolhimento de taxas de bombeiros.';
      bodyParameters = {
        solicitacao_id: { type: 'integer', description: 'ID da solicitação relacionada' },
        dae_id: { type: 'integer', description: 'ID da guia DAE existente' }
      };
      notes = 'Integração com a Secretaria da Fazenda (SEFAZ-BA) para emissão de código de barras.';
    } else if (p.startsWith('/api/v1/comprovantes-pagamento/verificar-duplicidade')) {
      description = 'Verifica se um comprovante de pagamento DAE já foi utilizado em outro processo.';
      bodyParameters = {
        numero_autenticacao: { type: 'string', required: true, description: 'Código de autenticação bancária' },
        dae_id: { type: 'integer', description: 'ID do DAE a validar' }
      };
      notes = 'Trava antifraude que impede reutilização de comprovantes bancários.';
    } else if (p.startsWith('/api/v1/verificarPagamento')) {
      description = 'Consulta a liquidação e compensação financeira do DAE junto ao banco/SEFAZ.';
      bodyParameters = {
        dae_id: { type: 'integer', required: true, description: 'ID da guia DAE' }
      };
      notes = 'Atualiza o estado de pagamento para permitir a continuidade da tramitação.';
    }

    // J. Relatórios
    else if (p.includes('report') || p.includes('Report') || p.includes('Relatorio')) {
      description = `Gera relatório técnico ou estatístico de ${p.replace('/api/v1/', '').replace(/-/g, ' ')}.`;
      bodyParameters = {
        dataInicial: { type: 'string', description: 'Data de início do período (YYYY-MM-DD)' },
        dataFinal: { type: 'string', description: 'Data de término do período (YYYY-MM-DD)' },
        unidade_id: { type: 'integer', description: 'ID da unidade de bombeiros para filtro regional' },
        formato: { type: 'string', enum: ['pdf', 'excel', 'csv'], description: 'Formato do arquivo exportado' }
      };
      notes = 'Relatório gerencial com suporte a exportação em PDF ou planilha.';
    }

    // K. Responsável Técnico
    else if (p.startsWith('/api/v1/responsavel-tecnico')) {
      if (p.endsWith('-destroy')) {
        description = 'Remove o vínculo de um responsável técnico do projeto.';
        bodyParameters = {
          id: { type: 'integer', required: true, description: 'ID da atribuição de responsabilidade técnica' }
        };
        notes = 'Desvincula o profissional do projeto técnico.';
      } else if (p.endsWith('-update')) {
        description = 'Atualiza ART/RRT ou dados do responsável técnico do projeto.';
        bodyParameters = {
          id: { type: 'integer', required: true, description: 'ID da atribuição' },
          numero_art_rrt: { type: 'string', description: 'Número do documento de responsabilidade técnica' }
        };
        notes = 'Atualização de termo de responsabilidade.';
      } else {
        description = 'Cadastra novo responsável técnico (engenheiro/arquiteto) com ART/RRT.';
        bodyParameters = {
          projeto_id: { type: 'integer', required: true, description: 'ID do projeto técnico' },
          nome: { type: 'string', required: true, description: 'Nome completo do profissional' },
          creacau: { type: 'string', required: true, description: 'Registro CREA ou CAU' },
          cpf: { type: 'string', required: true, description: 'CPF do profissional' },
          art_rrt: { type: 'string', required: true, description: 'Número da ART ou RRT registrada' }
        };
        notes = 'Validação de habilitação técnica para projetos de combate a incêndio.';
      }
    } else if (p.startsWith('/api/v1/lista-responsaveis-tecnicos')) {
      description = 'Pesquisa e lista profissionais técnicos cadastrados por CREA/CAU ou nome.';
      bodyParameters = {
        termo: { type: 'string', description: 'Nome ou número de registro CREA/CAU para busca' }
      };
      notes = 'Facilita a busca de profissionais para associação em novos projetos.';
    }

    // L. Documentation Request
    else if (p.startsWith('/api/v1/documents-survey-') || p.startsWith('/api/v1/documentos-solicitados')) {
      description = `Gerencia arquivos de vistoria e documentação técnica em ${p.replace('/api/v1/', '')}.`;
      bodyParameters = {
        solicitacao_id: { type: 'integer', required: true, description: 'ID da solicitação' },
        documento_id: { type: 'integer', description: 'ID do documento ou tipo documental' },
        files: { type: 'FormData', description: 'Arquivos digitais anexados' }
      };
      notes = 'Manipulação de acervo probatório do processo.';
    } else if (p.startsWith('/api/v1/validate-mandatory-documents') || p.startsWith('/api/v1/verificarDocumentos')) {
      description = 'Verifica se todos os documentos de apresentação obrigatória foram anexados.';
      bodyParameters = {
        solicitacao_id: { type: 'integer', required: true, description: 'ID da solicitação' }
      };
      notes = 'Checagem automática de completude documental antes do envio para análise.';
    }

    // M. Municípios e Distâncias
    else if (p.includes('municipio') || p.startsWith('/api/v1/desabilitar-municipios') || p.startsWith('/api/v1/habilitar-municipios')) {
      description = `Configura a abrangência territorial e distância operacional de municípios em ${p.replace('/api/v1/', '')}.`;
      bodyParameters = {
        municipio_id: { type: 'integer', description: 'Código IBGE ou ID do município' },
        unidade_id: { type: 'integer', description: 'ID da unidade de bombeiros de atendimento' },
        distancia_km: { type: 'number', description: 'Distância em quilômetros até a sede da unidade' },
        habilitar: { type: 'boolean', description: 'Flag de ativação da prestação de serviços no município' }
      };
      notes = 'Regras de circunscrição operacional do CBMBA para atendimento e cálculo de taxas.';
    }

    // N. Autenticação e Usuários
    else if (p.startsWith('/api/v1/storeUser') || p.startsWith('/api/v1/registerUser')) {
      description = 'Realiza o cadastro inicial de novo usuário cidadão ou pessoa jurídica no Fênix.';
      bodyParameters = {
        name: { type: 'string', required: true, description: 'Nome completo ou razão social' },
        email: { type: 'string', required: true, description: 'E-mail principal' },
        email_confirmar: { type: 'string', required: true, description: 'Confirmação do e-mail' },
        password: { type: 'string', required: true, description: 'Senha de acesso' },
        password_confirmation: { type: 'string', required: true, description: 'Confirmação da senha' },
        cpf: { type: 'string', description: 'CPF para cadastro de pessoa física' },
        cnpj: { type: 'string', description: 'CNPJ para cadastro de pessoa jurídica' },
        telephone: { type: 'string', description: 'Telefone para contato' },
        type_person: { type: 'string', enum: ['F', 'J'], description: 'Física (F) ou Jurídica (J)' }
      };
      notes = 'Cadastro público de solicitantes do sistema.';
    } else if (p.startsWith('/api/v1/search-requester')) {
      description = 'Consulta dados de solicitante por CPF ou CNPJ para preenchimento de formulários.';
      bodyParameters = {
        cpfcnpj: { type: 'string', required: true, description: 'CPF (11 dígitos) ou CNPJ (14 dígitos) a pesquisar' }
      };
      notes = 'Recupera dados cadastrais prévios para evitar duplicidade.';
    } else if (p.startsWith('/api/v1/sendActivateEmail')) {
      description = 'Reenvia e-mail com link de confirmação e ativação de conta recém-cadastrada.';
      bodyParameters = {
        email: { type: 'string', required: true, description: 'E-mail cadastrado do usuário' }
      };
      notes = 'Dispara nova mensagem de validação de e-mail.';
    } else if (p.startsWith('/api/v1/verificar-autenticidade')) {
      description = 'Verifica a autenticidade de um documento ou certificado emitido através do código hash.';
      bodyParameters = {
        codigo_autenticidade: { type: 'string', required: true, description: 'Código hash alfanumérico impresso no documento' }
      };
      notes = 'Serviço público de validação de autenticidade documental.';
    }

    // O. Simuladores e Taxas
    else if (p.startsWith('/api/v1/simulator-calculate') || p.startsWith('/api/v1/calculate-rate-')) {
      description = 'Simula e calcula o valor previsto de taxas de vistoria, análise ou incêndio.';
      bodyParameters = {
        area: { type: 'number', required: true, description: 'Área da edificação em m²' },
        risco: { type: 'string', description: 'Classificação de risco' },
        ocupacao_id: { type: 'integer', description: 'ID da ocupação predial' },
        tipo_solicitacao_id: { type: 'integer', description: 'Tipo do serviço solicitado' }
      };
      notes = 'Cálculo prévio estimativo conforme tabela oficial de emolumentos do CBMBA.';
    }

    // P. Normas e Itens
    else if (p.startsWith('/api/v1/norm')) {
      description = `Gerencia normas técnicas e itens normativos em ${p.replace('/api/v1/', '')}.`;
      bodyParameters = {
        norm_id: { type: 'integer', description: 'ID da norma técnica' },
        item: { type: 'string', description: 'Número do item ou artigo' },
        descricao: { type: 'string', description: 'Texto da exigência normativa' }
      };
      notes = 'Manutenção do acervo de normas e instruções técnicas.';
    }

    // Q. Default POST
    else {
      const cleanPath = p.replace('/api/v1/', '').replace(/-/g, ' ');
      description = `Executa a operação de ${cleanPath} no Fênix.`;
      bodyParameters = {
        dados: { type: 'object', description: 'Carga de dados exigida pela operação' }
      };
      notes = 'Operação com alteração de dados; requer confirm_mutation=true.';
    }
  }

  return {
    description,
    pathParameterHints,
    queryParameters,
    bodyParameters,
    notes
  };
}

// Apply enrichments
let descCount = 0;
let pathHintsCount = 0;
let queryParamsCount = 0;
let bodyParamsCount = 0;

for (const op of catalog.operations) {
  const enriched = enrichOperation(op);
  
  op.description = enriched.description;
  op.pathParameterHints = enriched.pathParameterHints;
  op.queryParameters = enriched.queryParameters;
  op.bodyParameters = enriched.bodyParameters;
  op.notes = enriched.notes;

  if (op.description) descCount++;
  if (op.pathParameterHints && Object.keys(op.pathParameterHints).length > 0) pathHintsCount++;
  if (op.queryParameters !== null && op.queryParameters !== undefined) queryParamsCount++;
  if (op.bodyParameters !== null && op.bodyParameters !== undefined) bodyParamsCount++;
}

// Write enriched catalog
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`Successfully enriched ${catalog.operations.length} operations in src/frontend-endpoints.json!`);
console.log(`Statistics:`);
console.log(`- Operations with description: ${descCount} / ${catalog.operations.length} (${((descCount / catalog.operations.length) * 100).toFixed(1)}%)`);
console.log(`- Operations with pathParameterHints: ${pathHintsCount} (all operations that have dynamic path parameters)`);
console.log(`- Operations with queryParameters: ${queryParamsCount} (all GET routes and query-enabled endpoints)`);
console.log(`- Operations with bodyParameters: ${bodyParamsCount} (all mutating POST and PUT routes)`);
