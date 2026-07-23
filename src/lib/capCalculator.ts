import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export interface AgentCapInfo {
  totalVolume: number;
  totalGrossCommission: number;
  companySplitPaid: number;
  capAmount: number;
  isCapped: boolean;
  remainingToCap: number;
  capPercentage: number;
}

export function matchLicense(lic1?: string, lic2?: string): boolean {
  if (!lic1 || !lic2) return false;
  const s1 = String(lic1).trim().toLowerCase();
  const s2 = String(lic2).trim().toLowerCase();
  if (!s1 || !s2) return false;

  if (s1 === s2) return true;

  const num1 = s1.replace(/\D/g, '');
  const num2 = s2.replace(/\D/g, '');
  if (num1 && num2 && num1 === num2) return true;

  if (s1.startsWith(s2) || s2.startsWith(s1)) return true;

  return false;
}

export function normalizeDate(dateStr: any): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const str = String(dateStr).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  if (str.includes('T')) {
    return str.split('T')[0];
  }

  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, month, day, year] = m;
    if (year.length === 2) year = '20' + year;
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return str;
}

export function calculateAgentCapFromData(
  agent: {
    uid?: string;
    id?: string;
    licenseNumber?: string;
    email?: string;
    name?: string;
    commissionProfile?: any;
  },
  cdaRequests: any[],
  salesHistory: any[]
): AgentCapInfo {
  const license = (agent.licenseNumber || '').trim();
  const email = (agent.email || '').trim().toLowerCase();
  const name = (agent.name || '').trim().toLowerCase();
  const uid = agent.uid || agent.id;

  const capAmount = agent.commissionProfile?.capAmount !== undefined 
    ? agent.commissionProfile.capAmount 
    : 15000;

  const brokerSplitPct = agent.commissionProfile?.brokerSplit !== undefined
    ? agent.commissionProfile.brokerSplit
    : 20;

  // 1. Filter CDA Requests
  let cdaVolume = 0;
  let cdaGross = 0;
  let cdaSplit = 0;

  cdaRequests.forEach(req => {
    if (req.status !== 'approved') return;
    
    // Check if req belongs to agent
    const matchUid = uid && req.agentId === uid;
    const matchLic = license && matchLicense(license, req.licenseNumber);
    const matchEmail = email && req.agentEmail && req.agentEmail.trim().toLowerCase() === email;
    const matchName = name && req.agentName && req.agentName.trim().toLowerCase() === name;

    if (matchUid || matchLic || matchEmail || matchName) {
      cdaVolume += Number(req.salePrice) || 0;
      cdaGross += Number(req.grossCommission) || 0;
      cdaSplit += Number(req.companySplitAmount || req.brokerSplitAmount) || 0;
    }
  });

  // 2. Filter Sales History
  let shVolume = 0;
  let shGross = 0;
  let shSplit = 0;

  salesHistory.forEach(sh => {
    const shLic = String(sh.license || '').trim();
    
    const matchLic = license && matchLicense(license, shLic);
    const matchName = name && shLic.toLowerCase() === name;

    if (matchLic || matchName) {
      const price = Number(sh.price) || 0;
      const rate = Number(sh.rate) || 0;
      const gross = price * (rate / 100);
      const split = sh.companySplitAmount !== undefined
        ? Number(sh.companySplitAmount)
        : (gross * (brokerSplitPct / 100));

      shVolume += price;
      shGross += gross;
      shSplit += split;
    }
  });

  const totalVolume = cdaVolume + shVolume;
  const totalGrossCommission = cdaGross + shGross;
  const companySplitPaid = cdaSplit + shSplit;

  const isCapped = capAmount > 0 ? companySplitPaid >= capAmount : false;
  const remainingToCap = capAmount > 0 ? Math.max(0, capAmount - companySplitPaid) : 0;
  const capPercentage = capAmount > 0 ? Math.min(100, Math.round((companySplitPaid / capAmount) * 100)) : 100;

  return {
    totalVolume,
    totalGrossCommission,
    companySplitPaid,
    capAmount,
    isCapped,
    remainingToCap,
    capPercentage
  };
}
