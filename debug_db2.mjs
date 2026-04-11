import { createClient } from '@libsql/client';

const client = createClient({
  url: 'file:C:/finrate/app/prisma/dev.db',
});

const analyses = await client.execute(`
  SELECT a.id, a.year, a.period, a.finalScore, a.ratiosJson,
         e.name as entityName, e.sector,
         fd.revenue, fd.netProfit, fd.ebitda, fd.ebit, fd.cogs,
         fd.inventory, fd.tradeReceivables, fd.tradePayables,
         fd.totalCurrentAssets, fd.totalCurrentLiabilities,
         fd.totalAssets, fd.totalEquity,
         fd.shortTermFinancialDebt, fd.longTermFinancialDebt
  FROM Analysis a
  LEFT JOIN Entity e ON a.entityId = e.id
  LEFT JOIN FinancialData fd ON a.financialDataId = fd.id
  ORDER BY a.createdAt DESC
  LIMIT 2
`);

for (const a of analyses.rows) {
  console.log('\n=== ANALYSIS:', a.id, '===');
  console.log('Entity:', a.entityName, '| Sector:', a.sector, '| Year:', a.year);
  console.log('finalScore:', a.finalScore);

  const r = JSON.parse(a.ratiosJson || '{}');
  const nullRatios = Object.entries(r).filter(([k,v]) => v == null).map(([k]) => k);
  const okRatios = Object.entries(r).filter(([k,v]) => v != null);

  console.log('\nNULL ratios (' + nullRatios.length + '):', nullRatios.join(', '));
  console.log('\nNon-null ratios:');
  okRatios.forEach(([k,v]) => console.log(' ', k, '=', v));

  console.log('\nFinancialData:');
  console.log('  revenue:', a.revenue, '| netProfit:', a.netProfit);
  console.log('  ebitda:', a.ebitda, '| ebit:', a.ebit, '| cogs:', a.cogs);
  console.log('  inventory:', a.inventory);
}

client.close();
