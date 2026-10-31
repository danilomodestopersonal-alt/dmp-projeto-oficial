import type {FinanceData} from '@/types/financeiro';
// An older browser must not reintroduce automatic DS carryover on its next save.
export function newMonthOpeningPreserved(before:FinanceData,after:FinanceData) {
  for(const c of Object.keys(after.competences||{})) {
    if(c<'2026-11'||before.competences[c])continue;
    const expected=Object.prototype.hasOwnProperty.call(before.dsOpeningBalances||{},c)?before.dsOpeningBalances![c]:0;
    if(!Object.prototype.hasOwnProperty.call(after.dsOpeningBalances||{},c)||after.dsOpeningBalances![c]!==expected)return false;
  }
  return true;
}
