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
    const matchLic = license && matchLicense(license, req.licenseNumber || req.agentLicense);
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

export function calculateCDASplit(
  req: any,
  agentProfile: any,
  ytdSplitPaid: number
) {
  const salePrice = Number(req.salePrice) || 0;
  const commissionRate = Number(req.commissionRate) || 0;
  const rateType = req.rateType || 'percentage';

  // Base commission
  let baseCommission = 0;
  if (rateType === 'percentage') {
    baseCommission = salePrice * (commissionRate / 100);
  } else if (rateType === 'flat') {
    baseCommission = commissionRate;
  } else {
    baseCommission = Number(req.baseCommission) || 0;
  }

  // Bonus
  let bonusAmount = 0;
  if (req.bonusRateType === 'percentage') {
    bonusAmount = salePrice * ((Number(req.bonusRateValue) || 0) / 100);
  } else if (req.bonusRateType === 'flat') {
    bonusAmount = Number(req.bonusRateValue) || 0;
  } else {
    bonusAmount = Number(req.bonusAmount) || 0;
  }

  // Rebate
  let rebateAmount = 0;
  if (req.rebateRateType === 'percentage') {
    rebateAmount = salePrice * ((Number(req.rebateRateValue) || 0) / 100);
  } else if (req.rebateRateType === 'flat') {
    rebateAmount = Number(req.rebateRateValue) || 0;
  } else {
    rebateAmount = Number(req.rebateAmount) || 0;
  }

  // Referral
  let referralAmount = 0;
  if (req.referralRateType === 'percentage') {
    referralAmount = baseCommission * ((Number(req.referralRateValue) || 0) / 100);
  } else if (req.referralRateType === 'flat') {
    referralAmount = Number(req.referralRateValue) || 0;
  } else {
    referralAmount = Number(req.referralAmount) || 0;
  }

  // Gross commission
  const gross = baseCommission + bonusAmount - referralAmount - rebateAmount;

  // Co-broker split
  const coBrokerSplitAmount = (req.propertyType === 'Lease' && req.representation === 'Seller' && req.hasCoBroker)
    ? Number((salePrice * ((Number(req.coBrokerSplitPercentage) || 0) / 100)).toFixed(2))
    : (Number(req.coBrokerSplitAmount) || 0);

  // Net to MTR
  const netToMtr = req.propertyType === 'Lease'
    ? Math.max(0, gross - coBrokerSplitAmount)
    : gross;

  let brokerSplit = 0;
  let agentGross = 0;
  let mentorSplitAmount = 0;

  let agentSplit = 80;
  let bSplit = 20;
  let mentorSplit = 0;
  let splitType: 'percentage' | 'flat' = 'percentage';
  let overrides: any = null;

  const isInexperienced = !!agentProfile?.commissionProfile?.isInexperienced;
  const isMentorActive = !!(isInexperienced && agentProfile?.commissionProfile?.mentorActive);

  if (agentProfile?.commissionProfile) {
    const pAgentSplit = agentProfile.commissionProfile.agentSplit;
    const pBrokerSplit = agentProfile.commissionProfile.brokerSplit;
    const pMentorSplit = agentProfile.commissionProfile.mentorSplit || 0;

    if (typeof pAgentSplit === 'number' && typeof pBrokerSplit === 'number' && (pAgentSplit > 0 || pBrokerSplit > 0)) {
      agentSplit = pAgentSplit;
      bSplit = pBrokerSplit;
    }
    if (isMentorActive && typeof pMentorSplit === 'number') {
      mentorSplit = pMentorSplit;
    }
    splitType = agentProfile.commissionProfile.splitType || 'percentage';
    overrides = agentProfile.commissionProfile.overrides;
  } else if (agentProfile?.role === 'admin') {
    agentSplit = 100;
    bSplit = 0;
  }

  // Overrides
  const hasOverride = !!(overrides && req.propertyType && overrides[req.propertyType]);
  if (hasOverride) {
    agentSplit = overrides[req.propertyType].agentSplit;
    bSplit = overrides[req.propertyType].brokerSplit;
  }

  if (req.propertyType === 'Lease') {
    if (netToMtr <= 800) {
      agentGross = netToMtr;
      brokerSplit = 0;
      mentorSplitAmount = 0;
    } else {
      if (splitType === 'percentage' || hasOverride) {
        brokerSplit = netToMtr * (bSplit / 100);
        agentGross = netToMtr * (agentSplit / 100);
        mentorSplitAmount = isMentorActive ? netToMtr * (mentorSplit / 100) : 0;
      } else {
        brokerSplit = bSplit;
        mentorSplitAmount = isMentorActive ? netToMtr * (mentorSplit / 100) : 0;
        agentGross = netToMtr - bSplit - mentorSplitAmount;
      }

      if (agentGross < 800) {
        const deficiency = 800 - agentGross;
        agentGross = 800;
        brokerSplit = Math.max(0, brokerSplit - deficiency);
      }
    }
  } else {
    if (splitType === 'percentage' || hasOverride) {
      brokerSplit = netToMtr * (bSplit / 100);
      agentGross = netToMtr * (agentSplit / 100);
      mentorSplitAmount = isMentorActive ? netToMtr * (mentorSplit / 100) : 0;
    } else {
      brokerSplit = bSplit;
      mentorSplitAmount = isMentorActive ? netToMtr * (mentorSplit / 100) : 0;
      agentGross = netToMtr - bSplit - mentorSplitAmount;
    }
  }

  if (req.isOwnerAgent && !req.payAgent) {
    agentGross = 0;
  }

  // Apply Agent Cap calculation!
  const capAmount = agentProfile?.commissionProfile?.capAmount !== undefined
    ? agentProfile.commissionProfile.capAmount
    : 15000;

  if (brokerSplit > 0 && !isInexperienced) {
    if (ytdSplitPaid >= capAmount) {
      brokerSplit = 0;
      agentGross = (req.isOwnerAgent && !req.payAgent) ? 0 : netToMtr - mentorSplitAmount;
    } else if (ytdSplitPaid + brokerSplit > capAmount) {
      const remainingToCap = Math.max(0, capAmount - ytdSplitPaid);
      brokerSplit = remainingToCap;
      agentGross = (req.isOwnerAgent && !req.payAgent) ? 0 : netToMtr - remainingToCap - mentorSplitAmount;
    }
  }

  return {
    baseCommission: Number(baseCommission.toFixed(2)),
    grossCommission: Number(gross.toFixed(2)),
    brokerSplitAmount: Number(brokerSplit.toFixed(2)),
    companySplitAmount: Number(brokerSplit.toFixed(2)),
    agentGrossAmount: Number(agentGross.toFixed(2)),
    mentorSplitAmount: Number(mentorSplitAmount.toFixed(2)),
    coBrokerSplitAmount: Number(coBrokerSplitAmount.toFixed(2)),
    referralAmount: Number(referralAmount.toFixed(2)),
    bonusAmount: Number(bonusAmount.toFixed(2)),
    rebateAmount: Number(rebateAmount.toFixed(2)),
  };
}

