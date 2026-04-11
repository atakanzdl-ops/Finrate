const d = require('fs').readFileSync('C:/finrate/analyses_debug.json','utf8');
const j = JSON.parse(d);
const a = j.analyses[0];
const r = a.ratios;
const fd = a.financialData;

console.log('=== NULL RATIOS ===');
Object.entries(r).forEach(([k,v]) => { if(v == null) console.log('  NULL:', k); });

console.log('\n=== NON-NULL RATIOS ===');
Object.entries(r).forEach(([k,v]) => { if(v != null) console.log(' ', k, '=', v); });

console.log('\n=== FINANCIAL DATA ===');
console.log(JSON.stringify(fd, null, 2));

console.log('\n=== KEY FIELDS ===');
console.log('inventory:', fd && fd.inventory);
console.log('prevInventory:', fd && fd.prevInventory);
console.log('inventoryTurnoverDays:', r.inventoryTurnoverDays);
console.log('ebitda:', fd && fd.ebitda);
console.log('ebitdaMargin ratio:', r.ebitdaMargin);
console.log('netProfit:', fd && fd.netProfit);
console.log('netProfitMargin ratio:', r.netProfitMargin);
