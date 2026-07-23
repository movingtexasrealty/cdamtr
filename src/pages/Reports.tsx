/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  getDocs, 
  addDoc, 
  writeBatch, 
  doc, 
  limit 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  Download, 
  Upload, 
  Filter, 
  Calendar, 
  ChevronDown,
  TrendingUp,
  Award,
  X,
  ExternalLink,
  ShieldCheck,
  Printer,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  Trash2,
  FileSpreadsheet
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { matchLicense, normalizeDate } from '../lib/capCalculator';

const DEFAULT_CSV_DATA = `Date, License, Type, Price, Rate
2026-05-01,"603020","Sales",190000,3
2026-05-01,"566153","Sales",190000,3
2026-04-30,"788421","Sales",237000,3
2026-04-30,"566153","Sales",169000,3
2026-04-23,"788421","Sales",239000,3
2026-04-21,"506471","Sales",415000,1.5
2026-04-17,"603020","Sales",275000,3
2026-04-16,"506471","Sales",260000,3
2026-04-10,"566153","Sales",250000,3
2026-03-11,"506471","Sales",365000,2.5
2026-03-09,"788421","Sales",245000,0.21
2026-03-01,"603020","Leases",2105,100
2025-12-30,"506471","Sales",302000,3
2025-12-17,"506471","Sales",143750,3
2025-12-14,"506471","Sales",304990,3
2025-11-19,"506471","Sales",287990,3
2025-11-14,"566153","Land",82950,3
2025-11-14,"566153","Land",85950,3
2025-11-12,"506471","Sales",580000,3
2025-10-31,"603020","Leases",1890,100
2025-10-28,"566153","Leases",1850,70
2025-09-26,"566153","Sales",211400,3
2025-09-25,"506471","Sales",309990,3
2025-09-17,"678452","Sales",658000,3
2025-09-25,"678452","Sales",680000,3
2025-08-02,"566153","Leases",2035,100
2025-07-31,"566153","Leases",2000,70
2025-07-24,"566153","Sales",335900,3
2025-07-14,"603020","Leases",2000,100
2025-07-11,"603020","Sales",285000,3
2025-07-02,"506471","Sales",285000,3
2025-06-30,"566153","Sales",533000,3
2025-06-27,"566153","Sales",599900,3
2025-06-12,"566153","Leases",2335,100
2025-05-30,"603020","Leases",1850,100
2025-05-29,"566153","Sales",335550,4
2025-05-27,"603020","Leases",1950,100
2025-03-31,"603020","Leases",1870,100
2025-03-11,"603020","Leases",1850,100
2025-03-03,"603020","Leases",2035,50
2025-02-27,"603020","Leases",2000,100
2025-02-27,"566153","Leases",1850,100
2025-01-29,"603020","Leases",1870,100`;

function parseCSVRows(csvText: string) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  };

  const headerLine = parseLine(lines[0]);
  const headers = headerLine.map(h => h.toLowerCase());

  let dateIdx = headers.findIndex(h => h.includes('date') || h.includes('closing'));
  let licenseIdx = headers.findIndex(h => h.includes('license') || h.includes('agent') || h.includes('realtor'));
  let typeIdx = headers.findIndex(h => h.includes('type') || h.includes('category') || h.includes('property'));
  let priceIdx = headers.findIndex(h => h.includes('price') || h.includes('volume') || h.includes('amount') || h.includes('sales'));
  let rateIdx = headers.findIndex(h => h.includes('rate') || h.includes('split') || h.includes('commission') || h.includes('%'));

  if (dateIdx === -1) dateIdx = 0;
  if (licenseIdx === -1) licenseIdx = 1;
  if (typeIdx === -1) typeIdx = 2;
  if (priceIdx === -1) priceIdx = 3;
  if (rateIdx === -1) rateIdx = 4;

  const records: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length < 2) continue;

    const rawDate = cols[dateIdx] || new Date().toISOString().split('T')[0];
    const normDate = normalizeDate(rawDate);
    const license = cols[licenseIdx] || 'UNKNOWN';
    const type = cols[typeIdx] || 'Sales';

    const rawPrice = (cols[priceIdx] || '0').replace(/[\$,]/g, '');
    const rawRate = (cols[rateIdx] || '3').replace(/[%]/g, '');

    const price = parseFloat(rawPrice) || 0;
    const rate = parseFloat(rawRate) || 3;

    records.push({
      date: normDate,
      license: license,
      type: type,
      price: price,
      rate: rate,
      createdAt: new Date().toISOString()
    });
  }

  return records;
}