export async function recalculateAndPersistCDACaps() {
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const cdaSnap = await getDocs(collection(db, 'cdaRequests'));
    const salesSnap = await getDocs(collection(db, 'salesHistory'));
    const usersSnap = await getDocs(collection(db, 'users'));

    const allCda: any[] = cdaSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allSales: any[] = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allUsers: any[] = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const approvedCDAs = allCda.filter(r => r.status === 'approved');

    const agentMap = new Map<string, any[]>();

    approvedCDAs.forEach(cda => {
      const lic = cda.licenseNumber || cda.agentLicense || '';
      const email = cda.agentEmail || '';
      const name = cda.agentName || '';
      const uid = cda.agentId || '';

      const matchedUser = allUsers.find(u => 
        (uid && (u.uid === uid || u.id === uid)) ||
        (lic && matchLicense(u.licenseNumber, lic)) ||
        (email && u.email && u.email.toLowerCase() === email.toLowerCase()) ||
        (name && u.name && u.name.trim().toLowerCase() === name.trim().toLowerCase())
      );

      const agentKey = matchedUser?.id || matchedUser?.uid || lic || email || name || 'unknown';

      if (!agentMap.has(agentKey)) {
        agentMap.set(agentKey, []);
      }
      agentMap.get(agentKey)!.push({ cda, matchedUser });
    });

    for (const [key, items] of agentMap.entries()) {
      if (key === 'unknown' || items.length === 0) continue;

      const matchedUser = items[0].matchedUser || {
        licenseNumber: items[0].cda.agentLicense || items[0].cda.licenseNumber,
        email: items[0].cda.agentEmail,
        name: items[0].cda.agentName,
        commissionProfile: { capAmount: 15000, agentSplit: 80, brokerSplit: 20 }
      };

      let salesHistorySplit = 0;
      const brokerSplitPct = matchedUser.commissionProfile?.brokerSplit !== undefined
        ? matchedUser.commissionProfile.brokerSplit
        : 20;

      allSales.forEach(sh => {
        const shLic = String(sh.license || '').trim();
        const matchLic = matchedUser.licenseNumber && matchLicense(matchedUser.licenseNumber, shLic);
        const matchName = matchedUser.name && shLic.toLowerCase() === matchedUser.name.trim().toLowerCase();

        if (matchLic || matchName) {
          const price = Number(sh.price) || 0;
          const rate = Number(sh.rate) || 0;
          const gross = price * (rate / 100);
          const split = sh.companySplitAmount !== undefined
            ? Number(sh.companySplitAmount)
            : (gross * (brokerSplitPct / 100));
          salesHistorySplit += split;
        }
      });

      items.sort((a, b) => {
        const dateA = new Date(a.cda.approvedAt || a.cda.createdAt || a.cda.closingDate || 0).getTime();
        const dateB = new Date(b.cda.approvedAt || b.cda.createdAt || b.cda.closingDate || 0).getTime();
        return dateA - dateB;
      });

      let runningYtdSplit = salesHistorySplit;

      for (const item of items) {
        const req = item.cda;
        const newCalc = calculateCDASplit(req, matchedUser, runningYtdSplit);

        const currentBrokerSplit = Number(req.brokerSplitAmount ?? req.companySplitAmount ?? 0);
        const currentAgentGross = Number(req.agentGrossAmount ?? 0);

        if (Math.abs(currentBrokerSplit - newCalc.brokerSplitAmount) > 0.01 || Math.abs(currentAgentGross - newCalc.agentGrossAmount) > 0.01) {
          await updateDoc(doc(db, 'cdaRequests', req.id), {
            ...newCalc
          });
        }

        runningYtdSplit += newCalc.brokerSplitAmount;
      }
    }
  } catch (error) {
    console.error('Error in recalculateAndPersistCDACaps:', error);
  }
}

