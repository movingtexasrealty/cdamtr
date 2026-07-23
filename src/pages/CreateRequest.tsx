/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { sendAdminNotificationEmail } from '../lib/emailService';
import { 
  Building2, 
  DollarSign, 
  User, 
  MapPin, 
  Mail, 
  Phone,
  Calculator,
  ArrowRight,
  Eye,
  Send,
  AlertCircle,
  Percent
} from 'lucide-react';

export default function CreateRequest() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalRequest, setOriginalRequest] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    propertyType: '' as 'Home Sale' | 'Lease' | 'Land' | 'Commercial' | 'Referral' | '',
    representation: '' as 'Seller' | 'Buyer' | '',
    sellerName: '',
    buyerName: '',
    propertyAddress: '',
    mlsNumber: '',
    closingDate: '',
    salePrice: undefined as number | undefined,
    rateType: 'percentage' as 'percentage' | 'flat',
    commissionRate: undefined as number | undefined,
    bonusRateType: 'percentage' as 'percentage' | 'flat',
    bonusRateValue: undefined as number | undefined,
    referralRateType: 'percentage' as 'percentage' | 'flat',
    referralRateValue: undefined as number | undefined,
    rebateRateType: 'percentage' as 'percentage' | 'flat',
    rebateRateValue: undefined as number | undefined,
    referralAgentName: '',
    referralBrokerName: '',
    referralBrokerAddress: '',
    titleCompanyName: '',
    escrowOfficerName: '',
    titleCompanyEmail: '',
    titleCompanyPhone: '',
    isOwnerAgent: false,
    payAgent: true,
    hasCoBroker: false,
    coBrokerName: '',
    coBrokerSplitPercentage: undefined as number | undefined,
    coBrokerSplitAmount: 0,
  });

  const [calc, setCalc] = useState({
    baseCommission: 0,
    grossCommission: 0,
    brokerSplitAmount: 0,
    agentGrossAmount: 0,
    mentorSplitAmount: 0,
    coBrokerSplitAmount: 0,
    referralAmount: 0,
    bonusAmount: 0,
    rebateAmount: 0,
  });

  const [ytdSplitPaid, setYtdSplitPaid] = useState(0);

  useEffect(() => {
    if (!id || !profile) return;

    const fetchRequest = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'cdaRequests', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          // Guard: make sure the agent owns this request (or is admin)
          if (data.agentId !== profile.uid && profile.role !== 'admin') {
            setError('Access Denied: You do not have permission to edit this request.');
            setLoading(false);
            return;
          }

          setOriginalRequest({ id: docSnap.id, ...data });

          setFormData({
            propertyType: data.propertyType || '',
            representation: data.representation || '',
            sellerName: data.sellerName || '',
            buyerName: data.buyerName || '',
            propertyAddress: data.propertyAddress || '',
            mlsNumber: data.mlsNumber || '',
            closingDate: data.closingDate ? data.closingDate.split('T')[0] : '',
            salePrice: data.salePrice,
            rateType: data.rateType || 'percentage',
            commissionRate: data.commissionRate,
            bonusRateType: data.bonusRateType || 'percentage',
            bonusRateValue: data.bonusRateValue,
            referralRateType: data.referralRateType || 'percentage',
            referralRateValue: data.referralRateValue,
            rebateRateType: data.rebateRateType || 'percentage',
            rebateRateValue: data.rebateRateValue,
            referralAgentName: data.referralAgentName || '',
            referralBrokerName: data.referralBrokerName || '',
            referralBrokerAddress: data.referralBrokerAddress || '',
            titleCompanyName: data.titleCompanyName || '',
            escrowOfficerName: data.escrowOfficerName || '',
            titleCompanyEmail: data.titleCompanyEmail || '',
            titleCompanyPhone: data.titleCompanyPhone || '',
            isOwnerAgent: !!data.isOwnerAgent,
            payAgent: data.payAgent !== undefined ? !!data.payAgent : true,
            hasCoBroker: !!data.hasCoBroker,
            coBrokerName: data.coBrokerName || '',
            coBrokerSplitPercentage: data.coBrokerSplitPercentage,
            coBrokerSplitAmount: data.coBrokerSplitAmount || 0,
          });
        } else {
          setError('The requested CDA document was not found.');
        }
      } catch (err: any) {
        console.error('Error fetching request for edit:', err);
        setError(err?.message || 'Failed to fetch CDA request details.');
      } finally {
        setLoading(false);
      }
    };

    fetchRequest();
  }, [id, profile]);

  useEffect(() => {
    if (!profile?.uid) return;

    const q = query(
      collection(db, 'cdaRequests'),
      where('agentId', '==', profile.uid),
      where('status', '==', 'approved')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        total += data.companySplitAmount || data.brokerSplitAmount || 0;
      });
      setYtdSplitPaid(total);
    }, (err) => {
      console.error('Error fetching agent YTD production for capping calculation:', err);
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    const salePrice = formData.salePrice !== undefined ? formData.salePrice : 0;
    const commissionRate = formData.commissionRate !== undefined ? formData.commissionRate : 0;

    // Calculate base commission
    const baseCommission = formData.rateType === 'percentage' 
      ? (salePrice * (commissionRate / 100))
      : (formData.rateType === 'flat' ? commissionRate : 0);

    // Calculate dynamic bonus amount based on percentage or flat rate
    let bonusAmount = 0;
    if (formData.bonusRateType === 'percentage') {
      const percentage = formData.bonusRateValue !== undefined ? formData.bonusRateValue : 0;
      bonusAmount = salePrice * (percentage / 100);
    } else if (formData.bonusRateType === 'flat') {
      bonusAmount = formData.bonusRateValue !== undefined ? formData.bonusRateValue : 0;
    }

    // Calculate dynamic rebate amount based on percentage or flat rate
    let rebateAmount = 0;
    if (formData.rebateRateType === 'percentage') {
      const percentage = formData.rebateRateValue !== undefined ? formData.rebateRateValue : 0;
      rebateAmount = salePrice * (percentage / 100);
    } else if (formData.rebateRateType === 'flat') {
      rebateAmount = formData.rebateRateValue !== undefined ? formData.rebateRateValue : 0;
    }

    // Calculate dynamic referral amount based on percentage or flat rate
    let referralAmount = 0;
    if (formData.referralRateType === 'percentage') {
      const percentage = formData.referralRateValue !== undefined ? formData.referralRateValue : 0;
      referralAmount = baseCommission * (percentage / 100);
    } else if (formData.referralRateType === 'flat') {
      referralAmount = formData.referralRateValue !== undefined ? formData.referralRateValue : 0;
    }

    // Gross takes into account bonus, referral, and rebate/discount deductions
    const gross = baseCommission + bonusAmount - referralAmount - rebateAmount;
    
    // Dynamically calculate co-broker split amount as a percentage of sale/lease price
    const coBrokerSplitAmount = (formData.propertyType === 'Lease' && formData.representation === 'Seller' && formData.hasCoBroker)
      ? Number((salePrice * ((formData.coBrokerSplitPercentage || 0) / 100)).toFixed(2))
      : 0;
    
    let brokerSplit = 0;
    let agentGross = 0;
    let mentorSplitAmount = 0;

    let agentSplit = 80; // Default fallback split: 80/20
    let bSplit = 20;
    let mentorSplit = 0;
    let splitType: 'percentage' | 'flat' = 'percentage';
    let overrides: any = null;

    const isInexperienced = !!profile?.commissionProfile?.isInexperienced;
    const isMentorActive = !!(isInexperienced && profile?.commissionProfile?.mentorActive);

    if (profile?.commissionProfile) {
      const pAgentSplit = profile.commissionProfile.agentSplit;
      const pBrokerSplit = profile.commissionProfile.brokerSplit;
      const pMentorSplit = profile.commissionProfile.mentorSplit || 0;
      
      // Use profile splits if defined and they do not both sum to 0
      if (typeof pAgentSplit === 'number' && typeof pBrokerSplit === 'number' && (pAgentSplit > 0 || pBrokerSplit > 0)) {
        agentSplit = pAgentSplit;
        bSplit = pBrokerSplit;
      }
      if (isMentorActive && typeof pMentorSplit === 'number') {
        mentorSplit = pMentorSplit;
      }
      splitType = profile.commissionProfile.splitType || 'percentage';
      overrides = profile.commissionProfile.overrides;
    } else if (profile?.role === 'admin') {
      // Default to 100% for admins if no profile exists
      agentSplit = 100;
      bSplit = 0;
    }

    // Check for transaction type overrides
    const hasOverride = !!(overrides && overrides[formData.propertyType]);
    if (hasOverride) {
      agentSplit = overrides[formData.propertyType].agentSplit;
      bSplit = overrides[formData.propertyType].brokerSplit;
      // overrides do not naturally override mentor program unless specified, but mentor split remains.
    }

    // Net portion remaining to Moving Texas Realty after co-broker split
    const netToMtr = formData.propertyType === 'Lease'
      ? Math.max(0, gross - coBrokerSplitAmount)
      : gross;

    if (formData.propertyType === 'Lease') {
      if (netToMtr <= 800) {
        agentGross = netToMtr;
        brokerSplit = 0;
        mentorSplitAmount = 0;
      } else {
        // Calculate the standard split first on the net portion remaining to Moving Texas Realty
        if (splitType === 'percentage' || hasOverride) {
          brokerSplit = netToMtr * (bSplit / 100);
          agentGross = netToMtr * (agentSplit / 100);
          mentorSplitAmount = isMentorActive ? netToMtr * (mentorSplit / 100) : 0;
        } else {
          // Flat split logic
          brokerSplit = bSplit;
          mentorSplitAmount = isMentorActive ? netToMtr * (mentorSplit / 100) : 0;
          agentGross = netToMtr - bSplit - mentorSplitAmount;
        }

        // Check if agent's share is less than the $800 guarantee,
        // adjustment is subtracted from the broker split to guarantee agent receives $800
        if (agentGross < 800) {
          const deficiency = 800 - agentGross;
          agentGross = 800;
          brokerSplit = Math.max(0, brokerSplit - deficiency);
        }
      }
    } else {
      // Non-lease transactions
      if (splitType === 'percentage' || hasOverride) {
        brokerSplit = netToMtr * (bSplit / 100);
        agentGross = netToMtr * (agentSplit / 100);
        mentorSplitAmount = isMentorActive ? netToMtr * (mentorSplit / 100) : 0;
      } else {
        // Flat split logic
        brokerSplit = bSplit;
        mentorSplitAmount = isMentorActive ? netToMtr * (mentorSplit / 100) : 0;
        agentGross = netToMtr - bSplit - mentorSplitAmount;
      }
    }

    // Owner Agent Logic: "Agents who are the property owner may select to only pay the split to the brokerage and not to themselves."
    if (formData.isOwnerAgent && !formData.payAgent) {
      agentGross = 0;
    }

    // Apply Agent Cap calculation!
    const capAmount = profile?.commissionProfile?.capAmount !== undefined 
      ? profile.commissionProfile.capAmount 
      : 15000;

    // Only apply capping if brokerSplit is greater than 0 and agent is not inexperienced
    if (brokerSplit > 0 && !isInexperienced) {
      if (ytdSplitPaid >= capAmount) {
        // Agent is fully capped: no more broker split!
        brokerSplit = 0;
        agentGross = (formData.isOwnerAgent && !formData.payAgent) ? 0 : netToMtr - mentorSplitAmount;
      } else if (ytdSplitPaid + brokerSplit > capAmount) {
        // This transaction will cap the agent!
        const remainingToCap = capAmount - ytdSplitPaid;
        brokerSplit = remainingToCap;
        agentGross = (formData.isOwnerAgent && !formData.payAgent) ? 0 : netToMtr - remainingToCap - mentorSplitAmount;
      }
    }

    setCalc({
      baseCommission: Number(baseCommission.toFixed(2)),
      grossCommission: Number(gross.toFixed(2)),
      brokerSplitAmount: Number(brokerSplit.toFixed(2)),
      agentGrossAmount: Number(agentGross.toFixed(2)),
      mentorSplitAmount: Number(mentorSplitAmount.toFixed(2)),
      coBrokerSplitAmount: Number(coBrokerSplitAmount.toFixed(2)),
      referralAmount: Number(referralAmount.toFixed(2)),
      bonusAmount: Number(bonusAmount.toFixed(2)),
      rebateAmount: Number(rebateAmount.toFixed(2)),
    });
  }, [formData, profile, ytdSplitPaid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) {
      setError('Form submission failed: User profile is not loaded. Please try refreshing or logging out and logging back in.');
      return;
    }

    if (!formData.representation) {
      setError('Form submission failed: Please select a Representation (Seller or Buyer).');
      return;
    }

    if (!formData.propertyType) {
      setError('Form submission failed: Please select a Property Type.');
      return;
    }

    if (!formData.rateType) {
      setError('Form submission failed: Please select a Rate Type (Percentage or Flat Fee).');
      return;
    }

    if (!formData.salePrice || formData.salePrice <= 0) {
      setError('Form submission failed: Please enter a valid Sale / Lease Price greater than $0.');
      return;
    }

    if (!formData.commissionRate || formData.commissionRate <= 0) {
      setError(formData.rateType === 'percentage' 
        ? 'Form submission failed: Please enter a valid Commission Rate (%) greater than 0%.' 
        : 'Form submission failed: Please enter a valid Set Fee ($) greater than $0.'
      );
      return;
    }

    if (formData.propertyType === 'Lease' && formData.representation === 'Seller' && formData.hasCoBroker) {
      if (!formData.coBrokerName || !formData.coBrokerName.trim()) {
        setError('Form submission failed: Please enter the Buyer\'s Broker / Agent Name.');
        return;
      }
      if (formData.coBrokerSplitPercentage === undefined || formData.coBrokerSplitPercentage < 0 || formData.coBrokerSplitPercentage >= 100) {
        setError('Form submission failed: Please enter a valid Buyer\'s Broker Split Percentage between 0% and 100% (exclusive).');
        return;
      }
      if (calc.coBrokerSplitAmount >= calc.grossCommission) {
        setError(`Form submission failed: The calculated Buyer's Broker Split ($${calc.coBrokerSplitAmount.toFixed(2)}) cannot exceed or equal the Gross Commission ($${calc.grossCommission.toFixed(2)}). Please adjust the split percentage or listing commission rate.`);
        return;
      }
    }

    if (calc.referralAmount > 0) {
      if (!formData.referralAgentName || !formData.referralAgentName.trim()) {
        setError('Form submission failed: Please enter the name of the referral agent receiving this fee.');
        return;
      }
      if (!formData.referralBrokerName || !formData.referralBrokerName.trim()) {
        setError('Form submission failed: Please enter the name of the referral brokerage.');
        return;
      }
      if (!formData.referralBrokerAddress || !formData.referralBrokerAddress.trim()) {
        setError('Form submission failed: Please enter the mailing address for the referral brokerage.');
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const requestData = {
        agentId: originalRequest?.agentId || profile.uid,
        agentName: originalRequest?.agentName || profile.name,
        agentEmail: originalRequest?.agentEmail || profile.email,
        agentPhone: originalRequest?.agentPhone || profile.phone || '',
        agentLicense: originalRequest?.agentLicense || profile.licenseNumber || '',
        ...formData,
        ...(formData.propertyType === 'Lease' ? {
          titleCompanyName: 'N/A',
          escrowOfficerName: 'N/A',
          titleCompanyEmail: 'N/A',
          titleCompanyPhone: 'N/A',
        } : {}),
        ...calc,
        companySplitAmount: calc.brokerSplitAmount,
        status: 'pending',
        rejectionReason: null, // Clear the rejection reason upon resubmission
        createdAt: originalRequest?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Clean undefined properties from requestData to prevent Firestore addDoc failures
      const cleanRequestData: any = {};
      Object.entries(requestData).forEach(([key, val]) => {
        if (val !== undefined) {
          cleanRequestData[key] = val;
        }
      });

      console.log('Submitting CDA request to Firestore:', cleanRequestData);
      let docId = id;
      if (id) {
        await updateDoc(doc(db, 'cdaRequests', id), cleanRequestData);
      } else {
        const docRef = await addDoc(collection(db, 'cdaRequests'), cleanRequestData);
        docId = docRef.id;
      }

      // Write notification for admins and trigger EmailJS if enabled
      try {
        const notifTitle = id ? 'CDA Request Resubmitted' : 'New CDA Request Submitted';
        const notifMsg = `${profile.name} ${id ? 'updated and resubmitted' : 'submitted a new'} CDA request for ${formData.propertyAddress || 'a property transaction'} (${formData.propertyType || 'Transaction'}).`;

        await addDoc(collection(db, 'notifications'), {
          title: notifTitle,
          message: notifMsg,
          requestId: docId,
          agentName: profile.name,
          createdAt: new Date().toISOString(),
          readBy: [],
          recipientRole: 'admin',
          type: 'new_request'
        });

        // Send EmailJS notification
        sendAdminNotificationEmail({
          title: notifTitle,
          agentName: profile.name,
          propertyAddress: formData.propertyAddress || 'N/A',
          message: notifMsg,
          requestId: docId
        }).catch((err) => console.error('EmailJS background send error:', err));
      } catch (nErr) {
        console.error('Failed to dispatch notification:', nErr);
      }

      navigate('/requests');
    } catch (err: any) {
      console.error('CDA Request Submission Error:', err);
      let errMsg = err?.message || String(err);
      if (errMsg.includes('permission') || errMsg.includes('Permission')) {
        errMsg = 'Database write failed due to insufficient permissions. Please check that you are signed in as an authorized user.';
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <form onSubmit={handleSubmit} className="space-y-8">
        {originalRequest?.status === 'rejected' && originalRequest?.rejectionReason && (
          <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl flex items-start gap-4 text-rose-800 animate-in fade-in slide-in-from-top-4 duration-300 font-sans">
            <AlertCircle className="shrink-0 text-rose-500 mt-0.5 animate-pulse" size={24} />
            <div className="flex-1 space-y-1">
              <h4 className="font-extrabold text-rose-950 text-base leading-snug">Reviewing Broker Rejection Feedback</h4>
              <p className="text-sm font-semibold leading-relaxed">
                Please review the feedback from the broker below and make the necessary updates to the form before re-submitting.
              </p>
              <div className="mt-2 p-3 bg-white border border-rose-100 rounded-xl text-slate-800 font-medium font-mono whitespace-pre-wrap text-xs">
                <span className="font-extrabold text-[10px] text-rose-900 uppercase tracking-wider block mb-1">Broker Reason:</span>
                {originalRequest.rejectionReason}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 p-5 rounded-2xl flex items-start gap-4 text-red-700 animate-in fade-in slide-in-from-top-4 duration-300">
            <AlertCircle className="shrink-0 mt-0.5 text-red-500" size={22} />
            <div className="flex-1">
              <h4 className="font-bold text-red-900 mb-1">CDA Request Submission Failed</h4>
              <p className="text-sm font-medium">{error}</p>
            </div>
          </div>
        )}
        {/* Transaction Section */}
        <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Calculator size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Transaction Details</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Representation</label>
              <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200 w-fit">
                {['Seller', 'Buyer'].map((rep) => (
                  <button
                    key={rep}
                    type="button"
                    onClick={() => setFormData({ ...formData, representation: rep as any })}
                    className={`px-8 py-2 text-sm font-bold rounded-lg transition-all ${
                      formData.representation === rep 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Representing {rep}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Seller Name(s)</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  required
                  type="text"
                  value={formData.sellerName}
                  onChange={e => setFormData({ ...formData, sellerName: e.target.value })}
                  placeholder="Full name of seller(s)"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Buyer Name(s)</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  required
                  type="text"
                  value={formData.buyerName}
                  onChange={e => setFormData({ ...formData, buyerName: e.target.value })}
                  placeholder="Full name of buyer(s)"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Property Type</label>
              <div className="flex flex-wrap gap-2">
                {['Home Sale', 'Lease', 'Land', 'Commercial', 'Referral'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, propertyType: type as any })}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                      formData.propertyType === type 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Property Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  required
                  type="text"
                  value={formData.propertyAddress}
                  onChange={e => setFormData({ ...formData, propertyAddress: e.target.value })}
                  placeholder="Street Address, City, State, ZIP"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">MLS#</label>
              <input
                type="text"
                value={formData.mlsNumber}
                onChange={e => setFormData({ ...formData, mlsNumber: e.target.value })}
                placeholder="1234567"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Closing Date</label>
              <input
                required
                type="date"
                value={formData.closingDate}
                onChange={e => setFormData({ ...formData, closingDate: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Sale / Lease Price ($)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  required
                  type="number"
                  value={formData.salePrice !== undefined ? formData.salePrice : ''}
                  onChange={e => setFormData({ ...formData, salePrice: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-slate-700">Commission Rate / Set Fee</label>
                <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 select-none">
                  <span className={`text-xs font-black transition-all ${formData.rateType === 'percentage' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>%</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ 
                      ...formData, 
                      rateType: formData.rateType === 'percentage' ? 'flat' : 'percentage' 
                    })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                      formData.rateType === 'flat' ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                        formData.rateType === 'flat' ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-black transition-all ${formData.rateType === 'flat' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>$</span>
                </div>
              </div>
              <div className="relative">
                {formData.rateType === 'flat' && <DollarSign className="absolute left-3 top-3 text-slate-400" size={18} />}
                <input
                  required
                  type="number"
                  step="0.01"
                  value={formData.commissionRate !== undefined ? formData.commissionRate : ''}
                  onChange={e => setFormData({ ...formData, commissionRate: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  className={`w-full ${formData.rateType === 'flat' ? 'pl-10' : 'px-4'} pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none`}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-slate-700">Bonus</label>
                <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 select-none">
                  <span className={`text-xs font-black transition-all ${formData.bonusRateType === 'percentage' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>%</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ 
                      ...formData, 
                      bonusRateType: formData.bonusRateType === 'percentage' ? 'flat' : 'percentage' 
                    })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                      formData.bonusRateType === 'flat' ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                        formData.bonusRateType === 'flat' ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-black transition-all ${formData.bonusRateType === 'flat' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>$</span>
                </div>
              </div>
              <div className="relative">
                {formData.bonusRateType === 'flat' ? (
                  <DollarSign className="absolute left-3 top-3 text-slate-400" size={18} />
                ) : (
                  <Percent className="absolute left-3 top-3 text-slate-400" size={18} />
                )}
                <input
                  type="number"
                  step="0.01"
                  value={formData.bonusRateValue !== undefined ? formData.bonusRateValue : ''}
                  onChange={e => setFormData({ ...formData, bonusRateValue: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {formData.bonusRateType === 'percentage' && calc.bonusAmount > 0 && (
                <p className="text-[11px] text-slate-500 font-sans mt-1.5 flex items-center gap-1">
                  Calculated bonus amount: <span className="font-bold text-slate-700">${calc.bonusAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </p>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-slate-700">Rebate / Discount to Client</label>
                <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 select-none">
                  <span className={`text-xs font-black transition-all ${formData.rebateRateType === 'percentage' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>%</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ 
                      ...formData, 
                      rebateRateType: formData.rebateRateType === 'percentage' ? 'flat' : 'percentage' 
                    })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                      formData.rebateRateType === 'flat' ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                        formData.rebateRateType === 'flat' ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-black transition-all ${formData.rebateRateType === 'flat' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>$</span>
                </div>
              </div>
              <div className="relative">
                {formData.rebateRateType === 'flat' ? (
                  <DollarSign className="absolute left-3 top-3 text-slate-400" size={18} />
                ) : (
                  <Percent className="absolute left-3 top-3 text-slate-400" size={18} />
                )}
                <input
                  type="number"
                  step="0.01"
                  value={formData.rebateRateValue !== undefined ? formData.rebateRateValue : ''}
                  onChange={e => setFormData({ ...formData, rebateRateValue: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {formData.rebateRateType === 'percentage' && calc.rebateAmount > 0 && (
                <p className="text-[11px] text-slate-500 font-sans mt-1.5 flex items-center gap-1">
                  Calculated rebate amount: <span className="font-bold text-slate-700">${calc.rebateAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </p>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-slate-700">Referral to Other Broker</label>
                <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 select-none">
                  <span className={`text-xs font-black transition-all ${formData.referralRateType === 'percentage' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>%</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ 
                      ...formData, 
                      referralRateType: formData.referralRateType === 'percentage' ? 'flat' : 'percentage' 
                    })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                      formData.referralRateType === 'flat' ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                        formData.referralRateType === 'flat' ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-black transition-all ${formData.referralRateType === 'flat' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>$</span>
                </div>
              </div>
              <div className="relative">
                {formData.referralRateType === 'flat' ? (
                  <DollarSign className="absolute left-3 top-3 text-slate-400" size={18} />
                ) : (
                  <Percent className="absolute left-3 top-3 text-slate-400" size={18} />
                )}
                <input
                  type="number"
                  step="0.01"
                  value={formData.referralRateValue !== undefined ? formData.referralRateValue : ''}
                  onChange={e => setFormData({ 
                    ...formData, 
                    referralRateValue: e.target.value === '' ? undefined : parseFloat(e.target.value),
                    ...(e.target.value === '' ? { referralAgentName: '', referralBrokerName: '', referralBrokerAddress: '' } : {})
                  })}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {formData.referralRateType === 'percentage' && calc.referralAmount > 0 && (
                <p className="text-[11px] text-slate-500 font-sans mt-1.5 flex items-center gap-1">
                  Calculated referral amount: <span className="font-bold text-slate-700">${calc.referralAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </p>
              )}
            </div>

            {calc.referralAmount > 0 && (
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-rose-50/20 rounded-2xl border border-rose-100 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="md:col-span-2">
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-1">Referral Details</h4>
                  <p className="text-[11px] text-rose-600/80 font-medium">Please enter the details of the agent and brokerage we are paying the referral commission to. These details will be added to the official CDA document.</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Referral Agent Name</label>
                  <input
                    required
                    type="text"
                    value={formData.referralAgentName || ''}
                    onChange={e => setFormData({ ...formData, referralAgentName: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Referral Brokerage Name</label>
                  <input
                    required
                    type="text"
                    value={formData.referralBrokerName || ''}
                    onChange={e => setFormData({ ...formData, referralBrokerName: e.target.value })}
                    placeholder="e.g. XYZ Brokerage"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Referral Brokerage Mailing Address</label>
                  <input
                    required
                    type="text"
                    value={formData.referralBrokerAddress || ''}
                    onChange={e => setFormData({ ...formData, referralBrokerAddress: e.target.value })}
                    placeholder="e.g. 123 Broker Way, Dallas, TX 75201"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm"
                  />
                </div>
              </div>
            )}

            {formData.propertyType === 'Lease' && formData.representation === 'Seller' && (
              <div className="md:col-span-2 border-t border-slate-100 pt-6 mt-2 space-y-4">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Is there a Buyer's Broker?</h4>
                    <p className="text-xs text-slate-500 font-medium font-sans">Indicate if another brokerage represents the tenant and requires a commission split.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={formData.hasCoBroker || false}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        hasCoBroker: e.target.checked,
                        ...(!e.target.checked ? { coBrokerName: '', coBrokerSplitPercentage: undefined } : {})
                      })}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {formData.hasCoBroker && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-blue-50/30 rounded-2xl border border-blue-100/50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Buyer's Broker / Agent Name</label>
                      <input
                        required
                        type="text"
                        value={formData.coBrokerName || ''}
                        onChange={e => setFormData({ ...formData, coBrokerName: e.target.value })}
                        placeholder="e.g. John Doe, Coldwell Banker"
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Buyer's Broker Split Percentage (%)</label>
                      <div className="relative">
                        <Percent className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input
                          required
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={formData.coBrokerSplitPercentage !== undefined ? formData.coBrokerSplitPercentage : ''}
                          onChange={e => setFormData({ ...formData, coBrokerSplitPercentage: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                          placeholder="e.g. 50"
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 font-sans mt-1.5 flex items-center gap-1">
                        Calculated split amount: <span className="font-bold text-slate-700">${calc.coBrokerSplitAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
            <div className={`grid grid-cols-1 md:grid-cols-${calc.mentorSplitAmount > 0 ? '4' : '3'} gap-6`}>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Gross Commission</p>
                <p className="text-2xl font-bold text-slate-900">${calc.grossCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Company Split</p>
                <p className="text-2xl font-bold text-blue-600">${calc.brokerSplitAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              {calc.mentorSplitAmount > 0 && (
                <div>
                  <p className="text-xs font-semibold text-purple-500 uppercase mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full inline-block"></span> Mentor Split (10%)
                  </p>
                  <p className="text-2xl font-bold text-purple-600">${calc.mentorSplitAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Agent Gross</p>
                <p className="text-2xl font-bold text-emerald-600">${calc.agentGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
            {calc.mentorSplitAmount > 0 && (
              <p className="text-[11px] text-purple-700 font-semibold bg-purple-50/50 p-2.5 rounded-lg border border-purple-100">
                ℹ️ Note: On the generated CDA PDF, the Mentor Split will be seamlessly added to the Broker payout check. Moving Texas Realty (Broker) receives the combined amount and will pay your Assigned Mentor internally.
              </p>
            )}
          </div>
        </section>

        {/* Ownership Section */}
        <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <User size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Agent Status</h3>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
              <input
                type="checkbox"
                id="isOwnerAgent"
                className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={formData.isOwnerAgent}
                onChange={e => setFormData({ ...formData, isOwnerAgent: e.target.checked })}
              />
              <div>
                <label htmlFor="isOwnerAgent" className="font-bold text-slate-800">I am the Property Owner</label>
                <p className="text-sm text-slate-500">Checking this allows you to specify if you want to receive your commission portion.</p>
              </div>
            </div>

            {formData.isOwnerAgent && (
              <div className="flex items-start gap-4 p-4 rounded-xl border border-blue-200 bg-blue-50/50">
                <input
                  type="checkbox"
                  id="payAgent"
                  className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={formData.payAgent}
                  onChange={e => setFormData({ ...formData, payAgent: e.target.checked })}
                />
                <div>
                  <label htmlFor="payAgent" className="font-bold text-blue-900">Pay commission to myself</label>
                  <p className="text-sm text-blue-700">If unchecked, you will only pay the split to the brokerage.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Title Company Section */}
        {formData.propertyType !== 'Lease' && (
          <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                <Building2 size={20} />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Title Company Information</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Company Name</label>
                <input
                  required
                  type="text"
                  value={formData.titleCompanyName}
                  onChange={e => setFormData({ ...formData, titleCompanyName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Escrow Officer Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    required
                    type="text"
                    value={formData.escrowOfficerName}
                    onChange={e => setFormData({ ...formData, escrowOfficerName: e.target.value })}
                    placeholder="John Doe"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Escrow Officer Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    required
                    type="email"
                    value={formData.titleCompanyEmail}
                    onChange={e => setFormData({ ...formData, titleCompanyEmail: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    required
                    type="tel"
                    value={formData.titleCompanyPhone}
                    onChange={e => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (val.length > 10) val = val.slice(0, 10);
                      if (val.length >= 7) {
                        val = `(${val.slice(0,3)}) ${val.slice(3,6)}-${val.slice(6)}`;
                      } else if (val.length >= 4) {
                        val = `(${val.slice(0,3)}) ${val.slice(3)}`;
                      } else if (val.length > 0) {
                        val = `(${val}`;
                      }
                      setFormData({ ...formData, titleCompanyPhone: val });
                    }}
                    placeholder="(###) ###-####"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="flex items-center justify-end gap-4 pt-6">
          <button
            type="button"
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            onClick={() => window.history.back()}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
          >
            {loading ? (id ? 'Saving...' : 'Submitting...') : (id ? 'Save & Re-submit Request' : 'Submit Request')}
            {!loading && <Send size={20} />}
          </button>
        </div>
      </form>
    </div>
  );
}
