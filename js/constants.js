export const PHASES = ['사전준비', '교육운영', '종료처리', '정산', '결과보고'];
export const PHASE_INDEX = Object.fromEntries(PHASES.map((phase, index) => [phase, index]));
export const PHASE_PREFIXES = Object.freeze({ PRE:'사전준비', OPS:'교육운영', CLS:'종료처리', FIN:'정산', RPT:'결과보고' });
export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
