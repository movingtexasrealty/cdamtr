/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, query, addDoc, deleteDoc, getDocs, where, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  User, 
  Mail, 
  Settings, 
  Shield, 
  Save, 
  X,
  CreditCard,
  Target,
  Plus,
  Trash2
} from 'lucide-react';

export default function AdminAgents() {
  const [agents, setAgents] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: '',
    email: '',
    phone: '',
    licenseNumber: '',
    agentSplit: 80 as number | undefined,
    brokerSplit: 20 as number | undefined,
    capAmount: 15000 as number | undefined,
    isInexperienced: false
  });

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAgents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });
    return () => unsubscribe();
  }, []);

  const handleEdit = (agent: any) => {
    setEditingId(agent.id);
    setEditForm({ ...agent });
  };

  const handleSave = async () => {
    if (!editingId) return;
    try {
      await updateDoc(doc(db, 'users', editingId), editForm);
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgent.isInexperienced) {
      if (newAgent.agentSplit === undefined || newAgent.brokerSplit === undefined) {
        alert('Please enter both the Agent Split and Broker Split percentages.');
        return;
      }
      if (newAgent.capAmount === undefined) {
        alert('Please enter a Cap Amount (e.g., 15000, or 0 if no cap).');
        return;
      }
    }

    try {
      // First check if email is already in the roster
      const q = query(collection(db, 'users'), where('email', '==', newAgent.email.toLowerCase()));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        alert('This email is already in the roster.');
        return;
      }

      // We use a placeholder ID since we don't have the UID yet.
      // This document will serve as a "pre-authorized" entry.
      // The login logic will look for an entry with this email.
      const docId = `preauth_${Date.now()}`;
      await setDoc(doc(db, 'users', docId), {
        email: newAgent.email.toLowerCase(),
        name: newAgent.name,
        phone: newAgent.phone,
        role: 'agent',
        licenseNumber: newAgent.licenseNumber,
        isPreAuthorized: true,
        commissionProfile: {
          splitType: 'percentage',
          agentSplit: newAgent.isInexperienced ? 70 : newAgent.agentSplit,
          brokerSplit: newAgent.isInexperienced ? 20 : newAgent.brokerSplit,
          mentorSplit: newAgent.isInexperienced ? 10 : 0,
          mentorActive: newAgent.isInexperienced,
          isInexperienced: newAgent.isInexperienced,
          capAmount: newAgent.isInexperienced ? 0 : newAgent.capAmount,
          yearlyProduction: 0
        }
      });

      setShowAddModal(false);
      setNewAgent({
        name: '',
        email: '',
        phone: '',
        licenseNumber: '',
        agentSplit: undefined as number | undefined,
        brokerSplit: undefined as number | undefined,
        capAmount: undefined as number | undefined,
        isInexperienced: false
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const handleDeleteAgent = (id: string, name: string) => {
    setDeletingAgent({ id, name });
  };

  const confirmDeleteAgent = async () => {
    if (!deletingAgent) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', deletingAgent.id));
      setDeletingAgent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 text-shadow-sm">Roster Management</h1>
          <p className="text-slate-500 font-medium">Control which agents are authorized to access the system.</p>
        </div>
        <button 
          onClick={() => {
            setNewAgent({
              name: '',
              email: '',
              phone: '',
              licenseNumber: '',
              agentSplit: 80,
              brokerSplit: 20,
              capAmount: 15000,
              isInexperienced: false
            });
            setShowAddModal(true);
          }}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-200"
        >
          <Plus size={20} />
          Add Authorized Agent
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
              <h2 className="text-xl font-black">Pre-Authorize Agent</h2>
              <button onClick={() => setShowAddModal(false)} className="hover:bg-blue-700 p-1 rounded-lg">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddAgent} className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2 tracking-widest">Full Name</label>
                  <input 
                    required
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                    value={newAgent.name}
                    onChange={e => setNewAgent({...newAgent, name: e.target.value})}
                    placeholder="Agent Name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2 tracking-widest">Email Address</label>
                  <input 
                    required
                    type="email"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                    value={newAgent.email}
                    onChange={e => setNewAgent({...newAgent, email: e.target.value})}
                    placeholder="agent@movingtexasrealty.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2 tracking-widest">Phone Number</label>
                  <input 
                    required
                    type="tel"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                    value={newAgent.phone}
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
                      setNewAgent({...newAgent, phone: val});
                    }}
                    placeholder="(###) ###-####"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-2 tracking-widest">Agent Split %</label>
                    <input 
                      required
                      type="number"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none font-bold"
                      value={newAgent.agentSplit !== undefined ? newAgent.agentSplit : ''}
                      onChange={e => {
                        const agentSplit = e.target.value === '' ? undefined : parseFloat(e.target.value);
                        setNewAgent({
                          ...newAgent, 
                          agentSplit,
                          brokerSplit: agentSplit !== undefined ? Math.max(0, 100 - agentSplit) : undefined
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-2 tracking-widest">Broker Split %</label>
                    <input 
                      required
                      type="number"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none font-bold"
                      value={newAgent.brokerSplit !== undefined ? newAgent.brokerSplit : ''}
                      onChange={e => {
                        const brokerSplit = e.target.value === '' ? undefined : parseFloat(e.target.value);
                        setNewAgent({
                          ...newAgent, 
                          brokerSplit,
                          agentSplit: brokerSplit !== undefined ? Math.max(0, 100 - brokerSplit) : undefined
                        });
                      }}
                    />
                  </div>
                </div>

                {!newAgent.isInexperienced ? (
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-2 tracking-widest">Yearly Cap Amount ($)</label>
                    <input 
                      required={!newAgent.isInexperienced}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 15000 (or 0 if no cap)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none font-bold focus:ring-2 focus:ring-blue-500 text-slate-900"
                      value={newAgent.capAmount !== undefined ? newAgent.capAmount : ''}
                      onChange={e => setNewAgent({
                        ...newAgent, 
                        capAmount: e.target.value === '' ? undefined : parseFloat(e.target.value)
                      })}
                    />
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">Standard cap is $15,000 per year. Enter 0 if agent has no cap.</p>
                  </div>
                ) : (
                  <div className="py-3 px-4 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 italic">
                    Yearly Cap: Exempt (No Cap for Mentorship Program)
                  </div>
                )}

                <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <input
                    type="checkbox"
                    id="newIsInexperienced"
                    className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    checked={newAgent.isInexperienced}
                    onChange={e => {
                      const isInexp = e.target.checked;
                      setNewAgent({
                        ...newAgent,
                        isInexperienced: isInexp,
                        agentSplit: isInexp ? 70 : 80,
                        brokerSplit: isInexp ? 20 : 20,
                        capAmount: isInexp ? 0 : 15000
                      });
                    }}
                  />
                  <div>
                    <label htmlFor="newIsInexperienced" className="block text-xs font-bold text-slate-700 cursor-pointer">Inexperienced Agent (Mentorship Program)</label>
                    <p className="text-[10px] text-slate-500 font-medium">Auto-applies 70/20/10 split (agent/broker/mentor) and exempts agent from Yearly Cap constraints.</p>
                  </div>
                </div>

              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                Authorize & Add to Roster
              </button>
            </form>
          </div>
        </div>
      )}

      {deletingAgent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 space-y-4">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900 text-center">Remove Agent</h3>
              <p className="text-sm text-slate-600 text-center font-medium">
                Are you sure you want to remove <span className="font-bold text-slate-900">{deletingAgent.name}</span> from the roster? They will lose all access to the system.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingAgent(null)}
                  disabled={isDeleting}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteAgent}
                  disabled={isDeleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-200"
                >
                  {isDeleting ? 'Removing...' : 'Delete Agent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 transition-all hover:shadow-md">
            {editingId === agent.id ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{agent.name}</h3>
                      <p className="text-sm text-slate-500">{agent.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setEditingId(null)}
                      className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                    >
                      <X size={20} />
                    </button>
                    <button 
                      onClick={handleSave}
                      className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors"
                    >
                      <Save size={18} />
                      Save
                    </button>
                  </div>
                </div>

                {/* Mentorship Program Settings header/block */}
                <div className="md:col-span-3 bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="editIsInexperienced"
                        className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={!!editForm.commissionProfile?.isInexperienced}
                        onChange={e => {
                          const isInexp = e.target.checked;
                          const profile = editForm.commissionProfile || {};
                          setEditForm({
                            ...editForm,
                            commissionProfile: {
                              ...profile,
                              isInexperienced: isInexp,
                              mentorActive: isInexp ? true : false,
                              mentorSplit: isInexp ? 10 : 0,
                              agentSplit: isInexp ? 70 : 80,
                              brokerSplit: 20,
                              capAmount: isInexp ? 0 : 15000
                            }
                          });
                        }}
                      />
                      <div>
                        <label htmlFor="editIsInexperienced" className="text-sm font-bold text-slate-800 cursor-pointer">Inexperienced Agent (Mentor Program)</label>
                        <p className="text-xs text-slate-500 font-medium">Under this policy, the agent is exempt from Yearly Cap limits.</p>
                      </div>
                    </div>

                    {!!editForm.commissionProfile?.isInexperienced && (
                      <div className="flex items-start gap-3 bg-purple-50 p-3 rounded-xl border border-purple-200">
                        <input
                          type="checkbox"
                          id="editMentorActive"
                          className="mt-1 w-5 h-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                          checked={!!editForm.commissionProfile?.mentorActive}
                          onChange={e => {
                            const active = e.target.checked;
                            const profile = editForm.commissionProfile || {};
                            setEditForm({
                              ...editForm,
                              commissionProfile: {
                                ...profile,
                                mentorActive: active,
                                mentorSplit: active ? 10 : 0,
                                agentSplit: active ? 70 : 80, // Giving 10% back to agent when deactivated
                                brokerSplit: 20
                              }
                            });
                          }}
                        />
                        <div>
                          <label htmlFor="editMentorActive" className="text-sm font-bold text-purple-900 cursor-pointer">Mentor Split Active (10%)</label>
                          <p className="text-[11px] text-purple-700 font-medium">Toggle off when agent achieves experienced requirements. Gives 10% back to agent.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Shield size={14} /> Account Settings
                    </h4>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Role</label>
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        value={editForm.role}
                        onChange={e => setEditForm({...editForm, role: e.target.value})}
                      >
                        <option value="agent">Agent</option>
                        <option value="admin">Admin / Broker</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">License Number</label>
                      <input 
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                        value={editForm.licenseNumber || ''}
                        onChange={e => setEditForm({...editForm, licenseNumber: e.target.value})}
                        placeholder="e.g. 506471"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Phone Number</label>
                      <input 
                        type="tel"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                        value={editForm.phone || ''}
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
                          setEditForm({...editForm, phone: val});
                        }}
                        placeholder="(###) ###-####"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <CreditCard size={14} /> Commission Split
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Agent %</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                          value={editForm.commissionProfile?.agentSplit ?? ''}
                          onChange={e => {
                            const agentSplit = parseFloat(e.target.value) || 0;
                            setEditForm({
                              ...editForm, 
                              commissionProfile: { 
                                ...editForm.commissionProfile, 
                                agentSplit,
                                brokerSplit: Math.max(0, 100 - agentSplit)
                              }
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Broker %</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                          value={editForm.commissionProfile?.brokerSplit ?? ''}
                          onChange={e => {
                            const brokerSplit = parseFloat(e.target.value) || 0;
                            setEditForm({
                              ...editForm, 
                              commissionProfile: { 
                                ...editForm.commissionProfile, 
                                brokerSplit,
                                agentSplit: Math.max(0, 100 - brokerSplit)
                              }
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Target size={14} /> Yearly Cap
                    </h4>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Cap Amount ($)</label>
                      {editForm.commissionProfile?.isInexperienced ? (
                        <div className="py-2.5 px-3 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 italic">
                          Exempt (No Cap)
                        </div>
                      ) : (
                        <input 
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                          value={editForm.commissionProfile?.capAmount || 15000}
                          onChange={e => setEditForm({
                            ...editForm, 
                            commissionProfile: { ...editForm.commissionProfile, capAmount: parseFloat(e.target.value) }
                          })}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Settings size={14} /> Transaction Type Overrides
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {['Home Sale', 'Lease', 'Land', 'Commercial', 'Referral'].map((type) => {
                      const override = editForm.commissionProfile?.overrides?.[type];
                      return (
                        <div key={type} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:border-blue-200 transition-colors">
                          <p className="text-xs font-black text-slate-900 uppercase mb-3 tracking-widest border-b border-slate-200 pb-2">{type}</p>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-tighter">Agent %</label>
                              <input 
                                type="number"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                value={override?.agentSplit ?? ''}
                                placeholder={String(editForm.commissionProfile?.agentSplit ?? '')}
                                onChange={e => {
                                  const val = e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0);
                                  const currentOverrides = editForm.commissionProfile?.overrides || {};
                                  
                                  const newOverrides = { ...currentOverrides };
                                  if (val === undefined) {
                                    delete newOverrides[type];
                                  } else {
                                    newOverrides[type] = {
                                      ...newOverrides[type],
                                      agentSplit: val,
                                      brokerSplit: Math.max(0, 100 - val)
                                    };
                                  }

                                  setEditForm({
                                    ...editForm,
                                    commissionProfile: {
                                      ...editForm.commissionProfile,
                                      overrides: newOverrides
                                    }
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-tighter">Broker %</label>
                              <input 
                                type="number"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                value={override?.brokerSplit ?? ''}
                                placeholder={String(editForm.commissionProfile?.brokerSplit ?? '')}
                                onChange={e => {
                                  const val = e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0);
                                  const currentOverrides = editForm.commissionProfile?.overrides || {};
                                  
                                  const newOverrides = { ...currentOverrides };
                                  if (val === undefined) {
                                    delete newOverrides[type];
                                  } else {
                                    newOverrides[type] = {
                                      ...newOverrides[type],
                                      brokerSplit: val,
                                      agentSplit: Math.max(0, 100 - val)
                                    };
                                  }

                                  setEditForm({
                                    ...editForm,
                                    commissionProfile: {
                                      ...editForm.commissionProfile,
                                      overrides: newOverrides
                                    }
                                  });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
                    {agent.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                      {agent.name}
                      {agent.role === 'admin' && <Shield size={14} className="text-blue-500" />}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {agent.email} • {agent.phone ? `${agent.phone} • ` : ''}Lic: {agent.licenseNumber || 'None'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="hidden md:block text-center whitespace-nowrap">
                    <p className="text-xs font-bold text-slate-400 uppercase">Split</p>
                    <div className="flex flex-col items-center">
                      <p className="font-bold text-slate-700">
                        {agent.commissionProfile?.agentSplit ?? 0}/{agent.commissionProfile?.brokerSplit ?? 0}
                        {agent.commissionProfile?.isInexperienced && agent.commissionProfile?.mentorActive && (
                          <span className="text-purple-600">/{agent.commissionProfile?.mentorSplit ?? 10}</span>
                        )}
                      </p>
                      {agent.commissionProfile?.overrides && Object.keys(agent.commissionProfile.overrides).length > 0 && (
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter bg-blue-50 px-1.5 py-0.5 rounded leading-none mt-1">
                          + {Object.keys(agent.commissionProfile.overrides).length} Overrides
                        </span>
                      )}
                      {agent.commissionProfile?.isInexperienced && (
                        <span className="text-[9px] font-black text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded leading-none mt-1 uppercase tracking-wider">
                          {agent.commissionProfile?.mentorActive ? 'Mentorship Active' : 'Mentorship Off'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="hidden md:block text-center whitespace-nowrap">
                    <p className="text-xs font-bold text-slate-400 uppercase">Cap</p>
                    {agent.commissionProfile?.isInexperienced ? (
                      <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-wider">Exempt</span>
                    ) : (
                      <p className="font-bold text-slate-700">${(agent.commissionProfile?.capAmount || 15000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    )}
                  </div>
                  <button 
                    onClick={() => handleEdit(agent)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                  >
                    <Settings size={22} />
                  </button>
                  <button 
                    onClick={() => handleDeleteAgent(agent.id, agent.name)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
