/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc,
  addDoc
} from 'firebase/firestore';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock,
  ExternalLink,
  ChevronRight,
  Trash2,
  Plus,
  Pencil,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import CDAPreview from '../components/CDAPreview';

export default function Requests() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const requestsRef = collection(db, 'cdaRequests');
    const q = profile.role === 'admin' 
      ? query(requestsRef) 
      : query(requestsRef, where('agentId', '==', profile.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleStatusUpdate = async (id: string, status: string, additionalData?: any) => {
    try {
      await updateDoc(doc(db, 'cdaRequests', id), { 
        status, 
        approvedAt: status === 'approved' ? new Date().toISOString() : null,
        ...additionalData
      });

      if (status === 'approved') {
        const targetReq = requests.find(r => r.id === id);
        try {
          await addDoc(collection(db, 'notifications'), {
            title: 'CDA Request Approved',
            message: `The CDA request for ${targetReq?.propertyAddress || 'your transaction'} has been approved by the Broker.`,
            requestId: id,
            createdAt: new Date().toISOString(),
            readBy: [],
            recipientRole: 'all',
            type: 'approval'
          });
        } catch (nErr) {
          console.error('Failed to dispatch approval notification:', nErr);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'cdaRequests');
    }
  };

  const startReject = (req: any) => {
    setRejectingRequest(req);
    setRejectionReason('');
  };

  const handleRejectConfirm = async () => {
    if (!profile || profile.role !== 'admin' || !rejectingRequest) return;
    try {
      setIsRejecting(true);
      await updateDoc(doc(db, 'cdaRequests', rejectingRequest.id), {
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
        rejectedAt: new Date().toISOString()
      });

      try {
        await addDoc(collection(db, 'notifications'), {
          title: 'CDA Request Returned for Revision',
          message: `Your CDA request for ${rejectingRequest.propertyAddress || 'the transaction'} was returned for revision. Note: ${rejectionReason.trim() || 'Please check details.'}`,
          requestId: rejectingRequest.id,
          createdAt: new Date().toISOString(),
          readBy: [],
          recipientRole: 'all',
          type: 'rejection'
        });
      } catch (nErr) {
        console.error('Failed to dispatch rejection notification:', nErr);
      }

      setRejectingRequest(null);
      setRejectionReason('');
      setSelectedRequest(null); // Close the detail preview modal if it's open
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'cdaRequests');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDelete = async () => {
    if (!profile || profile.role !== 'admin' || !deletingRequest) return;
    
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, 'cdaRequests', deletingRequest.id));
      setDeletingRequest(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'cdaRequests');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesFilter = filter === 'all' || req.status === filter;
    const matchesSearch = req.propertyAddress.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          req.agentName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'rejected': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search address or agent..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <select 
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <Link 
            to="/requests/new"
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all text-sm"
          >
            <Plus size={18} />
            New
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Property / Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Agent</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Price / Commission</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Loading requests...</td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">No requests found.</td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-slate-900 font-bold">{req.propertyAddress}</p>
                      <p className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-slate-700">{req.agentName}</p>
                      <p className="text-[10px] text-slate-400">Lic: {req.agentLicense || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-slate-900">${req.salePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className="text-xs text-emerald-600 font-bold">
                        ${(req.agentGrossAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${(req.brokerSplitAmount ?? req.companySplitAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-[10px] text-slate-400 font-normal ml-1">(Agent/Broker)</span>
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getStatusStyle(req.status)}`}>
                          {req.status === 'pending' && <Clock size={12} />}
                          {req.status === 'approved' && <CheckCircle size={12} />}
                          {req.status === 'rejected' && <XCircle size={12} />}
                          {req.status}
                        </span>
                        {req.status === 'rejected' && req.rejectionReason && (
                          <p className="text-[11px] text-rose-600 font-medium italic max-w-[200px] truncate" title={req.rejectionReason}>
                            Reason: {req.rejectionReason}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {profile?.role === 'admin' && req.status === 'pending' && (
                          <>
                            <button 
                              onClick={() => setSelectedRequest(req)}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Approve"
                            >
                              <CheckCircle size={20} />
                            </button>
                            <button 
                              onClick={() => startReject(req)}
                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Reject"
                            >
                              <XCircle size={20} />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => setSelectedRequest(req)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>
                        {req.status === 'rejected' && req.agentId === profile?.uid && (
                          <Link 
                            to={`/requests/edit/${req.id}`}
                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Edit Rejected Request"
                          >
                            <Pencil size={18} />
                          </Link>
                        )}
                        {profile?.role === 'admin' && (
                          <button 
                            onClick={() => setDeletingRequest(req)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Request"
                          >
                            <Trash2 size={20} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {selectedRequest && (
        <CDAPreview 
          request={requests.find(r => r.id === selectedRequest.id) || selectedRequest} 
          onClose={() => setSelectedRequest(null)} 
          showApproveActions={profile?.role === 'admin' && selectedRequest.status === 'pending'}
          onApproved={(updateData) => handleStatusUpdate(selectedRequest.id, 'approved', updateData)}
          onRejected={() => startReject(selectedRequest)}
        />
      )}

      {/* Reject Request Confirmation Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-4 mb-4 text-rose-600">
              <div className="bg-rose-100 p-3 rounded-xl">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-black">Reject CDA Request?</h3>
            </div>
            <p className="text-slate-600 mb-3 font-medium leading-relaxed text-sm">
              Please enter a reason for rejecting the CDA request for: <br />
              <span className="font-bold text-slate-800">{rejectingRequest.propertyAddress}</span>
            </p>
            
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Rejection Reason (Returned to Agent)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Please correct the commission rate split to 70/30, or update the Escrow Officer contact details..."
                className="w-full h-28 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm resize-none font-sans font-medium text-slate-800 placeholder-slate-400"
                maxLength={500}
                required
              />
              <div className="text-right text-[10px] text-slate-400 font-medium">
                {rejectionReason.length}/500 characters
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRejectingRequest(null)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-200"
                disabled={isRejecting}
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={isRejecting || !rejectionReason.trim()}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isRejecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  'Reject Request'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Request Confirmation Modal */}
      {deletingRequest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-4 mb-4 text-rose-600">
              <div className="bg-rose-100 p-3 rounded-xl">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-black">Delete Request?</h3>
            </div>
            <p className="text-slate-600 mb-4 font-medium leading-relaxed">
              Are you sure you want to delete the CDA request for:
            </p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6 space-y-1">
              <p className="text-sm font-bold text-slate-900">{deletingRequest.propertyAddress}</p>
              <p className="text-xs text-slate-500">Agent: {deletingRequest.agentName}</p>
              <p className="text-xs text-slate-500">Price: ${deletingRequest.salePrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <p className="text-xs text-rose-500 font-bold uppercase mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingRequest(null)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-200"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
