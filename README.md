# DMP — Pacote de Atualização 2026

Versão integrada do mesmo aplicativo DMP, com:

- layout premium com barra lateral preta e logo em cartão branco;
- 32 alunos importados da planilha enviada;
- histórico de sessões de 2026 importado e deduplicado;
- avaliações de 2026 importadas quando presentes;
- cadastro completo: início, nascimento, telefone, restrições e objetivo;
- treino planejado, duplicação e sessão baseada no treino;
- sessão livre por voz ou texto, com revisão estruturada antes de salvar;
- histórico e exportação CSV;
- avaliações com peso, altura, gordura, massa magra, circunferências e fotos;
- layout responsivo e manifesto instalável no celular.

## Executar

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Credenciais locais

- E-mail: `danilo@dmp.local`
- Senha: `Dmp@2026`

## Importante

Nesta versão, os dados ficam no navegador (localStorage). O projeto Supabase já criado será conectado na próxima etapa, pois exige as chaves reais do seu projeto. O botão “Restaurar importação” retorna aos dados originais importados de 2026.