export default function Reports() {
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [cdaRequests, setCdaRequests] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  const [selectedType, setSelectedType] = useState<string>('All');
  const [dateRange, setDateRange] = useState({ 
    start: '2000-01-01', 
    end: '2099-12-31' 
  });
  const [datePreset, setDatePreset] = useState<'all' | '2026' | '2025' | 'last12' | 'custom'>('all');

  // Insurance Renewal States
  const [activeTab, setActiveTab] = useState<'production' | 'insurance'>('production');
  const [insurancePeriod, setInsurancePeriod] = useState<string>('2025');
  const [projectedGrowth, setProjectedGrowth] = useState<number>(5);
  const [manualEstimates, setManualEstimates] = useState<Record<string, { transactions?: number; income?: number }>>({});

  useEffect(() => {
    // Fetch all sales history
    const unsubscribe = onSnapshot(collection(db, 'salesHistory'), (snapshot) => {
      setSalesHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'salesHistory');
    });

    // Fetch agents for matching licenses
    const unsubAgents = onSnapshot(collection(db, 'users'), (snapshot) => {
      setAgents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    // Fetch all cdaRequests
    const unsubCDAs = onSnapshot(collection(db, 'cdaRequests'), (snapshot) => {
      setCdaRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'cdaRequests');
    });

    return () => { 
      unsubscribe(); 
      unsubAgents(); 
      unsubCDAs();
    };
  }, []);

  const processCSVText = async (csvText: string) => {
    setImporting(true);
    try {
      const records = parseCSVRows(csvText);
      if (records.length === 0) {
        alert('No valid sales records found in the provided CSV file.');
        setImporting(false);
        return;
      }

      // Write in batches of 500
      for (let i = 0; i < records.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = records.slice(i, i + 500);
        chunk.forEach((item) => {
          const docRef = doc(collection(db, 'salesHistory'));
          batch.set(docRef, item);
        });
        await batch.commit();
      }

      alert(`Successfully imported ${records.length} sales records!`);
      setShowImportModal(false);
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import CSV data. Please check your CSV file formatting.');
    } finally {
      setImporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        await processCSVText(text);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      alert('Error reading the selected CSV file.');
    };
    reader.readAsText(file);
  };

  const loadDefaultSampleData = async () => {
    await processCSVText(DEFAULT_CSV_DATA);
  };

  const clearSalesHistory = async () => {
    setClearingHistory(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'salesHistory'));
      const docs = querySnapshot.docs;
      
      // Delete in batches of 500
      for (let i = 0; i < docs.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 500);
        chunk.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }
      
      setShowClearHistoryConfirm(false);
      alert('Successfully removed all previous sales data.');
    } catch (error) {
      console.error('Failed to clear sales history:', error);
      alert('Failed to clear sales history.');
    } finally {
      setClearingHistory(false);
    }
  };

  const getCombinedProductionTransactions = () => {
    const list: any[] = [];

    // 1. Historical imported sales
    salesHistory.forEach((sh) => {
      const lic = String(sh.license || '').trim();
      const normDate = normalizeDate(sh.date);
      const price = Number(sh.price) || 0;
      const rate = Number(sh.rate) || 0;
      const grossComm = price * (rate / 100);

      // Find matching agent profile for commission split
      const agent = agents.find(a => 
        matchLicense(a.licenseNumber, lic) ||
        (a.email && a.email.toLowerCase() === lic.toLowerCase()) ||
        (a.name && a.name.trim().toLowerCase() === lic.toLowerCase())
      );

      const brokerSplitPct = agent?.commissionProfile?.brokerSplit !== undefined
        ? agent.commissionProfile.brokerSplit
        : 20;

      const companySplit = sh.companySplitAmount !== undefined
        ? Number(sh.companySplitAmount)
        : (grossComm * (brokerSplitPct / 100));

      const agentKey = agent ? agent.id : (lic ? `lic_${lic.toLowerCase().replace(/\D/g, '') || lic.toLowerCase()}` : 'unassigned');
      const agentName = agent?.name || (lic && lic !== 'UNKNOWN' ? `License: ${lic}` : 'Unassigned Agent');

      list.push({
        id: sh.id || `sh_${Math.random()}`,
        source: 'salesHistory',
        date: normDate,
        license: lic,
        type: sh.type || 'Sales',
        price: price,
        rate: rate,
        grossCommission: grossComm,
        companySplitPaid: companySplit,
        agentName: agentName,
        agentId: agentKey,
        agentObj: agent
      });
    });

    // 2. Approved CDA Requests
    cdaRequests.forEach((req) => {
      if (req.status !== 'approved') return;

      const normDate = normalizeDate(req.closingDate || req.createdAt);
      const lic = req.licenseNumber || req.agentName || 'CDA Agent';
      const price = Number(req.salePrice) || 0;
      const grossComm = Number(req.grossCommission) || 0;
      const companySplit = Number(req.companySplitAmount || req.brokerSplitAmount) || 0;

      const agent = agents.find(a => 
        (req.agentId && a.id === req.agentId) || 
        matchLicense(a.licenseNumber, lic) ||
        (a.email && req.agentEmail && a.email.toLowerCase() === req.agentEmail.toLowerCase()) ||
        (a.name && req.agentName && a.name.trim().toLowerCase() === req.agentName.trim().toLowerCase())
      );

      const agentKey = agent ? agent.id : (req.agentId || `lic_${lic.toLowerCase().replace(/\D/g, '') || lic.toLowerCase()}`);
      const agentName = agent?.name || req.agentName || `License: ${lic}`;

      list.push({
        id: req.id,
        source: 'cdaRequest',
        date: normDate,
        license: lic,
        type: req.propertyType || 'Home Sale',
        price: price,
        rate: req.commissionRate || (price > 0 ? Number(((grossComm / price) * 100).toFixed(2)) : 3),
        grossCommission: grossComm,
        companySplitPaid: companySplit,
        agentName: agentName,
        agentId: agentKey,
        address: req.propertyAddress || 'CDA Request',
        agentObj: agent
      });
    });

    return list;
  };

  const allProductionTx = getCombinedProductionTransactions();

  const uniqueTypes = ['All', ...Array.from(new Set(allProductionTx.map(s => s.type).filter(Boolean)))];

  const filteredHistory = allProductionTx.filter(s => {
    const normDate = normalizeDate(s.date);
    const matchDate = normDate >= dateRange.start && normDate <= dateRange.end;
    const matchType = selectedType === 'All' || s.type === selectedType;
    return matchDate && matchType;
  });

  const agentProductionMap: Record<string, any> = {};

  // Seed agentProductionMap with all active roster agents so every agent is displayed in the production table
  agents.forEach(agent => {
    const key = agent.id;
    if (!key) return;
    const capAmount = agent?.commissionProfile?.capAmount !== undefined ? agent.commissionProfile.capAmount : 15000;
    const isInexperienced = !!agent?.commissionProfile?.isInexperienced;

    agentProductionMap[key] = {
      key,
      name: agent.name || `License: ${agent.licenseNumber}`,
      license: agent.licenseNumber || '',
      volume: 0,
      count: 0,
      grossCommission: 0,
      brokerSplitPaid: 0,
      capAmount,
      isInexperienced,
      transactions: [],
      agentObj: agent
    };
  });

  filteredHistory.forEach(curr => {
    const key = curr.agentId || 'Unknown';
    if (!agentProductionMap[key]) {
      const agent = curr.agentObj || agents.find(a => a.id === key || matchLicense(a.licenseNumber, curr.license));
      const capAmount = agent?.commissionProfile?.capAmount !== undefined ? agent.commissionProfile.capAmount : 15000;
      const isInexperienced = !!agent?.commissionProfile?.isInexperienced;

      agentProductionMap[key] = {
        key,
        name: agent?.name || curr.agentName || `License: ${curr.license}`,
        license: agent?.licenseNumber || curr.license,
        volume: 0,
        count: 0,
        grossCommission: 0,
        brokerSplitPaid: 0,
        capAmount,
        isInexperienced,
        transactions: [],
        agentObj: agent
      };
    }

    agentProductionMap[key].volume += curr.price;
    agentProductionMap[key].count += 1;
    agentProductionMap[key].grossCommission += curr.grossCommission;
    agentProductionMap[key].brokerSplitPaid += curr.companySplitPaid;
    agentProductionMap[key].transactions.push(curr);
  });

  const chartData = Object.values(agentProductionMap)
    .map((item: any) => {
      const capPct = item.capAmount > 0 
        ? Math.min(100, Math.round((item.brokerSplitPaid / item.capAmount) * 100))
        : 100;
      const isCapped = item.capAmount > 0 ? item.brokerSplitPaid >= item.capAmount : false;
      return {
        ...item,
        capPct,
        isCapped
      };
    })
    .sort((a: any, b: any) => b.volume - a.volume);

  const handleDatePresetChange = (preset: 'all' | '2026' | '2025' | 'last12' | 'custom') => {
    setDatePreset(preset);
    const today = new Date().toISOString().split('T')[0];
    if (preset === 'all') {
      setDateRange({ start: '2000-01-01', end: '2099-12-31' });
    } else if (preset === '2026') {
      setDateRange({ start: '2026-01-01', end: '2026-12-31' });
    } else if (preset === '2025') {
      setDateRange({ start: '2025-01-01', end: '2025-12-31' });
    } else if (preset === 'last12') {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      setDateRange({ start: d.toISOString().split('T')[0], end: today });
    }
  };

  const agentTransactions = selectedAgent 
    ? (selectedAgent.transactions || [])
        .sort((a: any, b: any) => b.date.localeCompare(a.date))
    : [];

  // INSURANCE HELPER FUNCTIONS
  const getCombinedTransactions = () => {
    const transactions: any[] = [];

    salesHistory.forEach((sh) => {
      let type = 'Home Sale';
      if (sh.type === 'Leases') type = 'Lease';
      else if (sh.type === 'Land') type = 'Land';

      transactions.push({
        id: sh.id,
        date: sh.date,
        type: type,
        price: sh.price || 0,
        commission: sh.price * ((sh.rate || 0) / 100),
        client: 'Historical Client',
        isOwnerAgent: false,
        address: sh.address || 'Historical Sale',
        agentName: 'Historical Agent'
      });
    });

    cdaRequests.forEach((req) => {
      if (req.status !== 'approved') return;
      const date = req.closingDate || req.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0];
      transactions.push({
        id: req.id,
        date: date,
        type: req.propertyType || 'Home Sale',
        price: req.salePrice || 0,
        commission: req.grossCommission || 0,
        client: req.sellerName || req.buyerName || 'Client',
        isOwnerAgent: !!req.isOwnerAgent,
        address: req.propertyAddress || 'No Address',
        agentName: req.agentName || 'MTR Agent'
      });
    });

    return transactions;
  };

  const getInsuranceDateRange = () => {
    const today = new Date();
    if (insurancePeriod === '2025') {
      return { start: '2025-01-01', end: '2025-12-31' };
    } else if (insurancePeriod === '2026') {
      return { start: '2026-01-01', end: '2026-12-31' };
    } else if (insurancePeriod === 'last12') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      return {
        start: oneYearAgo.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      };
    } else {
      return { start: dateRange.start, end: dateRange.end };
    }
  };

  const categories = [
    { key: 'a', label: 'a. Residential Brokerage (1-4 units)', types: ['Home Sale'] },
    { key: 'b', label: 'b. Commercial, Industrial, or Income Property', types: ['Commercial'] },
    { key: 'c', label: 'c. Land and Lot', types: ['Land'] },
    { key: 'd', label: 'd. Farm, Agriculture, Vineyard and/or Forestry', types: [] },
    { key: 'e', label: 'e. Residential Real Estate Appraisal', types: [] },
    { key: 'f', label: 'f. Commercial Real Estate Appraisal', types: [] },
    { key: 'g', label: 'g. Real Estate Leasing Fees', types: ['Lease'] },
    { key: 'h', label: 'h. Residential Property Management (1-4 Units)', types: [] },
    { key: 'i', label: 'i. Commercial Property Management (5+ Units)', types: [] },
    { key: 'j', label: 'j. Association Management (Condo, Co-Op, etc.)', types: [] },
    { key: 'k', label: 'k. Mortgage Brokerage/Financial Arrangements', types: [] },
    { key: 'l', label: 'l. Business Opportunities Brokerages', types: [] },
    { key: 'm', label: 'm. Real Estate Consulting/Counseling', types: [] },
    { key: 'n', label: 'n. Other (Referral Fees)', types: ['Referral'] },
  ];

  const handleEstimateChange = (key: string, field: 'transactions' | 'income', value: string) => {
    const num = value === '' ? undefined : parseFloat(value);
    setManualEstimates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: num
      }
    }));
  };

  const resetEstimates = () => {
    setManualEstimates({});
  };

  const range = getInsuranceDateRange();
  const allTx = getCombinedTransactions();
  const pastTxList = allTx.filter(tx => tx.date >= range.start && tx.date <= range.end);

  const calculatedRows = categories.map((cat) => {
    const matchedTx = pastTxList.filter((tx) => cat.types.includes(tx.type));
    const pastCount = matchedTx.length;
    const pastIncome = matchedTx.reduce((sum, tx) => sum + (tx.commission || 0), 0);

    const projectedMultiplier = 1 + (projectedGrowth / 100);
    
    const estCountOverride = manualEstimates[cat.key]?.transactions;
    const estCount = estCountOverride !== undefined ? estCountOverride : Math.round(pastCount * projectedMultiplier);

    const estIncomeOverride = manualEstimates[cat.key]?.income;
    const estIncome = estIncomeOverride !== undefined ? estIncomeOverride : Number((pastIncome * projectedMultiplier).toFixed(2));

    return {
      ...cat,
      pastCount,
      pastIncome,
      estCount,
      estIncome,
    };
  });

  const totalPastCount = calculatedRows.reduce((sum, row) => sum + row.pastCount, 0);
  const totalPastIncome = calculatedRows.reduce((sum, row) => sum + row.pastIncome, 0);
  const totalEstCount = calculatedRows.reduce((sum, row) => sum + row.estCount, 0);
  const totalEstIncome = calculatedRows.reduce((sum, row) => sum + row.estIncome, 0);

  // Operations Metrics Calculation
  const clientCommissions: Record<string, number> = {};
  pastTxList.forEach((tx) => {
    const client = tx.client || 'Unknown Client';
    if (client !== 'Historical Client' && client !== 'Client' && client !== 'Unknown Client') {
      clientCommissions[client] = (clientCommissions[client] || 0) + tx.commission;
    }
  });
  
  let largestClient = '';
  let largestCommission = 0;
  Object.entries(clientCommissions).forEach(([client, comm]) => {
    if (comm > largestCommission) {
      largestCommission = comm;
      largestClient = client;
    }
  });

  const concentrationPct = totalPastIncome > 0 ? (largestCommission / totalPastIncome) * 100 : 0;
  const hasConcentration = concentrationPct > 25;

  const ownerAgentTx = pastTxList.filter((tx) => tx.isOwnerAgent);
  const totalOwnerAgentIncome = ownerAgentTx.reduce((sum, tx) => sum + tx.commission, 0);
  const hasOwnerAgentTransactions = ownerAgentTx.length > 0;

  // Dual Agency Representation matching by identical non-empty property address
  const addressCounts: Record<string, number> = {};
  pastTxList.forEach((tx) => {
    if (tx.address && tx.address !== 'Historical Sale' && tx.address !== 'No Address') {
      const cleanAddress = tx.address.trim().toLowerCase();
      addressCounts[cleanAddress] = (addressCounts[cleanAddress] || 0) + 1;
    }
  });
  
  const dualTxCount = Object.values(addressCounts).filter(count => count >= 2).length;
  const dualAgencyPercentage = totalPastCount > 0 ? (dualTxCount / totalPastCount) * 100 : 0;

  const soldTx = pastTxList.filter(tx => tx.type === 'Home Sale' || tx.type === 'Land' || tx.type === 'Commercial');
  const totalSoldPrice = soldTx.reduce((sum, tx) => sum + tx.price, 0);
  const avgPropertyValue = soldTx.length > 0 ? totalSoldPrice / soldTx.length : 0;

  return (
    <div className="space-y-8 pb-20">
      {/* Header and switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Production & RENEWAL Reports</h1>
          <p className="text-sm font-semibold text-slate-500">Analyze performance or assist your E&amp;O liability renewal.</p>
        </div>

        <div className="bg-slate-100 p-1 rounded-xl flex border border-slate-200">
          <button
            onClick={() => setActiveTab('production')}
            className={`px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all duration-200 ${
              activeTab === 'production' 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Production Analytics
          </button>
          <button
            onClick={() => setActiveTab('insurance')}
            className={`px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'insurance' 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShieldCheck size={14} className={activeTab === 'insurance' ? 'text-emerald-500' : 'text-slate-400'} />
            Insurance Renewal Helper
          </button>
        </div>
      </div>

      {activeTab === 'production' ? (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Production Reports</h2>
              <p className="text-slate-500">Analyze performance across all agents and periods.</p>
            </div>
            <div className="flex items-center gap-3">
              {salesHistory.length > 0 && (
                <button 
                  onClick={() => setShowClearHistoryConfirm(true)}
                  className="flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-100 px-4 py-2.5 rounded-xl font-bold hover:bg-rose-100 transition-colors text-sm"
                  title="Remove all imported sales history"
                >
                  <Trash2 size={18} />
                  Remove Imported History
                </button>
              )}
              <button 
                onClick={() => setShowImportModal(true)}
                disabled={importing}
                className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm disabled:opacity-50"
              >
                <Upload size={18} />
                {importing ? 'Importing...' : 'Import History'}
              </button>
              <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all text-sm">
                <Download size={18} />
                Export 1099
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Time Period:</span>
              <button
                type="button"
                onClick={() => handleDatePresetChange('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  datePreset === 'all'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Time ({allProductionTx.length} Records)
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange('2026')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  datePreset === '2026'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                2026 YTD
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange('2025')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  datePreset === '2025'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                2025
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange('last12')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  datePreset === 'last12'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Trailing 12 Mo.
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-slate-400" />
                <input 
                  type="date" 
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none hover:border-blue-300 focus:border-blue-500 transition-colors"
                  value={dateRange.start}
                  onChange={e => {
                    setDatePreset('custom');
                    setDateRange({...dateRange, start: e.target.value});
                  }}
                />
                <span className="text-slate-400 text-xs font-medium">to</span>
                <input 
                  type="date" 
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none hover:border-blue-300 focus:border-blue-500 transition-colors"
                  value={dateRange.end}
                  onChange={e => {
                    setDatePreset('custom');
                    setDateRange({...dateRange, end: e.target.value});
                  }}
                />
              </div>

              <div className="h-5 w-px bg-slate-200 hidden sm:block" />

              <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-400" />
                <select
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none hover:border-blue-300 focus:border-blue-500 transition-colors cursor-pointer"
                  value={selectedType}
                  onChange={e => setSelectedType(e.target.value)}
                >
                  {uniqueTypes.map(t => (
                    <option key={t} value={t}>
                      {t === 'All' ? 'All Types' : t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-500" />
                Top Volume by Agent
              </h3>
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}}
                      width={130}
                    />
                    <Tooltip 
                      cursor={{fill: '#f8fafc'}}
                      contentStyle={{backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                      formatter={(value: any) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    <Bar 
                      dataKey="volume" 
                      radius={[0, 8, 8, 0]} 
                      barSize={20}
                      style={{ cursor: 'pointer' }}
                      onClick={(data) => setSelectedAgent(data)}
                    >
                      {chartData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#1e3a8a' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Award size={20} className="text-amber-500" />
                  Production &amp; Capping Table
                </h3>
                <span className="text-xs font-bold text-slate-400">
                  Showing {chartData.length} Agents
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Agent</th>
                      <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Units</th>
                      <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Volume</th>
                      <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Gross Comm</th>
                      <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Split Paid</th>
                      <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Cap Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {chartData.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-slate-400">No production data for selected period.</td></tr>
                    ) : (
                      chartData.map((item: any) => (
                        <tr 
                          key={item.key} 
                          className="group hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => setSelectedAgent(item)}
                        >
                          <td className="py-3.5">
                            <div className="flex items-center gap-2">
                              <div>
                                <span className="font-bold text-slate-800 block text-sm group-hover:text-blue-600 transition-colors">{item.name}</span>
                                {item.license && item.license !== item.name && (
                                  <span className="text-[10px] text-slate-400 font-semibold block">Lic: {item.license}</span>
                                )}
                              </div>
                              <ExternalLink size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                            </div>
                          </td>
                          <td className="py-3.5 text-right text-slate-600 font-bold text-sm">{item.count}</td>
                          <td className="py-3.5 text-right font-black text-slate-900 text-sm">${item.volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 text-right font-bold text-blue-600 text-sm">${item.grossCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 text-right font-bold text-emerald-600 text-sm">${item.brokerSplitPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 text-right">
                            {item.isInexperienced ? (
                              <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full inline-block">Exempt</span>
                            ) : item.isCapped ? (
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <CheckCircle2 size={11} /> Capped!
                              </span>
                            ) : (
                              <div className="text-right inline-block">
                                <span className="text-[11px] font-bold text-slate-600 block">
                                  ${item.brokerSplitPaid.toLocaleString()} / ${item.capAmount.toLocaleString()}
                                </span>
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden ml-auto mt-0.5 border border-slate-200">
                                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${item.capPct}%` }} />
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* INSURANCE RENEWAL QUESTIONNAIRE VIEW */}
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 print:bg-white print:border-none print:p-0">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
                <ShieldCheck className="text-emerald-600 print:hidden" />
                CNA / Victor Liability Insurance Renewal Report
              </h2>
              <p className="text-sm text-emerald-700 print:text-slate-600">
                This report is specifically formatted to match <strong className="font-bold">Section 2: Professional Services</strong> of your annual E&amp;O insurance renewal application. It aggregates raw income, transaction counts, and applies projections.
              </p>
            </div>
            <div className="flex items-center gap-3 print:hidden">
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all text-sm"
              >
                <Printer size={18} />
                Print PDF Reference
              </button>
            </div>
          </div>

          {/* Configuration Controls */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
            {/* Period Selector */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">1. Select Past Fiscal Year</label>
              <div className="relative">
                <Calendar size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none hover:border-emerald-300 focus:border-emerald-500 transition-colors cursor-pointer appearance-none animate-none"
                  value={insurancePeriod}
                  onChange={e => setInsurancePeriod(e.target.value)}
                >
                  <option value="2025">Calendar Year 2025</option>
                  <option value="2026">Calendar Year 2026 (YTD)</option>
                  <option value="last12">Last 12 Months (Trailing)</option>
                </select>
                <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Past Year Date Range: {range.start} to {range.end}
              </p>
            </div>

            {/* Growth rate projection input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">2. Projected Growth Estimator</label>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">+{projectedGrowth}%</span>
              </div>
              <div className="flex items-center gap-4 py-1">
                <input 
                  type="range" 
                  min="-50" 
                  max="100" 
                  step="5"
                  className="flex-1 accent-emerald-600 h-2 bg-slate-100 rounded-lg cursor-pointer"
                  value={projectedGrowth}
                  onChange={e => setProjectedGrowth(parseInt(e.target.value))}
                />
                <input 
                  type="number" 
                  className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 text-center"
                  value={projectedGrowth}
                  onChange={e => setProjectedGrowth(parseInt(e.target.value) || 0)}
                />
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Automatically projects "Next 12 Months: Estimates" column values.
              </p>
            </div>

            {/* Reset overrides */}
            <div className="space-y-2 flex flex-col justify-end">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">3. Adjust Projections</label>
              <button
                onClick={resetEstimates}
                disabled={Object.keys(manualEstimates).length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-sm disabled:opacity-40"
              >
                <RotateCcw size={16} />
                Reset Estimate Overrides
              </button>
              <p className="text-[10px] text-slate-400 italic text-center">
                Click any cell in the "Next 12 Months: Estimates" column to manually adjust.
              </p>
            </div>
          </div>

          {/* Section 2 Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-8 print:border-none print:p-0">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">CNA Section 2: Professional Services Table</h3>
                <p className="text-xs text-slate-400">Values represent <strong className="font-bold">Gross Commissions BEFORE splits</strong> with agents or salespeople.</p>
              </div>
              <div className="text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 flex items-center gap-1.5 print:hidden">
                <Check size={14} /> Correct Lease / Co-Broker calculation applied
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-2/5">Employee Category / Service</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center border-l border-slate-100" colSpan={2}>
                      Past Fiscal Year Ending ({insurancePeriod})
                    </th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center border-l border-slate-100" colSpan={2}>
                      Next 12 Months: Estimates
                    </th>
                  </tr>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/20">
                    <th className="p-3 text-xs font-bold italic">Do not report property values</th>
                    <th className="p-3 text-xs font-bold text-center border-l border-slate-100 w-24">Transactions</th>
                    <th className="p-3 text-xs font-bold text-right w-36">Income</th>
                    <th className="p-3 text-xs font-bold text-center border-l border-slate-100 w-24">Transactions</th>
                    <th className="p-3 text-xs font-bold text-right w-36">Income</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {calculatedRows.map((row) => {
                    const isOverriddenTx = manualEstimates[row.key]?.transactions !== undefined;
                    const isOverriddenIncome = manualEstimates[row.key]?.income !== undefined;
                    const hasData = row.pastCount > 0 || row.pastIncome > 0;

                    return (
                      <tr 
                        key={row.key} 
                        className={`hover:bg-slate-50/50 transition-colors ${
                          hasData ? 'bg-emerald-50/5 font-semibold text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        <td className="p-4 font-medium text-slate-700">
                          {row.label}
                        </td>

                        <td className="p-4 text-center font-bold text-slate-800 border-l border-slate-100 bg-slate-50/20">
                          {row.pastCount > 0 ? row.pastCount : '—'}
                        </td>

                        <td className="p-4 text-right font-black text-slate-900">
                          {row.pastIncome > 0 ? `$${row.pastIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </td>

                        <td className="p-2 text-center border-l border-slate-100 bg-slate-50/20 print:p-4">
                          <input
                            type="number"
                            className={`w-full bg-transparent border-none text-center outline-none font-bold text-slate-800 focus:bg-emerald-50 focus:ring-1 focus:ring-emerald-300 rounded-md py-2 transition-all print:text-center ${
                              isOverriddenTx ? 'text-emerald-600 bg-emerald-50/30' : ''
                            }`}
                            placeholder="0"
                            value={row.estCount === 0 ? '' : row.estCount}
                            onChange={(e) => handleEstimateChange(row.key, 'transactions', e.target.value)}
                          />
                        </td>

                        <td className="p-2 text-right print:p-4">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-slate-400">$</span>
                            <input
                              type="number"
                              className={`w-28 bg-transparent border-none text-right outline-none font-black text-slate-900 focus:bg-emerald-50 focus:ring-1 focus:ring-emerald-300 rounded-md py-2 transition-all print:text-right ${
                                isOverriddenIncome ? 'text-emerald-600 bg-emerald-50/30' : ''
                              }`}
                              placeholder="0.00"
                              step="0.01"
                              value={row.estIncome === 0 ? '' : row.estIncome}
                              onChange={(e) => handleEstimateChange(row.key, 'income', e.target.value)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="bg-slate-900 text-white font-bold text-sm border-t-2 border-slate-800">
                    <td className="p-4 text-left uppercase tracking-wider font-black">
                      TOTAL GROSS INCOME
                    </td>
                    <td className="p-4 text-center border-l border-slate-700 bg-slate-800 font-black">
                      {totalPastCount}
                    </td>
                    <td className="p-4 text-right font-black">
                      ${totalPastIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-center border-l border-slate-700 bg-slate-800 font-black">
                      {totalEstCount}
                    </td>
                    <td className="p-4 text-right font-black">
                      ${totalEstIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Operations Assistant Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:break-inside-avoid">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-md font-bold text-slate-800 border-b pb-3 flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                Operations Questionnaire Assistant (Part A)
              </h3>

              <div className="space-y-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Question 4: Client Concentration</span>
                <p className="text-sm text-slate-700">
                  Does the firm have any one client which represents more than 25% of the firm's income?
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    hasConcentration 
                      ? 'bg-rose-50 text-rose-700 border-rose-100' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  }`}>
                    {hasConcentration ? 'YES (Concentration Detected)' : 'NO (Passes Limit)'}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {largestClient ? (
                      <>Largest Client: <strong className="font-semibold text-slate-700">{largestClient}</strong> represents {concentrationPct.toFixed(1)}% of income (${largestCommission.toLocaleString()})</>
                    ) : (
                      'No clients recorded in recent CDA requests'
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Question 5: Owned Properties</span>
                <p className="text-sm text-slate-700">
                  Does anyone in the firm sell/lease properties they own?
                </p>
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      hasOwnerAgentTransactions 
                        ? 'bg-rose-50 text-rose-700 border-rose-100 animate-pulse' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    }`}>
                      {hasOwnerAgentTransactions ? 'YES' : 'NO'}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      Total income from owner-agent properties: <strong className="font-semibold text-slate-700">${totalOwnerAgentIncome.toLocaleString()}</strong>
                    </span>
                  </div>
                  {hasOwnerAgentTransactions && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
                      <p className="font-semibold text-slate-700">Identified Owner-Agent Requests:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {ownerAgentTx.map((tx: any, idx) => (
                          <li key={idx}>
                            {tx.agentName} — {tx.address} (${tx.commission.toLocaleString()})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-md font-bold text-slate-800 border-b pb-3 flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                Operations Questionnaire Assistant (Part B)
              </h3>

              <div className="space-y-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Question 7: Dual Representation</span>
                <p className="text-sm text-slate-700">
                  Percentage of transactions in the past 12 months where the firm represented both buyer and seller?
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-2xl font-black text-emerald-600">
                    {dualAgencyPercentage.toFixed(1)}%
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {dualTxCount} dual-sided transaction(s) identified out of {totalPastCount} total transactions.
                  </span>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Question 8: Average Value Sold</span>
                <p className="text-sm text-slate-700">
                  What was the average value of properties sold by the firm in the past 12 months?
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-2xl font-black text-slate-900">
                    ${avgPropertyValue > 0 ? Math.round(avgPropertyValue).toLocaleString() : '0'}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    Calculated across {soldTx.length} sold propert{soldTx.length === 1 ? 'y' : 'ies'} (excluding lease transactions).
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Selected Agent Modal for Production View */}
      <AnimatePresence>
        {selectedAgent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAgent(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 mb-1">{selectedAgent.name}</h2>
                  <p className="text-sm text-slate-500 font-medium">
                    Performance Summary • {selectedAgent.count} transactions • {dateRange.start} to {dateRange.end}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedAgent(null)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Total Volume</p>
                    <p className="text-xl font-black text-blue-900 leading-none">
                      ${selectedAgent.volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Total Units</p>
                    <p className="text-xl font-black text-amber-900 leading-none">{selectedAgent.count}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross Commission</p>
                    <p className="text-xl font-black text-slate-900 leading-none">
                      ${(selectedAgent.grossCommission || selectedAgent.commission || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Broker Split Paid</p>
                    <p className="text-xl font-black text-emerald-900 leading-none">
                      ${(selectedAgent.brokerSplitPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Cap Progress Card */}
                <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl shadow-md">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-slate-300">Annual Cap Status</h4>
                        {selectedAgent.isInexperienced ? (
                          <span className="text-[10px] font-black uppercase text-purple-300 bg-purple-900/60 px-2.5 py-0.5 rounded-full border border-purple-700">Exempt (Inexperienced)</span>
                        ) : selectedAgent.isCapped ? (
                          <span className="text-[10px] font-black uppercase text-emerald-300 bg-emerald-900/60 px-2.5 py-0.5 rounded-full border border-emerald-700 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Capped!
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase text-blue-300 bg-blue-900/60 px-2.5 py-0.5 rounded-full border border-blue-700">In Progress</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Cap Target: <strong className="text-white">${(selectedAgent.capAmount || 15000).toLocaleString()}</strong> • 
                        Broker Split Paid: <strong className="text-emerald-400">${(selectedAgent.brokerSplitPaid || 0).toLocaleString()}</strong>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-white">{selectedAgent.capPct || 0}%</span>
                      <p className="text-[11px] text-slate-400 font-medium">
                        {selectedAgent.isCapped 
                          ? '100% Agent Split Unlocked' 
                          : `$${Math.max(0, (selectedAgent.capAmount || 15000) - (selectedAgent.brokerSplitPaid || 0)).toLocaleString()} remaining to cap`}
                      </p>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedAgent.isCapped ? 'bg-emerald-400' : 'bg-blue-500'
                      }`}
                      style={{ width: `${selectedAgent.capPct || 0}%` }}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date / Address</th>
                        <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Source</th>
                        <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Price</th>
                        <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Gross Comm</th>
                        <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Broker Split</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {agentTransactions.length === 0 ? (
                        <tr><td colSpan={5} className="py-6 text-center text-slate-400 text-sm">No transactions found for this agent.</td></tr>
                      ) : (
                        agentTransactions.map((tx, idx) => {
                          const gross = tx.grossCommission || (tx.price * (tx.rate / 100));
                          const split = tx.companySplitPaid || 0;
                          return (
                            <tr key={tx.id || idx} className="hover:bg-slate-50 transition-colors">
                              <td className="py-3">
                                <div className="text-sm font-bold text-slate-800">{tx.date}</div>
                                <div className="text-[11px] font-semibold text-slate-500 truncate max-w-[220px]">
                                  {tx.address || 'Historical Sales Transaction'}
                                </div>
                              </td>
                              <td className="py-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight ${
                                  tx.source === 'cdaRequest' 
                                    ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                  {tx.source === 'cdaRequest' ? 'CDA Request' : 'Imported CSV'}
                                </span>
                              </td>
                              <td className="py-3 text-sm font-bold text-slate-900 text-right">
                                ${tx.price.toLocaleString()}
                              </td>
                              <td className="py-3 text-sm font-bold text-blue-600 text-right">
                                ${gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 text-sm font-bold text-emerald-600 text-right">
                                ${split.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear Sales History Confirmation Modal */}
      {showClearHistoryConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-4 mb-4 text-rose-600">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-black">Remove Sales Data?</h3>
            </div>
            <p className="text-slate-600 mb-4 font-medium leading-relaxed">
              Are you sure you want to permanently remove all previously imported historical sales data?
            </p>
            <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100 mb-6 space-y-1">
              <p className="text-xs font-bold text-rose-800">Total records to be removed: {salesHistory.length}</p>
            </div>
            <p className="text-xs text-rose-500 font-bold uppercase mb-6">
              This action is permanent and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearHistoryConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-200"
                disabled={clearingHistory}
              >
                Cancel
              </button>
              <button
                onClick={clearSalesHistory}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={clearingHistory}
              >
                {clearingHistory ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Removing...
                  </>
                ) : (
                  'Yes, Remove'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-full"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3.5 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Import Sales History</h3>
                <p className="text-xs text-slate-500 font-semibold">Upload a .CSV file or load default sample data</p>
              </div>
            </div>

            <div className="space-y-4 my-6">
              {/* Option 1: Choose File */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-blue-200 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50/80 p-6 rounded-2xl text-center cursor-pointer transition-all group"
              >
                <Upload size={36} className="mx-auto mb-2 text-blue-500 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-black text-slate-900 block group-hover:text-blue-600 transition-colors">
                  Choose .CSV File from Computer
                </span>
                <span className="text-xs text-slate-500 font-medium block mt-1">
                  Click to select any sales CSV spreadsheet on your device
                </span>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".csv,text/csv" 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
              </div>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] font-extrabold uppercase text-slate-400 tracking-wider absolute">
                  OR
                </span>
              </div>

              {/* Option 2: Load Default Sample Data */}
              <button
                type="button"
                disabled={importing}
                onClick={loadDefaultSampleData}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-300 bg-slate-50/50 hover:bg-white text-slate-700 font-bold text-xs flex items-center justify-between transition-all group"
              >
                <div className="text-left">
                  <span className="block font-black text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                    Load Default Sample Sales Data
                  </span>
                  <span className="text-slate-500 font-medium text-[11px]">
                    Includes 43 sample historical sales &amp; lease records
                  </span>
                </div>
                <div className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-colors shadow-sm">
                  {importing ? 'Importing...' : 'Load Sample'}
                </div>
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-slate-500 space-y-1">
              <span className="font-bold text-slate-700 block">Expected CSV Header Format:</span>
              <p className="font-mono text-[10px] text-slate-600 font-semibold">
                Date, License, Type, Price, Rate
              </p>
              <p className="text-[10px] text-slate-400">
                Example row: 2026-05-01, "603020", "Sales", 250000, 3
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
