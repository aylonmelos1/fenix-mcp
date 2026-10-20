# Fênix frontend API catalog

Frontend bundle version: **2.19.1**. Capture date: **2026-10-20**.

This is a client-side route inventory from the loaded webpack bundle and observed Chrome Network requests. It is not a server controller specification. Dynamic path slots (`{param1}`, `{param2}`) preserve their order from the frontend callsite; the available schema and side effects may vary by account role and request body.

## Evidence and transport

- 312 distinct operation templates across 41 Axios service resources.
- 306 templates were found in bundle callsites; 11 also appeared in browser network capture.
- Browser requests used the authenticated web session cookie plus `X-XSRF-TOKEN`; no `Authorization` header was observed.
- Login initializes `/api/v1/csrf-cookie`, then posts `email`, `password`, `version`, and `hcaptcha_token` to `/api/v1/authenticate`. The frontend reads the `user` property from the Axios response body.
- The MCP OAuth access token is separate. The MCP server keeps the Fênix cookie jar encrypted in PostgreSQL and sends cookies and XSRF only to the configured Fênix API origin.
- `access` is a name/method heuristic. POST can be read-only in this app, and an unobserved endpoint may have different semantics. The MCP tool requires `confirm_mutation=true` for every non-GET operation.
- Password and first-access operations are cataloged but unavailable through `fenix_api_call`.
- JSON request bodies and responses are limited to 1 MB. Multipart uploads and binary attachments are not returned by the generic tool.

### Authentication routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/csrf-cookie` | Obter cookies CSRF antes do login, registro e redefinição de senha. |
| POST | `/api/v1/authenticate` | Login com email, password, version e hcaptcha_token; o frontend lê data.user. |
| POST | `/api/v1/logout` | Encerrar sessão autenticada por cookie. |
| POST | `/api/v1/password/email` | Solicitar email para redefinição de senha. |
| POST | `/api/v1/password/reset` | Confirmar redefinição de senha. |

## Operation templates

### GET

| Path | Operation ID | Heuristic | Browser capture | MCP tool |
| --- | --- | --- | --- | --- |
| `/api/v1/{param1}/models` | `get_param_models` | read-only | bundle only | available |
| `/api/v1/autenticidade-usuarios/{param1}` | `get_autenticidade_usuarios_param` | read-only | bundle only | available |
| `/api/v1/autenticidade-usuarios/{param1}/documentos/{param2}/download` | `get_autenticidade_usuarios_param_documentos_param_download` | read-only | bundle only | available |
| `/api/v1/cnaes` | `get_cnaes` | read-only | bundle only | available |
| `/api/v1/counties` | `get_counties` | read-only | bundle only | available |
| `/api/v1/decretoEstadual` | `get_decretoestadual` | read-only | bundle only | available |
| `/api/v1/detailsRequester` | `get_detailsrequester` | read-only | bundle only | available |
| `/api/v1/division_group` | `get_division_group` | read-only | bundle only | available |
| `/api/v1/edifications` | `get_edifications` | read-only | bundle only | available |
| `/api/v1/edifications/{param1}` | `get_edifications_param` | read-only | bundle only | available |
| `/api/v1/getAllCountys` | `get_getallcountys` | read-only | observed | available |
| `/api/v1/getDivisionGroup` | `get_getdivisiongroup` | read-only | bundle only | available |
| `/api/v1/getNorms` | `get_getnorms` | read-only | bundle only | available |
| `/api/v1/inexigibilidades` | `get_inexigibilidades` | read-only | observed | available |
| `/api/v1/inexigibilidades/{param1}/certificado/download` | `get_inexigibilidades_param_certificado_download` | read-only | bundle only | available |
| `/api/v1/isencao` | `get_isencao` | read-only | bundle only | available |
| `/api/v1/list-counties` | `get_list_counties` | read-only | bundle only | available |
| `/api/v1/listar-tipos-solicitacoes` | `get_listar_tipos_solicitacoes` | read-only | bundle only | available |
| `/api/v1/listaTodosTipoProjetos` | `get_listatodostipoprojetos` | read-only | bundle only | available |
| `/api/v1/migracoes-sap` | `get_migracoes_sap` | read-only | observed | available |
| `/api/v1/migracoes-sap/{param1}` | `get_migracoes_sap_param` | read-only | bundle only | available |
| `/api/v1/migracoes-sap/{param1}/documentos/{param2}/download` | `get_migracoes_sap_param_documentos_param_download` | read-only | bundle only | available |
| `/api/v1/norm_type` | `get_norm_type` | read-only | bundle only | available |
| `/api/v1/occupation_group` | `get_occupation_group` | read-only | observed | available |
| `/api/v1/parametros` | `get_parametros` | read-only | bundle only | available |
| `/api/v1/parametros-tax` | `get_parametros_tax` | read-only | bundle only | available |
| `/api/v1/parametros-tax/load-altered` | `get_parametros_tax_load_altered` | read-only | bundle only | available |
| `/api/v1/projetos-tecnicos/{param1}` | `get_projetos_tecnicos_param` | read-only | bundle only | available |
| `/api/v1/projetos-tecnicos/{param1}/temp/correcao-emergencial` | `get_projetos_tecnicos_param_temp_correcao_emergencial` | read-only | bundle only | available |
| `/api/v1/rankgraduation` | `get_rankgraduation` | read-only | bundle only | available |
| `/api/v1/remanejamentos` | `get_remanejamentos` | read-only | observed | available |
| `/api/v1/remanejamentos/{param1}` | `get_remanejamentos_param` | read-only | bundle only | available |
| `/api/v1/remanejamentos/{param1}/documentos/{param2}/download` | `get_remanejamentos_param_documentos_param_download` | read-only | bundle only | available |
| `/api/v1/remanejamentos/projeto-remanejavel` | `get_remanejamentos_projeto_remanejavel` | read-only | bundle only | available |
| `/api/v1/request` | `get_request` | read-only | observed | available |
| `/api/v1/roles` | `get_roles` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/autorizacao-solicitante` | `get_solicitacoes_param_autorizacao_solicitante` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/certificados/aprovacao` | `get_solicitacoes_param_certificados_aprovacao` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/certificados/protocolo` | `get_solicitacoes_param_certificados_protocolo` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/daes` | `get_solicitacoes_param_daes` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/contexto-devolucao/com-designacao` | `get_solicitacoes_param_fluxo_contexto_devolucao_com_designacao` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/contexto-devolucao/sem-designacao` | `get_solicitacoes_param_fluxo_contexto_devolucao_sem_designacao` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/funcionarios-p-encaminhamento` | `get_solicitacoes_param_fluxo_funcionarios_p_encaminhamento` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/log-documentos?page={param2}&per_page={param3}` | `get_solicitacoes_param_log_documentos_page_param_per_page_param` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes` | `get_solicitacoes_param_retificacoes` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}` | `get_solicitacoes_param_retificacoes_param` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/certificado` | `get_solicitacoes_param_retificacoes_param_certificado` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/diff` | `get_solicitacoes_param_retificacoes_param_diff` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/documentos` | `get_solicitacoes_param_retificacoes_param_documentos` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/documentos/{param3}` | `get_solicitacoes_param_retificacoes_param_documentos_param` | read-only | bundle only | available |
| `/api/v1/survey` | `get_survey` | read-only | observed | available |
| `/api/v1/technicalproject` | `get_technicalproject` | read-only | observed | available |
| `/api/v1/tipoProjetoTecnico` | `get_tipoprojetotecnico` | read-only | bundle only | available |
| `/api/v1/transferencias-solicitacoes/destinatarios` | `get_transferencias_solicitacoes_destinatarios` | read-only | bundle only | available |
| `/api/v1/unity` | `get_unity` | read-only | observed | available |
| `/api/v1/usuarios/{param1}/edifications` | `get_usuarios_param_edifications` | read-only | bundle only | available |

