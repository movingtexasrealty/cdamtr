/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useRef, useState, useEffect } from 'react';
import { Mail, Download, X, CheckCircle, MapPin, Phone, XCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

const formatPhone = (phone: string) => {
  if (!phone) return 'N/A';
  const cleaned = phone.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  return phone;
};

const formatClosingDate = (dateStr: string) => {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).toLocaleDateString();
    }
  }
  return new Date(dateStr).toLocaleDateString();
};

interface CDAPreviewProps {
  request: any;
  onClose: () => void;
  onApproved?: (updateData?: any) => void;
  onRejected?: () => void;
  showApproveActions?: boolean;
}

export default function CDAPreview({ request, onClose, onApproved, onRejected, showApproveActions }: CDAPreviewProps) {
  const { profile } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const wirePrintRef = useRef<HTMLDivElement>(null);
  
  const [payEntireToBroker, setPayEntireToBroker] = useState(!!request.payEntireToBroker);
  const [activeTab, setActiveTab] = useState<'cda' | 'wiring'>('cda');
  const [brokerSignature, setBrokerSignature] = useState<string | null>(request.brokerSignatureUrl || profile?.signatureImage || null);

  useEffect(() => {
    setPayEntireToBroker(!!request.payEntireToBroker);
  }, [request.payEntireToBroker]);

  useEffect(() => {
    let isMounted = true;

    async function resolveBrokerSignature() {
      if (request.brokerSignatureUrl) {
        if (isMounted) setBrokerSignature(request.brokerSignatureUrl);
        return;
      }
      if (profile?.role === 'admin' && profile?.signatureImage) {
        if (isMounted) setBrokerSignature(profile.signatureImage);
        return;
      }
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'admin'));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          const adminWithSig = querySnap.docs.find(d => d.data().signatureImage);
          const sig = adminWithSig ? adminWithSig.data().signatureImage : querySnap.docs[0].data().signatureImage || null;
          if (isMounted && sig) {
            setBrokerSignature(sig);
          }
        }
      } catch (err) {
        console.error('Error fetching broker signature:', err);
      }
    }

    resolveBrokerSignature();
    return () => { isMounted = false; };
  }, [request.brokerSignatureUrl, profile?.role, profile?.signatureImage]);

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.uid) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        await updateDoc(doc(db, 'users', profile.uid), {
          signatureImage: base64String
        });
        setBrokerSignature(base64String);
      } catch (err) {
        console.error('Failed to update signature image:', err);
        alert('Could not save the signature image in your profile. Please try again.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input value so onChange always triggers on consecutive selects
  };

  const handleRemoveSignature = async () => {
    if (!profile?.uid) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        signatureImage: null
      });
      setBrokerSignature(null);
    } catch (err) {
      console.error('Failed to remove signature image:', err);
    }
  };

  const ensureImagesLoaded = async (element: HTMLElement) => {
    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(
      images.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 2000);
        });
      })
    );
  };

  const convertColorToRgb = (colorStr: string, propName?: string): string => {
    if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)' || colorStr === 'inherit' || colorStr === 'initial') {
      return propName === 'color' ? '#1e293b' : 'transparent';
    }
    if (!colorStr.includes('okl') && !colorStr.includes('color-mix')) return colorStr;

    // 1. Canvas Context parsing
    try {
      const canvasCtx = document.createElement('canvas').getContext('2d');
      if (canvasCtx) {
        canvasCtx.fillStyle = '#000000';
        canvasCtx.fillStyle = colorStr;
        const res = canvasCtx.fillStyle;
        if (res && !res.includes('okl') && !res.includes('color-mix') && res !== '#000000') {
          return res;
        }
      }
    } catch (e) {
      // ignore
    }

    // 2. DOM computed style parsing
    try {
      const dummy = document.createElement('div');
      dummy.style.position = 'fixed';
      dummy.style.left = '-9999px';
      dummy.style.top = '-9999px';
      dummy.style.visibility = 'hidden';
      dummy.style.color = colorStr;
      document.body.appendChild(dummy);
      const computed = window.getComputedStyle(dummy).color;
      document.body.removeChild(dummy);

      if (computed && !computed.includes('okl') && !computed.includes('color-mix') && computed !== '') {
        return computed;
      }
    } catch (e) {
      // ignore
    }

    // Fallbacks per property
    if (propName === 'backgroundColor') return '#f8fafc';
    if (propName === 'color') return '#1e293b';
    if (propName && propName.includes('Color')) return '#cbd5e1';
    return 'transparent';
  };

  const sanitizeCssString = (cssText: string): string => {
    if (!cssText) return cssText;
    let cleaned = cssText.replace(/color-mix\([^;}]*\)/gi, (match) => {
      const rgb = convertColorToRgb(match);
      return rgb !== 'transparent' ? rgb : '#f8fafc';
    });
    cleaned = cleaned.replace(/(oklab|oklch)\([^)]+\)/gi, (match) => {
      const rgb = convertColorToRgb(match);
      return rgb !== 'transparent' ? rgb : '#1e293b';
    });
    return cleaned;
  };

  const cloneComputedStyles = (sourceEl: HTMLElement, targetEl: HTMLElement) => {
    try {
      const sourceNodes = [sourceEl, ...Array.from(sourceEl.querySelectorAll<HTMLElement>('*'))];
      const targetNodes = [targetEl, ...Array.from(targetEl.querySelectorAll<HTMLElement>('*'))];

      const styleProps: (keyof CSSStyleDeclaration)[] = [
        'display',
        'flexDirection',
        'flexWrap',
        'alignItems',
        'alignContent',
        'justifyContent',
        'justifyItems',
        'gridTemplateColumns',
        'gridTemplateRows',
        'gridColumn',
        'gridRow',
        'gap',
        'rowGap',
        'columnGap',
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'boxSizing',
        'width',
        'height',
        'minWidth',
        'minHeight',
        'maxWidth',
        'maxHeight',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'marginTop',
        'marginRight',
        'marginBottom',
        'marginLeft',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
        'borderTopStyle',
        'borderRightStyle',
        'borderBottomStyle',
        'borderLeftStyle',
        'borderRadius',
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomLeftRadius',
        'borderBottomRightRadius',
        'fontSize',
        'fontWeight',
        'fontFamily',
        'fontStyle',
        'lineHeight',
        'textAlign',
        'textTransform',
        'letterSpacing',
        'whiteSpace' as any,
        'wordBreak',
        'opacity',
        'overflow',
        'zIndex',
        'transform',
        'transformOrigin',
        'boxShadow'
      ];

      const colorProps: (keyof CSSStyleDeclaration)[] = [
        'color',
        'backgroundColor',
        'borderTopColor',
        'borderRightColor',
        'borderBottomColor',
        'borderLeftColor'
      ];

      for (let i = 0; i < sourceNodes.length; i++) {
        const s = sourceNodes[i];
        const t = targetNodes[i];
        if (!s || !t) continue;

        const c = window.getComputedStyle(s);

        for (const prop of styleProps) {
          const val = c[prop];
          if (val && typeof val === 'string' && val !== '' && val !== 'initial') {
            if (prop === 'height') {
              const isMedia = s.tagName === 'IMG' || s.tagName === 'SVG' || s.tagName === 'CANVAS' || s.tagName === 'INPUT';
              const isRoot = s === sourceEl;
              const hasExplicitHeight = Boolean(s.style && s.style.height && s.style.height !== 'auto');
              if (!isMedia && !isRoot && !hasExplicitHeight) {
                continue;
              }
            }
            (t.style as any)[prop] = sanitizeCssString(val);
          }
        }

        for (const prop of colorProps) {
          const val = c[prop];
          if (val && typeof val === 'string' && val !== '') {
            (t.style as any)[prop] = convertColorToRgb(val, prop as string);
          }
        }
      }
    } catch (e) {
      console.error('Error cloning computed styles for PDF:', e);
    }
  };

  const prepareClonedDoc = (clonedDoc: Document, selector: string, sourceElement: HTMLElement) => {
    // 1. Sanitize style tags inside cloned document
    clonedDoc.querySelectorAll('style').forEach(styleTag => {
      if (styleTag.textContent) {
        styleTag.textContent = sanitizeCssString(styleTag.textContent);
      }
    });

    // 2. Remove external stylesheets that html2canvas might try to parse if they contain oklab
    clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      link.remove();
    });

    // 3. Clone browser-computed RGB colors and layout styles onto cloned DOM elements
    const el = clonedDoc.querySelector(selector);
    if (el instanceof HTMLElement) {
      cloneComputedStyles(sourceElement, el);

      // Sanitize all inline styles in cloned sub-tree
      el.querySelectorAll('*').forEach(node => {
        if (node instanceof HTMLElement) {
          const inline = node.getAttribute('style');
          if (inline && (inline.includes('okl') || inline.includes('color-mix'))) {
            node.setAttribute('style', sanitizeCssString(inline));
          }
        }
      });

      // Explicitly lock A4 container outer dimensions & flex layout
      el.style.position = 'relative'; 
      el.style.width = '794px'; 
      el.style.minWidth = '794px';
      el.style.maxWidth = '794px';
      el.style.height = '1123px';
      el.style.minHeight = '1123px';
      el.style.maxHeight = '1123px';
      el.style.margin = '0 auto';
      el.style.boxShadow = 'none';
      el.style.transform = 'none';
      el.style.boxSizing = 'border-box';
      el.style.paddingTop = '14px';
      el.style.paddingBottom = '16px';

      // Explicit logo image sizing
      const watermark = el.querySelector('.cda-logo-watermark') as HTMLElement;
      if (watermark) {
        watermark.style.opacity = '0.03';
        watermark.style.width = '500px';
        watermark.style.maxWidth = '500px';
        watermark.style.height = 'auto';
      }

      const mainLogos = el.querySelectorAll('.cda-logo-main') as NodeListOf<HTMLElement>;
      mainLogos.forEach(logo => {
        logo.style.height = '52px';
        logo.style.maxHeight = '52px';
        logo.style.width = 'auto';
        logo.style.opacity = '1';
      });

      const wireImages = el.querySelectorAll('img') as NodeListOf<HTMLImageElement>;
      wireImages.forEach(img => {
        if (img.src && img.src.includes('moving_texas_realty_logo_dark')) {
          img.style.height = '64px';
          img.style.maxHeight = '64px';
          img.style.width = 'auto';
          img.style.margin = '0 auto 8px auto';
          img.style.display = 'block';
          img.style.opacity = '1';
        }
      });
    }
  };

  const handleDownload = async () => {
    if (activeTab !== 'cda') {
      setActiveTab('cda');
      await new Promise(r => setTimeout(r, 200));
    }

    if (!printRef.current) return;
    
    const originalScrollPos = window.scrollY;
    window.scrollTo(0, 0);

    try {
      const element = printRef.current;
      await ensureImagesLoaded(element);
      await new Promise(resolve => setTimeout(resolve, 300));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        onclone: (clonedDoc) => {
          prepareClonedDoc(clonedDoc, '[data-cda-content]', element);
        }
      });
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      const safeProperty = (request.propertyAddress || 'Transaction').split(',')[0].trim().replace(/[^a-z0-9]/gi, '_');
      const suffix = payEntireToBroker ? 'Broker_Only' : (request.agentName || 'Agent').trim().replace(/[^a-z0-9]/gi, '_');
      const filename = `CDA - ${safeProperty} - ${suffix}.pdf`;
      
      pdf.save(filename);
    } catch (error) {
      console.error('PDF Generation Error:', error);
      alert('There was an error generating the PDF. Please try again.');
    } finally {
      window.scrollTo(0, originalScrollPos);
    }
  };

  const handleDownloadWiring = async () => {
    if (activeTab !== 'wiring') {
      setActiveTab('wiring');
      await new Promise(r => setTimeout(r, 200));
    }

    if (!wirePrintRef.current) return;
    const originalScrollPos = window.scrollY;
    window.scrollTo(0, 0);

    try {
      const element = wirePrintRef.current;
      await ensureImagesLoaded(element);
      await new Promise(resolve => setTimeout(resolve, 300));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        onclone: (clonedDoc) => {
          prepareClonedDoc(clonedDoc, '[data-wire-content]', element);
        }
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

      const safeProperty = (request.propertyAddress || 'Transaction').split(',')[0].trim().replace(/[^a-z0-9]/gi, '_');
      const filename = `Wiring_Instructions_-_${safeProperty}.pdf`;

      pdf.save(filename);
    } catch (error) {
      console.error('Wiring Instructions PDF Generation Error:', error);
      alert('There was an error generating the Wiring Instructions PDF. Please try again.');
    } finally {
      window.scrollTo(0, originalScrollPos);
    }
  };

  const handleApproveOnly = async () => {
    if (onApproved) {
      await onApproved({ 
        payEntireToBroker,
        brokerSignatureUrl: brokerSignature || profile?.signatureImage || null
      });
    }
  };

  const handleSendApprovedEmailOnly = () => {
    const propertyAddress = request.propertyAddress || '[Property Address]';
    const emailTo = request.titleCompanyEmail || '';
    const rawOfficerName = request.escrowOfficerName?.trim();
    const escrowOfficerFirstName = rawOfficerName ? rawOfficerName.split(' ')[0] : 'Escrow Officer';
    const subject = encodeURIComponent(`${propertyAddress} - CDA & Wiring Instructions - Moving Texas Realty`);
    const body = encodeURIComponent(
      `Dear ${escrowOfficerFirstName},\n\n` +
      `Please see attached CDA for Moving Texas Realty regarding ${propertyAddress} along with wire instructions for the broker.\n\n` +
      `Please let me know if you have any questions.\n\n` +
      `Thanks,`
    );
    const ccEmails = ['7hrealty+CDA@gmail.com'];
    if (request.agentEmail) {
      ccEmails.push(request.agentEmail);
    }
    const cc = `&cc=${encodeURIComponent(ccEmails.join(','))}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailTo)}&su=${subject}&body=${body}${cc}`;
    
    // Open Gmail in a new browser tab
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">CDA Preview</h3>
            <p className="text-sm text-slate-500 font-medium">Review the Disbursement Authorization before final approval.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-100/50">
          {/* Document Tab Navigation */}
          <div className="flex items-center justify-center gap-3 max-w-[210mm] mx-auto mb-6 font-sans">
            <button
              type="button"
              onClick={() => setActiveTab('cda')}
              className={`px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 border ${
                activeTab === 'cda'
                  ? 'bg-blue-900 text-white border-blue-900 shadow-md scale-105'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
              }`}
            >
              📄 CDA Authorization
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('wiring')}
              className={`px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 border ${
                activeTab === 'wiring'
                  ? 'bg-blue-900 text-white border-blue-900 shadow-md scale-105'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
              }`}
            >
              🏦 Wiring Instructions
            </button>
          </div>

          {request.status === 'rejected' && (
            <div className="mb-6 mx-auto w-[210mm] bg-rose-50 border border-rose-200 p-5 rounded-2xl flex items-start gap-4 text-rose-800 font-sans">
              <AlertCircle className="shrink-0 text-rose-500 mt-0.5 animate-pulse" size={24} />
              <div className="flex-1 space-y-1">
                <h4 className="font-extrabold text-rose-950 text-base leading-snug">This Request has been Rejected by Broker</h4>
                <div className="text-sm font-semibold leading-relaxed">
                  {request.rejectionReason ? (
                    <>
                      <span className="font-extrabold text-rose-900 uppercase tracking-wider text-xs block mt-1">Broker Rejection Reason:</span>
                      <span className="italic block mt-0.5 p-3 bg-white/70 border border-rose-100 rounded-xl text-slate-800 font-medium font-mono whitespace-pre-wrap">{request.rejectionReason}</span>
                    </>
                  ) : (
                    "No rejection reason specified."
                  )}
                </div>
                {request.agentId === profile?.uid && (
                  <p className="text-xs text-rose-600 font-extrabold mt-3 uppercase tracking-wider flex items-center gap-1.5">
                    💡 Tip: You can close this window and click the edit button (pencil icon) in the requests list to make corrections and re-submit.
                  </p>
                )}
              </div>
            </div>
          )}

          {profile?.role === 'admin' && activeTab === 'cda' && (
            <div className="mb-6 mx-auto w-[210mm] space-y-4">
              {showApproveActions && (
                <>
                  {/* Approval Workflow */}
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-start gap-3">
                    <CheckCircle className="text-blue-600 shrink-0 mt-0.5" size={20} />
                    <div className="text-sm text-blue-800">
                      <p className="font-bold mb-1">Approval Workflow & Guidelines:</p>
                      <ol className="list-decimal ml-4 space-y-1 font-medium font-sans">
                        <li>Review the CDA details in the preview layout below.</li>
                        <li>If the entire compensation should be paid to the brokerage (agent/mentor omitted), activate the split override switch below.</li>
                        <li>Click <span className="font-bold">"Approve Request & Lock Split"</span> to save and approve.</li>
                        <li>Once approved, you will unlock the final signed PDF download and mailing options.</li>
                      </ol>
                    </div>
                  </div>

                  {/* Administrative Split Override Control */}
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                        <span className="w-2 h-2 bg-amber-500 rounded-full inline-block animate-pulse"></span>
                        Administrative Split Override
                      </h4>
                      <p className="text-[11px] text-amber-700 font-medium">
                        Enabling this forces 100% of the Gross Compensation check to be written to Moving Texas Realty. The agent and mentor splits are completely hidden on the generated PDF.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={payEntireToBroker}
                        onChange={(e) => setPayEntireToBroker(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-amber-600"></div>
                      <span className="ml-3 text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap min-w-[3rem]">
                        {payEntireToBroker ? 'Active' : 'Inactive'}
                      </span>
                    </label>
                  </div>
                </>
              )}

              {/* Official Broker Signature Configuration */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                    <span className="w-2 h-2 bg-blue-500 rounded-full inline-block"></span>
                    Designated Broker Signature Image
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium font-sans">
                    Upload an image of your signature (transparent PNG recommended) to replace the default script font.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {(brokerSignature || profile?.signatureImage) && (
                    <div className="p-1 px-2 border border-slate-200 rounded-lg bg-white flex items-center gap-1.5 shadow-sm">
                      <img 
                        src={brokerSignature || profile?.signatureImage || ''} 
                        alt="Current Signature Preview" 
                        referrerPolicy="no-referrer"
                        className="h-6 max-w-[84px] object-contain"
                      />
                      <button 
                        onClick={handleRemoveSignature}
                        className="text-red-500 hover:text-red-700 text-[10px] font-black font-sans uppercase px-1.5 py-0.5 hover:bg-red-50 rounded transition-colors"
                        title="Remove custom signature image"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <label className="cursor-pointer bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-2 text-xs font-bold font-sans shadow-sm inline-flex items-center gap-1.5 transition-all">
                    <span>Upload Signature</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden"
                      onChange={handleSignatureUpload}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className={activeTab === 'cda' ? 'block' : 'hidden'}>
            <div ref={printRef} data-cda-content className="bg-white px-6 pt-3.5 pb-4 w-[210mm] min-w-[210mm] h-[297mm] mx-auto border border-slate-200 text-slate-900 relative overflow-hidden flex flex-col justify-start" style={{ height: '297mm', minHeight: '297mm', maxHeight: '297mm', boxSizing: 'border-box' }}>
              {/* Watermark Logo */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] rotate-[-15deg] z-0">
                <img 
                  src="/moving_texas_realty_logo_light.png" 
                  alt="" 
                  className="w-full max-w-2xl grayscale cda-logo-watermark"
                  onError={(e) => (e.currentTarget.style.opacity = '0')}
                  onLoad={(e) => (e.currentTarget.style.opacity = '0.03')}
                  style={{ opacity: 0.03, width: '500px', maxWidth: '500px', height: 'auto', transition: 'opacity 0.3s' }}
                />
              </div>

              <div className="relative z-10 flex justify-between items-start border-b-2 border-blue-900 pb-4 mb-4 shrink-0 w-full">
                <div className="flex gap-3 items-start">
                  <img 
                    src="/moving_texas_realty_logo_dark.png" 
                    alt="" 
                    className="h-[52px] max-h-[52px] w-auto object-contain cda-logo-main shrink-0 mt-0.5"
                    onError={(e) => (e.currentTarget.style.opacity = '0')}
                    onLoad={(e) => (e.currentTarget.style.opacity = '1')}
                    style={{ opacity: 1, height: '52px', maxHeight: '52px', width: 'auto', objectFit: 'contain' }}
                  />
                  <div className="border-l border-slate-200 pl-3 flex flex-col justify-start">
                    <h1 className="text-lg font-black text-blue-900 leading-none whitespace-nowrap tracking-tight">MOVING TEXAS REALTY</h1>
                    <table className="mt-1 border-collapse text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                      <tbody>
                        <tr>
                          <td className="pr-1 py-[0.5px] align-middle text-blue-900" style={{ verticalAlign: 'middle', paddingRight: '4px', paddingTop: '2.5px' }}>
                            <MapPin size={9} className="text-blue-900 inline-block align-middle" style={{ display: 'inline-block', verticalAlign: 'middle', transform: 'translateY(1px)' }} />
                          </td>
                          <td className="py-[0.5px] align-middle whitespace-nowrap text-slate-500" style={{ verticalAlign: 'middle' }}>
                            525 Fort Worth Dr Ste 216, Denton, TX 76201
                          </td>
                        </tr>
                        <tr>
                          <td className="pr-1 py-[0.5px] align-middle text-blue-900" style={{ verticalAlign: 'middle', paddingRight: '4px', paddingTop: '2.5px' }}>
                            <Phone size={9} className="text-blue-900 inline-block align-middle" style={{ display: 'inline-block', verticalAlign: 'middle', transform: 'translateY(1px)' }} />
                          </td>
                          <td className="py-[0.5px] align-middle whitespace-nowrap text-slate-500" style={{ verticalAlign: 'middle' }}>
                            (888) 433-9722 • Office
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="mt-1.5 border-t border-slate-200 pt-1">
                      <p className="text-[8.5px] font-black text-blue-900 uppercase tracking-[0.16em] leading-none">
                        Compensation Disbursement Authorization
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end shrink-0">
                  <div className="bg-[#1e3a8a] text-white px-3.5 pt-2 pb-[20px] rounded-lg text-center min-w-[125px] flex flex-col items-center justify-center">
                    <p className="text-[8px] font-bold uppercase tracking-tight text-blue-100 leading-normal mb-0.5">Authorization ID</p>
                    <p className="text-sm font-black tracking-widest leading-normal">{(request.id || 'PENDING').slice(-6).toUpperCase()}</p>
                  </div>
                  <div className="mt-1">
                    <p className="text-[9px] font-bold text-slate-500">
                      Date: {new Date().toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative z-10 flex gap-6 mb-2">
                {request.propertyType === 'Lease' ? (
                  <section className="flex-1">
                    <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-2 border-b border-blue-100 pb-2.5">Disbursement Method</h4>
                    <div className="space-y-0.5 text-[11px] font-semibold text-slate-600">
                      <p className="font-bold text-slate-800 text-[11px]">Broker Managed (Direct Payment)</p>
                      <p className="text-[10px] leading-tight">No Title Company is involved. Moving Texas Realty (Broker) directly processes all rental receipts, lease disbursements, and agent compensation payouts internally.</p>
                    </div>
                  </section>
                ) : (
                  <section className="flex-1">
                    <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-2 border-b border-blue-100 pb-2.5">Title Company Info</h4>
                    <div className="space-y-0.5 text-[11px] font-medium">
                      <p className="text-sm font-bold text-slate-900">{request.titleCompanyName}</p>
                      {request.escrowOfficerName && <p>Attn: {request.escrowOfficerName}</p>}
                      <p className="text-blue-600 font-medium">{request.titleCompanyEmail}</p>
                      <p>{formatPhone(request.titleCompanyPhone)}</p>
                    </div>
                  </section>
                )}
                <section className="flex-1">
                  <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-2 border-b border-blue-100 pb-2.5">Property Details</h4>
                  <div className="text-[11px] font-medium">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[8px] bg-blue-100 text-blue-700 px-2 pt-2 pb-2.5 rounded font-black uppercase tracking-wider inline-flex items-center">{request.propertyType || 'Home Sale'}</span>
                      <span className="text-[8px] bg-slate-100 text-slate-700 px-2 pt-2 pb-2.5 rounded font-black uppercase tracking-wider inline-flex items-center">{request.representation || 'Seller'} Rep</span>
                      {request.mlsNumber && <span className="text-[10px] text-slate-500 font-bold inline-block pb-1">MLS# {request.mlsNumber}</span>}
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-snug mb-2">{request.propertyAddress}</p>
                    <div className="grid grid-cols-2 gap-3 text-[10px] pb-2 w-full">
                      <div className="min-w-0">
                        <span className="text-slate-400 font-bold uppercase text-[8px] block mb-0.5">Seller</span>
                        <p className="font-bold text-slate-700 break-words leading-normal">{request.sellerName || 'N/A'}</p>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 font-bold uppercase text-[8px] block mb-0.5">Buyer</span>
                        <p className="font-bold text-slate-700 break-words leading-normal">{request.buyerName || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] pt-2 border-t border-slate-200 mt-1">
                      <p>Price: <span className="font-bold">${request.salePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                      {request.closingDate && <p>Closing: <span className="font-bold">{formatClosingDate(request.closingDate)}</span></p>}
                      {request.rateType && (
                        <p>Compensation: <span className="font-bold">
                          {request.rateType === 'percentage' ? `${request.commissionRate}%` : `$${request.commissionRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </span></p>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              <section className="relative z-10 mb-2">
                <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-2 border-b border-blue-100 pb-2.5">Disbursement Summary</h4>
                <div className="bg-slate-50 p-2.5 rounded-lg space-y-2.5 text-[11px]">
                  <div className="flex justify-between border-b border-slate-200 pb-2 mb-2">
                    <span className="text-slate-500 font-bold uppercase text-[8px]">Description</span>
                    <span className="text-slate-500 font-bold uppercase text-[8px]">Amount</span>
                  </div>
                  
                  <div className="flex justify-between font-medium py-1">
                    <span>Base Compensation ({request.rateType === 'percentage' ? `${request.commissionRate}%` : `$${request.commissionRate.toLocaleString()}`})</span>
                    <span>${(request.baseCommission || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {(request.bonusAmount > 0 || request.referralAmount > 0 || request.rebateAmount > 0 || (request.hasCoBroker && request.coBrokerSplitAmount > 0)) && (
                    <div className="space-y-1.5 border-t border-slate-200 pt-2 my-2 text-[10px]">
                      {request.bonusAmount > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Production Bonus {request.bonusRateType === 'percentage' ? `(${request.bonusRateValue}% of Sale Price)` : '(Flat)'}</span>
                          <span className="text-emerald-600 font-bold">+${request.bonusAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {request.rebateAmount > 0 && (
                        <div className="flex justify-between text-rose-600">
                          <span>
                            {request.rebateRecipient === 'Buyer'
                              ? 'Buyer Credit / Rebate Deduction'
                              : request.rebateRecipient === 'Seller'
                              ? 'Seller Credit / Rebate Deduction'
                              : `${request.representation ? `${request.representation} Credit / Rebate Deduction` : 'Client Rebate / Discount Deduction'}`}{' '}
                            {request.rebateRateType === 'percentage' ? `(${request.rebateRateValue}% of Sale Price)` : '(Flat)'}
                          </span>
                          <span className="font-bold">-${request.rebateAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {request.referralAmount > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Broker Referral Deduction ({request.referralAgentName ? `${request.referralAgentName} @ ` : ''}{request.referralBrokerName || 'Other Brokerage'})</span>
                          <span className="font-bold">-${request.referralAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {request.hasCoBroker && request.coBrokerSplitAmount > 0 && (
                        <div className="flex justify-between text-amber-700">
                          <span>Buyer Broker Split ({request.coBrokerName || 'Co-Broker'}{request.coBrokerSplitPercentage !== undefined ? ` • ${request.coBrokerSplitPercentage}%` : ''})</span>
                          <span className="font-bold text-amber-700">-${request.coBrokerSplitAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex justify-between border-y border-blue-200 py-2.5 my-2.5 font-black text-xs text-blue-900">
                    <span>GROSS COMPENSATION TOTAL</span>
                    <span>${request.grossCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  <div className="space-y-1 pt-0.5">
                    <div className="flex flex-col gap-1 bg-blue-50 px-2 pt-2 pb-[20px] rounded-lg border border-blue-100">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 underline decoration-blue-200 underline-offset-2 text-[11px]">PAYABLE TO: MOVING TEXAS REALTY (BROKER)</span>
                          <span className="text-[9px] text-slate-500 font-medium mt-0.5">
                            {payEntireToBroker 
                              ? 'Single Disbursement - Full Gross Compensation' 
                              : request.mentorSplitAmount > 0
                                ? `Broker Portion ($${request.brokerSplitAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Mentorship Fee ($${request.mentorSplitAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                                : 'Full Brokerage Portion'}
                          </span>
                        </div>
                        <span className="font-black text-blue-900 text-sm">
                          ${(payEntireToBroker 
                            ? request.grossCommission 
                            : request.brokerSplitAmount + (request.mentorSplitAmount || 0)
                          ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      
                      {!payEntireToBroker && request.mentorSplitAmount > 0 && (
                        <div className="border-t border-blue-100 mt-1 pt-1 text-[8.5px] text-purple-700 font-bold uppercase tracking-wider">
                          <table className="border-collapse w-full">
                            <tbody>
                              <tr>
                                <td className="align-middle pr-1" style={{ verticalAlign: 'middle', width: '8px', paddingRight: '4px' }}>
                                  <span className="block w-1.5 h-1.5 bg-purple-600 rounded-full" style={{ display: 'block', width: '5px', height: '5px' }}></span>
                                </td>
                                <td className="align-middle text-purple-700" style={{ verticalAlign: 'middle' }}>
                                  <span>Includes Mentorship Fee of ${request.mentorSplitAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to be paid to Assigned Mentor by Moving Texas Realty.</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {!payEntireToBroker && request.agentGrossAmount > 0 && (
                      <div className="flex justify-between items-center bg-white px-2 pt-1.5 pb-[20px] rounded-lg border border-slate-200">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 underline decoration-emerald-200 underline-offset-2 text-[11px]">PAYABLE TO: {request.agentName} (AGENT)</span>
                          <span className="text-[9px] text-slate-500 font-medium flex items-center gap-1">
                            Agent Distribution {request.agentPhone && `• ${formatPhone(request.agentPhone)}`}
                          </span>
                        </div>
                        <span className="font-black text-emerald-700 text-sm">${request.agentGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {request.hasCoBroker && request.coBrokerSplitAmount > 0 && (
                      <div className="flex justify-between items-center bg-white px-2 pt-1.5 pb-[20px] rounded-lg border border-slate-200">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 underline decoration-amber-200 underline-offset-2 text-[11px]">PAYABLE TO: {request.coBrokerName || "CO-BROKER"} (BUYER'S BROKER)</span>
                          <span className="text-[9px] text-slate-500 font-medium flex items-center gap-1">
                            Co-Broker Split (Lease Transaction{request.coBrokerSplitPercentage !== undefined ? ` • ${request.coBrokerSplitPercentage}%` : ''})
                          </span>
                        </div>
                        <span className="font-black text-amber-700 text-sm">${request.coBrokerSplitAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {request.referralAmount > 0 && (
                      <div className="flex justify-between items-start bg-white px-2 pt-1.5 pb-[20px] rounded-lg border border-slate-200">
                        <div className="flex flex-col space-y-0.5">
                          <span className="font-bold text-slate-900 underline decoration-rose-300 underline-offset-2 text-[11px]">PAYABLE TO: {request.referralBrokerName || 'REFERRAL BROKERAGE'}</span>
                          <div className="text-[9px] text-slate-500 font-medium flex flex-col gap-0.5">
                            {request.referralAgentName && (
                              <span className="text-slate-700 font-bold">For Referral Agent: {request.referralAgentName}</span>
                            )}
                            <span>
                              Referral Fee: {request.referralRateType === 'percentage' ? `${request.referralRateValue}% of compensation` : `$${request.referralRateValue.toLocaleString()}`}
                            </span>
                            <span className="text-rose-900 font-bold bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded inline-block text-[8.5px]">
                              ✉️ MAIL REFERRAL CHECK TO: {request.referralBrokerAddress || 'Not Specified (Please contact broker)'}
                            </span>
                          </div>
                        </div>
                        <span className="font-black text-rose-700 text-sm shrink-0">${request.referralAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>

                  {request.isOwnerAgent && !request.payAgent && (
                    <div className="mt-1 p-1.5 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center gap-2">
                      <span className="text-[10px] italic text-blue-800 font-medium">Note: Agent is property owner; compensation portion waived to self. Only broker split is payable.</span>
                    </div>
                  )}
                </div>
              </section>

              <div className="relative z-10 mt-auto pt-3 my-1 border-t border-slate-200/60 shrink-0">
                <div className="flex gap-12">
                  <div className="flex-1 text-center font-sans">
                    {/* Signature visually ABOVE the line */}
                    <div className="h-14 min-h-[56px] flex flex-col items-center justify-center pb-1">
                      {request.status === 'approved' ? (
                        <div className="flex flex-col items-center">
                          {brokerSignature ? (
                            <img 
                              src={brokerSignature} 
                              alt="Broker Signature" 
                              referrerPolicy="no-referrer"
                              className="max-h-9 max-w-[140px] object-contain select-none"
                              style={{ maxHeight: '36px', maxWidth: '140px', width: 'auto', height: '36px', objectFit: 'contain' }}
                            />
                          ) : (
                            <div className="font-signature text-2xl text-blue-700 select-none transform -rotate-1 leading-none animate-fade-in" style={{ fontFamily: "'Alex Brush', cursive" }}>
                              Alex Hutchens
                            </div>
                          )}
                          <div className="text-[7px] text-emerald-600 font-extrabold tracking-widest uppercase mt-0.5">
                            ✓ Digitally Signed & Authorized
                          </div>
                        </div>
                      ) : (
                        <span className="text-[8px] font-extrabold uppercase tracking-widest text-slate-300 bg-slate-50 px-2 py-0.5 rounded border border-dashed border-slate-200">
                          Pending Approval
                        </span>
                      )}
                    </div>

                    {/* The Horizontal Line and Labels */}
                    <div className="border-t border-slate-900 pt-1 text-center">
                      <div className="text-[8.5px] font-bold uppercase text-slate-500 tracking-wider">Broker Signature</div>
                      <div className="text-[11px] font-black text-slate-950 uppercase tracking-wide">Alex Hutchens</div>
                      <div className="text-[8.5px] text-slate-600 font-bold uppercase tracking-wider">
                        Designated Broker for Moving Texas Realty
                      </div>
                      <div className="text-[7.5px] text-red-600 font-black tracking-wider uppercase italic">
                        Must have broker signature to be valid.
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 text-center font-sans">
                    {/* Date visually ABOVE the line */}
                    <div className="h-14 min-h-[56px] flex items-center justify-center pb-1">
                      {request.status === 'approved' ? (
                        <span className="text-[11px] font-black text-slate-800 bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200">
                          {request.approvedAt ? new Date(request.approvedAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          }) : new Date().toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })}
                        </span>
                      ) : (
                        <span className="text-[9px] font-extrabold text-slate-300 tracking-widest">
                          -- / -- / ----
                        </span>
                      )}
                    </div>

                    {/* The Horizontal Line and Labels */}
                    <div className="border-t border-slate-900 pt-1 text-center" style={{ minHeight: '45px' }}>
                      <div className="text-[8.5px] font-bold uppercase text-slate-500 tracking-wider">Date Signed</div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-1.5 border-t border-blue-50 text-[8.5px] text-slate-500 font-medium pb-0.5">
                  <p className="flex items-start gap-1">
                    <span className="text-blue-900 font-black uppercase tracking-widest shrink-0">Note to Escrow Officer:</span>
                    <span>Please send copies of the finalized Closing Disclosure (CD) or ALTA settlement statement to our office at <span className="font-bold text-slate-700">525 Fort Worth Dr Ste 216, Denton, TX 76201</span> upon closing.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={activeTab === 'wiring' ? 'block' : 'hidden'}>
            {/* Wiring Instructions View */}
            <div 
              ref={wirePrintRef} 
              data-wire-content 
              className="bg-white p-10 pb-12 w-[210mm] min-w-[210mm] h-[297mm] mx-auto border border-slate-200 text-slate-900 relative overflow-hidden flex flex-col justify-start font-sans shadow-lg"
              style={{ height: '297mm', minHeight: '297mm', maxHeight: '297mm', boxSizing: 'border-box' }}
            >
              {/* Header Logo & Address */}
              <div className="flex flex-col items-center text-center pt-2 shrink-0 w-full">
                <img 
                  src="/moving_texas_realty_logo_dark.png" 
                  alt="Moving Texas Realty" 
                  className="h-16 w-auto object-contain mb-2 mx-auto"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                  style={{ height: '64px', maxHeight: '64px', width: 'auto', objectFit: 'contain', margin: '0 auto 8px auto', display: 'block' }}
                />
                <h1 className="text-2xl font-serif text-slate-900 tracking-wide font-normal">Moving Texas Realty</h1>
                <p className="text-sm italic text-slate-700 font-serif mt-1">525 Fort Worth Dr Ste 216</p>
                <p className="text-sm italic text-slate-700 font-serif">Denton, TX 76201</p>
                <p className="text-sm italic text-slate-700 font-serif">1 (888) 433-9722</p>
              </div>

              {/* Date and Property Address */}
              <div className="space-y-4 my-5 text-base px-6 shrink-0 w-full">
                <div className="flex items-baseline w-full">
                  <span className="font-serif text-slate-900 font-medium w-[220px] shrink-0">Date:</span>
                  <span className="border-b border-slate-900 px-2 font-sans font-medium text-slate-900 pb-[10px] flex-1">
                    {new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  </span>
                </div>

                <div className="flex items-baseline w-full">
                  <span className="font-serif text-slate-900 shrink-0 font-medium w-[220px]">Property Address or GF No:</span>
                  <span className="border-b border-slate-900 px-2 font-sans font-medium text-slate-900 pb-[10px] flex-1">
                    {request.propertyAddress || ''}
                  </span>
                </div>
              </div>

              {/* Main Heading */}
              <div className="text-center my-3 shrink-0 w-full">
                <h2 className="text-4xl font-sans text-slate-900 font-normal tracking-tight">Wiring Instructions</h2>
              </div>

              {/* Beneficiary Details Table */}
              <div className="my-5 space-y-4 text-base px-6 max-w-2xl mx-auto w-full shrink-0">
                <div className="flex items-baseline w-full pb-[10px]">
                  <span className="font-serif text-slate-900 font-medium w-[240px] shrink-0">Beneficiary Name:</span>
                  <span className="font-sans text-slate-900 font-normal flex-1">Moving Texas Realty</span>
                </div>

                <div className="flex items-start w-full pb-[10px]">
                  <span className="font-serif text-slate-900 font-medium w-[240px] shrink-0">Beneficiary Address:</span>
                  <div className="font-sans text-slate-900 font-normal leading-snug flex-1">
                    <p>525 Fort Worth Dr Ste 216</p>
                    <p>Denton, TX 76201</p>
                  </div>
                </div>

                <div className="flex items-baseline w-full pb-[10px]">
                  <span className="font-serif text-slate-900 font-medium w-[240px] shrink-0">Beneficiary Bank:</span>
                  <span className="font-sans text-slate-900 font-normal flex-1">Chase Bank NA</span>
                </div>

                <div className="flex items-baseline w-full pb-[10px]">
                  <span className="font-serif text-slate-900 font-medium w-[240px] shrink-0">Beneficiary Bank ABA:</span>
                  <span className="font-sans text-slate-900 font-normal flex-1">02100021</span>
                </div>

                <div className="flex items-baseline w-full pb-[10px]">
                  <span className="font-serif text-slate-900 font-medium w-[240px] shrink-0">Beneficiary Account Number:</span>
                  <span className="font-sans text-slate-900 font-normal flex-1">827955821</span>
                </div>
              </div>

              {/* Reference Line */}
              <div className="my-5 text-base px-6 shrink-0 w-full">
                <div className="flex items-baseline gap-2 w-full">
                  <span className="font-serif text-slate-900 font-medium shrink-0">Reference: Address</span>
                  <span className="border-b border-slate-900 px-2 text-center font-sans font-medium text-slate-900 pb-[10px] flex-1 truncate">
                    {(request.propertyAddress || '').split(',')[0].trim()}
                  </span>
                  <span className="font-serif text-slate-900 text-right font-medium shrink-0 ml-4">Agent</span>
                  <span className="border-b border-slate-900 px-2 text-center font-sans font-medium text-slate-900 pb-[10px] flex-1 truncate">
                    {request.agentName || ''}
                  </span>
                </div>
              </div>

              {/* Signature Space at the Bottom */}
              <div className="mt-auto pt-6 px-6 font-sans shrink-0">
                <div className="flex gap-16">
                  <div className="flex-1 text-center">
                    <div className="h-14 min-h-[56px] flex flex-col items-center justify-center pb-1">
                      {request.status === 'approved' ? (
                        <div className="flex flex-col items-center">
                          {brokerSignature ? (
                            <img 
                              src={brokerSignature} 
                              alt="Broker Signature" 
                              referrerPolicy="no-referrer"
                              className="max-h-9 max-w-[140px] object-contain select-none"
                              style={{ maxHeight: '36px', maxWidth: '140px', width: 'auto', height: '36px', objectFit: 'contain' }}
                            />
                          ) : (
                            <div className="font-signature text-2xl text-blue-900 select-none transform -rotate-1 leading-none" style={{ fontFamily: "'Alex Brush', cursive" }}>
                              Alex Hutchens
                            </div>
                          )}
                          <div className="text-[7px] text-emerald-600 font-extrabold tracking-widest uppercase mt-0.5">
                            ✓ Digitally Signed & Verified
                          </div>
                        </div>
                      ) : (
                        <div className="w-full border-b border-slate-900 h-6"></div>
                      )}
                    </div>
                    <div className="border-t border-slate-900 pt-1 text-center">
                      <div className="text-[10px] font-bold uppercase text-slate-700 tracking-wider">Authorized Broker Signature</div>
                      <div className="text-xs font-black text-slate-950 uppercase tracking-wide mt-0.5">Alex Hutchens</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider">
                        Moving Texas Realty
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="h-14 min-h-[56px] flex items-center justify-center pb-1">
                      {request.status === 'approved' ? (
                        <span className="text-[11px] font-black text-slate-800 bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200">
                          {request.approvedAt ? new Date(request.approvedAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          }) : new Date().toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })}
                        </span>
                      ) : (
                        <div className="w-full border-b border-slate-900 h-6"></div>
                      )}
                    </div>
                    <div className="border-t border-slate-900 pt-1 text-center">
                      <div className="text-[10px] font-bold uppercase text-slate-700 tracking-wider">Date</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans">
          <div className="flex items-center gap-2">
            {profile?.role === 'admin' && request.status === 'pending' && (
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                Review Mode
              </span>
            )}
            {request.status === 'approved' && (
              <span className="text-xs font-extrabold text-emerald-700 uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                Approved & Active
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
            {request.status === 'pending' ? (
              <>
                {profile?.role === 'admin' ? (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <button 
                      onClick={handleApproveOnly}
                      className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95 w-full sm:w-auto justify-center text-xs uppercase tracking-wider"
                    >
                      <CheckCircle size={18} />
                      Approve Request & Lock Split
                    </button>
                    {onRejected && (
                      <button 
                        onClick={onRejected}
                        className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all active:scale-95 w-full sm:w-auto justify-center text-xs uppercase tracking-wider"
                      >
                        <XCircle size={18} />
                        Reject Request
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 w-full sm:w-auto text-center">
                    Pending Broker Approval • PDF drafted
                  </span>
                )}
              </>
            ) : (
              <>
                <button 
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-800 rounded-xl font-bold hover:bg-slate-200 transition-colors w-full sm:w-auto justify-center text-xs"
                >
                  <Download size={16} />
                  Download CDA PDF
                </button>
                <button 
                  onClick={handleDownloadWiring}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-800 rounded-xl font-bold hover:bg-slate-200 transition-colors w-full sm:w-auto justify-center text-xs"
                >
                  <Download size={16} />
                  Download Wire Instructions
                </button>
                {profile?.role === 'admin' && request.propertyType !== 'Lease' && (
                  <button 
                    onClick={handleSendApprovedEmailOnly}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 w-full sm:w-auto justify-center text-xs"
                  >
                    <Mail size={16} />
                    Email Title Co.
                  </button>
                )}
              </>
            )}
            <button 
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all w-full sm:w-auto text-center text-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
