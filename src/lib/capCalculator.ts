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
  const license = (agent.licenseNumber || '').trim().toLowerCase();
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
    const matchLicense = license && req.licenseNumber && req.licenseNumber.trim().toLowerCase() === license;
    const matchEmail = email && req.agentEmail && req.agentEmail.trim().toLowerCase() === email;
    const matchName = name && req.agentName && req.agentName.trim().toLowerCase() === name;

    if (matchUid || matchLicense || matchEmail || matchName) {
      cdaVolume += req.salePrice || 0;
      cdaGross += req.grossCommission || 0;
      cdaSplit += req.companySplitAmount || req.brokerSplitAmount || 0;
    }
  });

  // 2. Filter Sales History
  let shVolume = 0;
  let shGross = 0;
  let shSplit = 0;

  salesHistory.forEach(sh => {
    const shLic = String(sh.license || '').trim().toLowerCase();
    
    const matchLicense = license && shLic === license;
    const matchName = name && shLic === name;

    if (matchLicense || matchName) {
      const price = sh.price || 0;
      const rate = sh.rate || 0;
      const gross = price * (rate / 100);
      const split = sh.companySplitAmount !== undefined
        ? sh.companySplitAmount
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
