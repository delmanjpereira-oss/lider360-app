// ============================================================
// 🔧 FIX DO HANDLEUPLOADCSV
// 
// SUBSTITUI APENAS A FUNÇÃO `handleUploadCSV` no teu /linha/page.tsx
// 
// Mudanças:
// 1. Aceita MAIS variações de nome de coluna
// 2. Aceita 'usuario' como id_groot
// 3. Aceita 'liquida', 'prod_liquida', 'produtividade' como ritmo
// 4. LOG no console pra ver o que tá lendo
// 5. Mensagem de erro mais clara mostrando o header
// ============================================================

async function handleUploadCSV(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const texto = await file.text();
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (linhas.length < 2) {
      alert('CSV vazio ou sem dados.');
      return;
    }

    // Detecta separador
    const sep = linhas[0].includes(';') ? ';' : ',';
    const header = linhas[0]
      .split(sep)
      .map((h) => h.trim().toLowerCase().replace(/"/g, '').replace(/^\uFEFF/, ''));

    // 🔍 LOG: mostra no console o que ele leu
    console.log('📋 Header detectado:', header);
    console.log('📋 Separador:', sep === ';' ? 'ponto-e-vírgula' : 'vírgula');

    // 🎯 DETECÇÃO EXPANDIDA - aceita muitas variações
    const idxGroot = header.findIndex((h) => 
      h.includes('groot') || 
      h === 'id' || 
      h === 'id_groot' || 
      h === 'usuario' ||
      h === 'usuário' ||
      h === 'matricula' ||
      h === 'matrícula' ||
      h.includes('id_colab') ||
      h.includes('colaborador_id')
    );

    const idxNome = header.findIndex((h) => 
      h === 'nome' || 
      h.includes('nome') || 
      h === 'colaborador' || 
      h.includes('colab')
    );

    const idxRitmo = header.findIndex((h) => 
      h.includes('ritmo') || 
      h.includes('pct') || 
      h === '%' ||
      h.includes('liquid') ||      // liquida, líquida, prod_liquida
      h.includes('líquid') ||
      h.includes('produtividade') ||
      h === 'prod' ||
      h === 'prod_liquida' ||
      h === 'prod liquida'
    );

    const idxUnid = header.findIndex((h) => 
      h.includes('unid') || 
      h.includes('qtd') ||
      h.includes('quantidade') ||
      h === 'pcs' ||
      h.includes('peca') ||
      h.includes('peça')
    );

    const idxHoras = header.findIndex((h) => 
      h.includes('hora') || 
      h === 'h' ||
      h === 'tempo'
    );

    // 🔍 LOG: quais índices encontrou
    console.log('📋 Índices encontrados:', {
      groot: idxGroot,
      nome: idxNome,
      ritmo: idxRitmo,
      unidades: idxUnid,
      horas: idxHoras,
    });

    // 🚨 VALIDAÇÃO COM DICA
    if (idxGroot === -1 || idxRitmo === -1) {
      const colunasEncontradas = header.join(' | ');
      alert(
        `❌ CSV inválido!\n\n` +
        `Colunas encontradas:\n${colunasEncontradas}\n\n` +
        `Preciso de UMA coluna com:\n` +
        `• ID (id_groot, matricula, usuario...)\n` +
        `• PRODUTIVIDADE (ritmo, liquida, produtividade, pct...)\n\n` +
        `Veja o console (F12) pra detalhes.`
      );
      return;
    }

    const hoje = new Date().toISOString().split('T')[0];
    const registros: any[] = [];
    let pulou = 0;

    for (let i = 1; i < linhas.length; i++) {
      const cols = linhas[i].split(sep).map((c) => c.trim().replace(/"/g, ''));
      const id_groot = cols[idxGroot];
      if (!id_groot) {
        pulou++;
        continue;
      }

      const ritmoRaw = (cols[idxRitmo] || '')
        .replace('%', '')
        .replace(',', '.')
        .trim();
      const ritmo_pct = Math.round(parseFloat(ritmoRaw));
      if (isNaN(ritmo_pct) || ritmo_pct < 0) {
        pulou++;
        continue;
      }

      const reg: any = {
        id_groot,
        ritmo_pct,
        data_referencia: hoje,
        hora_atualizacao: new Date().toISOString(),
      };

      if (idxNome !== -1 && cols[idxNome]) reg.nome = cols[idxNome];
      if (idxUnid !== -1 && cols[idxUnid]) {
        const u = parseInt(cols[idxUnid].replace(/\./g, ''), 10);
        if (!isNaN(u)) reg.unidades = u;
      }
      if (idxHoras !== -1 && cols[idxHoras]) {
        const h = parseFloat(cols[idxHoras].replace(',', '.'));
        if (!isNaN(h)) reg.horas = h;
      }

      registros.push(reg);
    }

    console.log(`📋 ${registros.length} registros válidos, ${pulou} pulados`);

    if (registros.length === 0) {
      alert('❌ Nenhum registro válido encontrado.\nVê o console (F12) pra debug.');
      return;
    }

    const { error } = await supabase
      .from('ritmo_atual')
      .upsert(registros, { onConflict: 'id_groot,data_referencia' });

    if (error) {
      console.error('Erro upsert:', error);
      alert('Erro ao salvar: ' + error.message);
      return;
    }

    const msgErros = pulou > 0 ? `\n⚠️ ${pulou} linhas pulada(s)` : '';
    alert(`✅ ${registros.length} colaborador(es) atualizado(s).${msgErros}`);
    await carregarRitmos();
  } catch (err: any) {
    console.error('Erro CSV:', err);
    alert('Erro ao processar CSV: ' + err.message);
  } finally {
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
}