### POST

| Path | Operation ID | Heuristic | Browser capture | MCP tool |
| --- | --- | --- | --- | --- |
| `/api/v1/accpetTechnicalproject` | `post_accpettechnicalproject` | mutating-or-unclear | bundle only | available |
| `/api/v1/address` | `post_address` | mutating-or-unclear | bundle only | available |
| `/api/v1/AllNormItems` | `post_allnormitems` | read-only | bundle only | available |
| `/api/v1/analytics-prod-report-generate-pdf` | `post_analytics_prod_report_generate_pdf` | read-only | bundle only | available |
| `/api/v1/autenticidade-usuarios/{param1}/deferir` | `post_autenticidade_usuarios_param_deferir` | mutating-or-unclear | bundle only | available |
| `/api/v1/autenticidade-usuarios/{param1}/indeferir` | `post_autenticidade_usuarios_param_indeferir` | mutating-or-unclear | bundle only | available |
| `/api/v1/autenticidade-usuarios/{param1}/solicitar-reanalise` | `post_autenticidade_usuarios_param_solicitar_reanalise` | mutating-or-unclear | bundle only | available |
| `/api/v1/autenticidade-usuarios/solicitar-analise` | `post_autenticidade_usuarios_solicitar_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/avcbHasAcp` | `post_avcbhasacp` | read-only | bundle only | available |
| `/api/v1/buscarDetalheRelatorioAprovacao` | `post_buscardetalherelatorioaprovacao` | read-only | bundle only | available |
| `/api/v1/calculate-rate-fire` | `post_calculate_rate_fire` | read-only | bundle only | available |
| `/api/v1/calculate-rate-survey` | `post_calculate_rate_survey` | read-only | bundle only | available |
| `/api/v1/comprovantes-pagamento/verificar-duplicidade` | `post_comprovantes_pagamento_verificar_duplicidade` | read-only | bundle only | available |
| `/api/v1/definir-novo-status` | `post_definir_novo_status` | mutating-or-unclear | bundle only | available |
| `/api/v1/definirStatusV2` | `post_definirstatusv2` | mutating-or-unclear | bundle only | available |
| `/api/v1/deleteXLS` | `post_deletexls` | mutating-or-unclear | bundle only | available |
| `/api/v1/desabilitar-municipios` | `post_desabilitar_municipios` | mutating-or-unclear | bundle only | available |
| `/api/v1/devolution` | `post_devolution` | mutating-or-unclear | bundle only | available |
| `/api/v1/devolution-by-request` | `post_devolution_by_request` | mutating-or-unclear | bundle only | available |
| `/api/v1/documentos-solicitados` | `post_documentos_solicitados` | mutating-or-unclear | bundle only | available |
| `/api/v1/documentos-solicitados-vistoria` | `post_documentos_solicitados_vistoria` | mutating-or-unclear | bundle only | available |
| `/api/v1/documents-survey-destroy` | `post_documents_survey_destroy` | mutating-or-unclear | bundle only | available |
| `/api/v1/documents-survey-download` | `post_documents_survey_download` | mutating-or-unclear | bundle only | available |
| `/api/v1/documents-survey-load` | `post_documents_survey_load` | mutating-or-unclear | bundle only | available |
| `/api/v1/documents-survey-store` | `post_documents_survey_store` | mutating-or-unclear | bundle only | available |
| `/api/v1/downloads` | `post_downloads` | read-only | bundle only | available |
| `/api/v1/edifications` | `post_edifications` | mutating-or-unclear | bundle only | available |
| `/api/v1/edifications-carregar-dados-extras` | `post_edifications_carregar_dados_extras` | mutating-or-unclear | bundle only | available |
| `/api/v1/editPassword` | `post_editpassword` | mutating-or-unclear | bundle only | excluded |
| `/api/v1/employee` | `post_employee` | mutating-or-unclear | bundle only | available |
| `/api/v1/employee-update` | `post_employee_update` | mutating-or-unclear | bundle only | available |
| `/api/v1/files` | `post_files` | mutating-or-unclear | bundle only | available |
| `/api/v1/firstAcess` | `post_firstacess` | mutating-or-unclear | bundle only | excluded |
| `/api/v1/generate-buildings-report` | `post_generate_buildings_report` | mutating-or-unclear | bundle only | available |
| `/api/v1/generateInspectionAnalysisReport` | `post_generateinspectionanalysisreport` | mutating-or-unclear | bundle only | available |
| `/api/v1/generateInstitutionActivityReport` | `post_generateinstitutionactivityreport` | mutating-or-unclear | bundle only | available |
| `/api/v1/generateReport` | `post_generatereport` | mutating-or-unclear | bundle only | available |
| `/api/v1/gerar-dae` | `post_gerar_dae` | mutating-or-unclear | bundle only | available |
| `/api/v1/gerarNumeroSolicitacao` | `post_gerarnumerosolicitacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/gerarRelatorioDistribuicaoAtividade` | `post_gerarrelatoriodistribuicaoatividade` | mutating-or-unclear | bundle only | available |
| `/api/v1/gerarRelatorioProdutividade` | `post_gerarrelatorioprodutividade` | mutating-or-unclear | bundle only | available |
| `/api/v1/get-funcionario-anterior-por-status` | `post_get_funcionario_anterior_por_status` | read-only | bundle only | available |
| `/api/v1/get-last-devolution-by-request` | `post_get_last_devolution_by_request` | read-only | bundle only | available |
| `/api/v1/get-permissao-edification` | `post_get_permissao_edification` | read-only | bundle only | available |
| `/api/v1/getAddressHistoric` | `post_getaddresshistoric` | read-only | bundle only | available |
| `/api/v1/getAllDivisions` | `post_getalldivisions` | read-only | bundle only | available |
| `/api/v1/getAllDivisionsByOccpationId` | `post_getalldivisionsbyoccpationid` | read-only | bundle only | available |
| `/api/v1/getAllOccupations` | `post_getalloccupations` | read-only | bundle only | available |
| `/api/v1/getCnaeData` | `post_getcnaedata` | read-only | bundle only | available |
| `/api/v1/getCountysByUnity` | `post_getcountysbyunity` | read-only | bundle only | available |
| `/api/v1/getDocumentationsHistoric` | `post_getdocumentationshistoric` | read-only | bundle only | available |
| `/api/v1/getEdificationHistoric` | `post_getedificationhistoric` | read-only | bundle only | available |
| `/api/v1/getEmployeeDetailsById` | `post_getemployeedetailsbyid` | read-only | bundle only | available |
| `/api/v1/getEmployeeProfile` | `post_getemployeeprofile` | read-only | bundle only | available |
| `/api/v1/getIndicators` | `post_getindicators` | read-only | bundle only | available |
| `/api/v1/getJustificativaRetificacao` | `post_getjustificativaretificacao` | read-only | bundle only | available |
| `/api/v1/getPermissaoArquivar` | `post_getpermissaoarquivar` | read-only | bundle only | available |
| `/api/v1/getPermissaoDesarquivar` | `post_getpermissaodesarquivar` | read-only | bundle only | available |
| `/api/v1/getProjectHistoric` | `post_getprojecthistoric` | read-only | bundle only | available |
| `/api/v1/getProjectSimplified` | `post_getprojectsimplified` | read-only | bundle only | available |
| `/api/v1/getRequest` | `post_getrequest` | read-only | bundle only | available |
| `/api/v1/getRetificacoesPermitidas` | `post_getretificacoespermitidas` | read-only | observed | available |
| `/api/v1/getSolicitacaoAtual` | `post_getsolicitacaoatual` | read-only | bundle only | available |
| `/api/v1/getSolicitacaoDataById` | `post_getsolicitacaodatabyid` | read-only | bundle only | available |
| `/api/v1/getSolicitacoesPermitidas` | `post_getsolicitacoespermitidas` | read-only | observed | available |
| `/api/v1/habilitar-municipios` | `post_habilitar_municipios` | mutating-or-unclear | bundle only | available |
| `/api/v1/imprimir-dae` | `post_imprimir_dae` | mutating-or-unclear | bundle only | available |
| `/api/v1/inexigibilidades` | `post_inexigibilidades` | mutating-or-unclear | bundle only | available |
| `/api/v1/is-notificado-vistoria` | `post_is_notificado_vistoria` | read-only | bundle only | available |
| `/api/v1/list-counties-enabled` | `post_list_counties_enabled` | read-only | bundle only | available |
| `/api/v1/list-occupation-division` | `post_list_occupation_division` | read-only | bundle only | available |
| `/api/v1/lista-funcionario-por-funcao` | `post_lista_funcionario_por_funcao` | read-only | bundle only | available |
| `/api/v1/lista-municipio-distancia-unidade` | `post_lista_municipio_distancia_unidade` | read-only | bundle only | available |
| `/api/v1/lista-responsaveis-tecnicos` | `post_lista_responsaveis_tecnicos` | read-only | bundle only | available |
| `/api/v1/listaFuncionariosFuncaoUnidade` | `post_listafuncionariosfuncaounidade` | read-only | bundle only | available |
| `/api/v1/listarFuncionarioPorRolesUnidade` | `post_listarfuncionarioporrolesunidade` | read-only | bundle only | available |
| `/api/v1/listarRelatorioStatusProjeto` | `post_listarrelatoriostatusprojeto` | read-only | bundle only | available |
| `/api/v1/mail-user` | `post_mail_user` | mutating-or-unclear | bundle only | available |
| `/api/v1/migracoes-sap/{param1}/deferir-correcao` | `post_migracoes_sap_param_deferir_correcao` | mutating-or-unclear | bundle only | available |
| `/api/v1/migracoes-sap/{param1}/indeferir-analise` | `post_migracoes_sap_param_indeferir_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/migracoes-sap/{param1}/indeferir-correcao` | `post_migracoes_sap_param_indeferir_correcao` | mutating-or-unclear | bundle only | available |
| `/api/v1/migracoes-sap/{param1}/iniciar-analise` | `post_migracoes_sap_param_iniciar_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/migracoes-sap/{param1}/iniciar-correcao` | `post_migracoes_sap_param_iniciar_correcao` | mutating-or-unclear | bundle only | available |
| `/api/v1/migracoes-sap/{param1}/solicitar-correcao` | `post_migracoes_sap_param_solicitar_correcao` | mutating-or-unclear | bundle only | available |
| `/api/v1/migracoes-sap/solicitar-analise` | `post_migracoes_sap_solicitar_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/municipios` | `post_municipios` | mutating-or-unclear | bundle only | available |
| `/api/v1/norm-items-save` | `post_norm_items_save` | mutating-or-unclear | bundle only | available |
| `/api/v1/norm-items-update` | `post_norm_items_update` | mutating-or-unclear | bundle only | available |
| `/api/v1/normItems` | `post_normitems` | read-only | bundle only | available |
| `/api/v1/norms` | `post_norms` | mutating-or-unclear | bundle only | available |
| `/api/v1/norms-update` | `post_norms_update` | mutating-or-unclear | bundle only | available |
| `/api/v1/notificar-aprovacao` | `post_notificar_aprovacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/observation` | `post_observation` | mutating-or-unclear | bundle only | available |
| `/api/v1/observation-by-request` | `post_observation_by_request` | mutating-or-unclear | bundle only | available |
| `/api/v1/observation-destroy` | `post_observation_destroy` | mutating-or-unclear | bundle only | available |
| `/api/v1/observation/notify` | `post_observation_notify` | mutating-or-unclear | bundle only | available |
| `/api/v1/observation/storeObservation` | `post_observation_storeobservation` | mutating-or-unclear | bundle only | available |
| `/api/v1/observation/updateObservation` | `post_observation_updateobservation` | mutating-or-unclear | bundle only | available |
| `/api/v1/occupationByUnit` | `post_occupationbyunit` | read-only | bundle only | available |
| `/api/v1/parametros-internos/cnaes` | `post_parametros_internos_cnaes` | mutating-or-unclear | bundle only | available |
| `/api/v1/parametros-tax/confirmar` | `post_parametros_tax_confirmar` | mutating-or-unclear | bundle only | available |
| `/api/v1/parametros-tax/load-parametros` | `post_parametros_tax_load_parametros` | mutating-or-unclear | bundle only | available |
| `/api/v1/password/email` | `post_api_v1_password_email` | mutating-or-unclear | bundle only | excluded |
| `/api/v1/password/reset` | `post_api_v1_password_reset` | mutating-or-unclear | bundle only | excluded |
| `/api/v1/pega-funcionario-anterior` | `post_pega_funcionario_anterior` | mutating-or-unclear | bundle only | available |
| `/api/v1/pegarDaePorID` | `post_pegardaeporid` | read-only | bundle only | available |
| `/api/v1/pending-notification` | `post_pending_notification` | mutating-or-unclear | bundle only | available |
| `/api/v1/projetos-tecnicos/{param1}/temp/correcao-emergencial/confirmar` | `post_projetos_tecnicos_param_temp_correcao_emergencial_confirmar` | mutating-or-unclear | bundle only | available |
| `/api/v1/projetos-tecnicos/{param1}/temp/correcao-emergencial/recusar` | `post_projetos_tecnicos_param_temp_correcao_emergencial_recusar` | mutating-or-unclear | bundle only | available |
| `/api/v1/projetos/{param1}/documentos/{param2}/alterar-status-aprovacao` | `post_projetos_param_documentos_param_alterar_status_aprovacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/proprietarioResponsavel` | `post_proprietarioresponsavel` | mutating-or-unclear | bundle only | available |
| `/api/v1/proprietarioResponsavelHistorico` | `post_proprietarioresponsavelhistorico` | mutating-or-unclear | bundle only | available |
| `/api/v1/relatorioAprovacao` | `post_relatorioaprovacao` | read-only | bundle only | available |
| `/api/v1/remanejamentos` | `post_remanejamentos` | mutating-or-unclear | bundle only | available |
| `/api/v1/remanejamentos/{param1}/documentos` | `post_remanejamentos_param_documentos` | mutating-or-unclear | bundle only | available |
| `/api/v1/remanejamentos/{param1}/indeferir` | `post_remanejamentos_param_indeferir` | mutating-or-unclear | bundle only | available |
| `/api/v1/remanejamentos/{param1}/remanejar` | `post_remanejamentos_param_remanejar` | mutating-or-unclear | bundle only | available |
| `/api/v1/remanejamentos/{param1}/solicitar` | `post_remanejamentos_param_solicitar` | mutating-or-unclear | bundle only | available |
| `/api/v1/remove-municipio-distancia-unidade` | `post_remove_municipio_distancia_unidade` | mutating-or-unclear | bundle only | available |
| `/api/v1/report/gerar-relatorio-pdf` | `post_report_gerar_relatorio_pdf` | read-only | bundle only | available |
| `/api/v1/request/download` | `post_request_download` | read-only | bundle only | available |
| `/api/v1/responsavel-tecnico` | `post_responsavel_tecnico` | mutating-or-unclear | bundle only | available |
| `/api/v1/responsavel-tecnico-destroy` | `post_responsavel_tecnico_destroy` | mutating-or-unclear | bundle only | available |
| `/api/v1/responsavel-tecnico-update` | `post_responsavel_tecnico_update` | mutating-or-unclear | bundle only | available |
| `/api/v1/resposta/store` | `post_resposta_store` | mutating-or-unclear | bundle only | available |
| `/api/v1/return-project-type` | `post_return_project_type` | mutating-or-unclear | bundle only | available |
| `/api/v1/returnToPreviusResponsable` | `post_returntopreviusresponsable` | mutating-or-unclear | bundle only | available |
| `/api/v1/rolesByUnit` | `post_rolesbyunit` | read-only | bundle only | available |
| `/api/v1/save_auxiliar_vistoria` | `post_save_auxiliar_vistoria` | mutating-or-unclear | bundle only | available |
| `/api/v1/search-requester` | `post_search_requester` | read-only | bundle only | available |
| `/api/v1/sendActivateEmail` | `post_sendactivateemail` | mutating-or-unclear | bundle only | available |
| `/api/v1/setProjectStatus` | `post_setprojectstatus` | mutating-or-unclear | bundle only | available |
| `/api/v1/setProjectStatusInBatch` | `post_setprojectstatusinbatch` | mutating-or-unclear | bundle only | available |
| `/api/v1/simulator-calculate` | `post_simulator_calculate` | read-only | bundle only | available |
| `/api/v1/solicitacoes/{param1}/alterar-comprovacao-isencao` | `post_solicitacoes_param_alterar_comprovacao_isencao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/alterar-declaracao-isencao` | `post_solicitacoes_param_alterar_declaracao_isencao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/autorizar-solicitante` | `post_solicitacoes_param_autorizar_solicitante` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/certificados/aprovacao/reemitir` | `post_solicitacoes_param_certificados_aprovacao_reemitir` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/daes/gerar` | `post_solicitacoes_param_daes_gerar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/daes/recalculados` | `post_solicitacoes_param_daes_recalculados` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/documentos` | `post_solicitacoes_param_documentos` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/aprovar-analise` | `post_solicitacoes_param_fluxo_acp_aprovar_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/comunicacao-analista-solicitante/finalizar` | `post_solicitacoes_param_fluxo_acp_comunicacao_analista_solicitante_finalizar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/comunicacao-analista-solicitante/iniciar` | `post_solicitacoes_param_fluxo_acp_comunicacao_analista_solicitante_iniciar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/confirmar-documentacao-analise` | `post_solicitacoes_param_fluxo_acp_confirmar_documentacao_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/devolucao/em-analise-p-encaminhado-sat` | `post_solicitacoes_param_fluxo_acp_devolucao_em_analise_p_encaminhado_sat` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/devolucao/em-analise-p-protocolado` | `post_solicitacoes_param_fluxo_acp_devolucao_em_analise_p_protocolado` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/devolucao/encaminhado-p-protocolado` | `post_solicitacoes_param_fluxo_acp_devolucao_encaminhado_p_protocolado` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/devolucao/pendente-aprovacao-p-em-analise` | `post_solicitacoes_param_fluxo_acp_devolucao_pendente_aprovacao_p_em_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/devolucao/pendente-hml-p-pendente-aprovacao` | `post_solicitacoes_param_fluxo_acp_devolucao_pendente_hml_p_pendente_aprovacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/devolucao/pendente-validacao-p-em-analise` | `post_solicitacoes_param_fluxo_acp_devolucao_pendente_validacao_p_em_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/finalizar-retificacao-solicitada-na-etapa-analise` | `post_solicitacoes_param_fluxo_acp_finalizar_retificacao_solicitada_na_etapa_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/homologar` | `post_solicitacoes_param_fluxo_acp_homologar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/migracao-sap-direta/deferir-correcao` | `post_solicitacoes_param_fluxo_acp_migracao_sap_direta_deferir_correcao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/migracao-sap-direta/solicitar-correcao` | `post_solicitacoes_param_fluxo_acp_migracao_sap_direta_solicitar_correcao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/notificar-pendencias` | `post_solicitacoes_param_fluxo_acp_notificar_pendencias` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/solicitar-retificacao-na-etapa-analise` | `post_solicitacoes_param_fluxo_acp_solicitar_retificacao_na_etapa_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/validar-aprovacao-analise` | `post_solicitacoes_param_fluxo_acp_validar_aprovacao_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/acp/validar-pendencias-notificadas` | `post_solicitacoes_param_fluxo_acp_validar_pendencias_notificadas` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/arquivar` | `post_solicitacoes_param_fluxo_arquivar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/aprovar-vistoria` | `post_solicitacoes_param_fluxo_avcb_aprovar_vistoria` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/comunicacao-vistoriador-solicitante/finalizar` | `post_solicitacoes_param_fluxo_avcb_comunicacao_vistoriador_solicitante_finalizar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/comunicacao-vistoriador-solicitante/iniciar` | `post_solicitacoes_param_fluxo_avcb_comunicacao_vistoriador_solicitante_iniciar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/confirmar-aprovacao-vistoria` | `post_solicitacoes_param_fluxo_avcb_confirmar_aprovacao_vistoria` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/devolucao/em-vistoria-p-protocolado` | `post_solicitacoes_param_fluxo_avcb_devolucao_em_vistoria_p_protocolado` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/devolucao/pendente-aprovacao-p-confirmacao` | `post_solicitacoes_param_fluxo_avcb_devolucao_pendente_aprovacao_p_confirmacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/devolucao/pendente-confirmacao-p-em-vistoria` | `post_solicitacoes_param_fluxo_avcb_devolucao_pendente_confirmacao_p_em_vistoria` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/devolucao/pendente-hml-p-pendente-aprovacao` | `post_solicitacoes_param_fluxo_avcb_devolucao_pendente_hml_p_pendente_aprovacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/devolucao/pendente-validacao-p-em-vistoria` | `post_solicitacoes_param_fluxo_avcb_devolucao_pendente_validacao_p_em_vistoria` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/homologar` | `post_solicitacoes_param_fluxo_avcb_homologar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/notificar-pendencias` | `post_solicitacoes_param_fluxo_avcb_notificar_pendencias` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/validar-aprovacao-vistoria` | `post_solicitacoes_param_fluxo_avcb_validar_aprovacao_vistoria` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/avcb/validar-pendencias-notificadas` | `post_solicitacoes_param_fluxo_avcb_validar_pendencias_notificadas` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/correcao-protocolo/finalizar` | `post_solicitacoes_param_fluxo_correcao_protocolo_finalizar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/correcao-protocolo/iniciar` | `post_solicitacoes_param_fluxo_correcao_protocolo_iniciar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/desarquivar` | `post_solicitacoes_param_fluxo_desarquivar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/aprovar` | `post_solicitacoes_param_fluxo_pts_avcb_analise_aprovar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/comunicacao-analista-solicitante/finalizar` | `post_solicitacoes_param_fluxo_pts_avcb_analise_comunicacao_analista_solicitante_finalizar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/comunicacao-analista-solicitante/iniciar` | `post_solicitacoes_param_fluxo_pts_avcb_analise_comunicacao_analista_solicitante_iniciar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/devolucao/em-analise-p-protocolado` | `post_solicitacoes_param_fluxo_pts_avcb_analise_devolucao_em_analise_p_protocolado` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/devolucao/pendente-aprovacao-p-em-analise` | `post_solicitacoes_param_fluxo_pts_avcb_analise_devolucao_pendente_aprovacao_p_em_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/devolucao/pendente-validacao-p-em-analise` | `post_solicitacoes_param_fluxo_pts_avcb_analise_devolucao_pendente_validacao_p_em_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/finalizar-retificacao` | `post_solicitacoes_param_fluxo_pts_avcb_analise_finalizar_retificacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/notificar-pendencias` | `post_solicitacoes_param_fluxo_pts_avcb_analise_notificar_pendencias` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/solicitar-retificacao` | `post_solicitacoes_param_fluxo_pts_avcb_analise_solicitar_retificacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/validar-aprovacao` | `post_solicitacoes_param_fluxo_pts_avcb_analise_validar_aprovacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/analise/validar-pendencias-notificadas` | `post_solicitacoes_param_fluxo_pts_avcb_analise_validar_pendencias_notificadas` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/aprovar` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_aprovar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/comunicacao-vistoriador-solicitante/finalizar` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_comunicacao_vistoriador_solicitante_finalizar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/comunicacao-vistoriador-solicitante/iniciar` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_comunicacao_vistoriador_solicitante_iniciar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/confirmar-aprovacao` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_confirmar_aprovacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/devolucao/em-vistoria-p-encaminhamento` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_devolucao_em_vistoria_p_encaminhamento` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/devolucao/encaminhamento-p-aprovacao-analise` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_devolucao_encaminhamento_p_aprovacao_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/devolucao/pendente-aprovacao-p-confirmacao` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_devolucao_pendente_aprovacao_p_confirmacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/devolucao/pendente-confirmacao-p-em-vistoria` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_devolucao_pendente_confirmacao_p_em_vistoria` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/devolucao/pendente-hml-p-pendente-aprovacao` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_devolucao_pendente_hml_p_pendente_aprovacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/devolucao/pendente-validacao-p-em-vistoria` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_devolucao_pendente_validacao_p_em_vistoria` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/encaminhar-p-vistoriador` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_encaminhar_p_vistoriador` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/homologar` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_homologar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/notificar-pendencias` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_notificar_pendencias` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/validar-aprovacao` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_validar_aprovacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-avcb/vistoria/validar-pendencias-notificadas` | `post_solicitacoes_param_fluxo_pts_avcb_vistoria_validar_pendencias_notificadas` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/aprovar-analise` | `post_solicitacoes_param_fluxo_pts_clcb_aprovar_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/comunicacao-analista-solicitante/finalizar` | `post_solicitacoes_param_fluxo_pts_clcb_comunicacao_analista_solicitante_finalizar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/comunicacao-analista-solicitante/iniciar` | `post_solicitacoes_param_fluxo_pts_clcb_comunicacao_analista_solicitante_iniciar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/devolucao/em-analise-p-protocolado` | `post_solicitacoes_param_fluxo_pts_clcb_devolucao_em_analise_p_protocolado` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/devolucao/pendente-aprovacao-p-em-analise` | `post_solicitacoes_param_fluxo_pts_clcb_devolucao_pendente_aprovacao_p_em_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/devolucao/pendente-hml-p-pendente-aprovacao` | `post_solicitacoes_param_fluxo_pts_clcb_devolucao_pendente_hml_p_pendente_aprovacao` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/devolucao/pendente-validacao-p-em-analise` | `post_solicitacoes_param_fluxo_pts_clcb_devolucao_pendente_validacao_p_em_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/finalizar-retificacao-solicitada-na-etapa-analise` | `post_solicitacoes_param_fluxo_pts_clcb_finalizar_retificacao_solicitada_na_etapa_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/homologar` | `post_solicitacoes_param_fluxo_pts_clcb_homologar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/notificar-pendencias` | `post_solicitacoes_param_fluxo_pts_clcb_notificar_pendencias` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/solicitar-retificacao-na-etapa-analise` | `post_solicitacoes_param_fluxo_pts_clcb_solicitar_retificacao_na_etapa_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/validar-aprovacao-analise` | `post_solicitacoes_param_fluxo_pts_clcb_validar_aprovacao_analise` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/fluxo/pts-clcb/validar-pendencias-notificadas` | `post_solicitacoes_param_fluxo_pts_clcb_validar_pendencias_notificadas` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes` | `post_solicitacoes_param_retificacoes` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/cancelar` | `post_solicitacoes_param_retificacoes_param_cancelar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/devolver` | `post_solicitacoes_param_retificacoes_param_devolver` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/documentos` | `post_solicitacoes_param_retificacoes_param_documentos` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/encaminhar` | `post_solicitacoes_param_retificacoes_param_encaminhar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/homologar` | `post_solicitacoes_param_retificacoes_param_homologar` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/validar` | `post_solicitacoes_param_retificacoes_param_validar` | mutating-or-unclear | bundle only | available |
| `/api/v1/store-municipio-distancia-unidade` | `post_store_municipio_distancia_unidade` | mutating-or-unclear | bundle only | available |
| `/api/v1/storeDevolution` | `post_storedevolution` | mutating-or-unclear | bundle only | available |
| `/api/v1/storeUser` | `post_storeuser` | mutating-or-unclear | bundle only | available |
| `/api/v1/tax-report-generate-pdf` | `post_tax_report_generate_pdf` | read-only | bundle only | available |
| `/api/v1/tax-report-index` | `post_tax_report_index` | read-only | bundle only | available |
| `/api/v1/technicalproject` | `post_technicalproject` | mutating-or-unclear | bundle only | available |
| `/api/v1/technicalprojectdocs` | `post_technicalprojectdocs` | mutating-or-unclear | bundle only | available |
| `/api/v1/technicalprojectResume` | `post_technicalprojectresume` | mutating-or-unclear | bundle only | available |
| `/api/v1/transferencias-solicitacoes/transferir` | `post_transferencias_solicitacoes_transferir` | mutating-or-unclear | bundle only | available |
| `/api/v1/unities` | `post_unities` | mutating-or-unclear | bundle only | available |
| `/api/v1/unity-comandante` | `post_unity_comandante` | mutating-or-unclear | bundle only | available |
| `/api/v1/unity-store` | `post_unity_store` | mutating-or-unclear | bundle only | available |
| `/api/v1/unity-update` | `post_unity_update` | mutating-or-unclear | bundle only | available |
| `/api/v1/update-sem-taxa-complementar` | `post_update_sem_taxa_complementar` | mutating-or-unclear | bundle only | available |
| `/api/v1/utsm/habilitar-municipios` | `post_utsm_habilitar_municipios` | mutating-or-unclear | bundle only | available |
| `/api/v1/validate-mandatory-documents` | `post_validate_mandatory_documents` | read-only | bundle only | available |
| `/api/v1/validateApproval` | `post_validateapproval` | mutating-or-unclear | bundle only | available |
| `/api/v1/verificar-autenticidade` | `post_verificar_autenticidade` | read-only | bundle only | available |
| `/api/v1/verificar-status-atual` | `post_verificar_status_atual` | read-only | bundle only | available |
| `/api/v1/verificarDocumentos` | `post_verificardocumentos` | read-only | bundle only | available |
| `/api/v1/verificarPagamento` | `post_verificarpagamento` | read-only | bundle only | available |
| `/api/v1/verify-request` | `post_verify_request` | read-only | bundle only | available |
| `/api/v1/zipDocs` | `post_zipdocs` | read-only | bundle only | available |

### PUT

| Path | Operation ID | Heuristic | Browser capture | MCP tool |
| --- | --- | --- | --- | --- |
| `/api/v1/edifications/{param1}` | `put_edifications_param` | mutating-or-unclear | bundle only | available |
| `/api/v1/occupation-division/{param1}` | `put_occupation_division_param` | mutating-or-unclear | bundle only | available |
| `/api/v1/parametros-internos/cnaes/{param1}` | `put_parametros_internos_cnaes_param` | mutating-or-unclear | bundle only | available |
| `/api/v1/parametros-tax/{param1}` | `put_parametros_tax_param` | mutating-or-unclear | bundle only | available |
| `/api/v1/profile` | `put_api_v1_profile` | mutating-or-unclear | bundle only | available |
| `/api/v1/transferRequests` | `put_transferrequests` | mutating-or-unclear | bundle only | available |

### DELETE

| Path | Operation ID | Heuristic | Browser capture | MCP tool |
| --- | --- | --- | --- | --- |
| `/api/v1/autenticidade-usuarios/{param1}/documentos/{param2}` | `delete_autenticidade_usuarios_param_documentos_param` | mutating-or-unclear | bundle only | available |
| `/api/v1/parametros-internos/cnaes/{param1}` | `delete_parametros_internos_cnaes_param` | mutating-or-unclear | bundle only | available |
| `/api/v1/remanejamentos/{param1}/documentos/{param2}` | `delete_remanejamentos_param_documentos_param` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/documentos/{param2}` | `delete_solicitacoes_param_documentos_param` | mutating-or-unclear | bundle only | available |
| `/api/v1/solicitacoes/{param1}/retificacoes/{param2}/documentos/{param3}` | `delete_solicitacoes_param_retificacoes_param_documentos_param` | mutating-or-unclear | bundle only | available |

The machine-readable source is [`../src/frontend-endpoints.json`](../src/frontend-endpoints.json).
