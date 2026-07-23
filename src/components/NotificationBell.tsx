import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Trash2, ExternalLink, ShieldAlert, Sparkles, Settings, Mail, X, Send } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { getEmailSettings, saveEmailSettings, sendAdminNotificationEmail, EmailSettings } from '../lib/emailService';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  requestId?: string;
  agentName?: string;
  createdAt: string;
  readBy?: string[];
  recipientRole?: 'admin' | 'all';
}

export default function NotificationBell() {
  const { profile, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailConfig, setEmailConfig] = useState<EmailSettings>({
    enabled: false,
    serviceId: '',
    templateId: '',
    publicKey: '',
    adminEmail: 'MovingTexasRealty@gmail.com'
  });
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; msg?: string } | null>(null);

  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin) {
      getEmailSettings().then(setEmailConfig);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!profile) return;

    // Fetch latest notifications
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: AppNotification[] = [];
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as AppNotification;
        // Filter: show if recipientRole is 'all', or if recipientRole is 'admin' and user is admin
        if (!data.recipientRole || data.recipientRole === 'all' || (data.recipientRole === 'admin' && isAdmin)) {
          items.push({ id: docSnap.id, ...data });
        }
      });

      // Check if new unread item arrived while tab was open for desktop notification
      if ('Notification' in window && Notification.permission === 'granted' && items.length > 0) {
        const latest = items[0];
        const isUnread = !latest.readBy?.includes(profile.uid);
        const isRecent = new Date().getTime() - new Date(latest.createdAt).getTime() < 10000; // within 10 secs
        if (isUnread && isRecent) {
          try {
            new Notification(latest.title, {
              body: latest.message,
              icon: '/favicon.ico',
            });
          } catch (err) {
            console.error('Desktop notification error:', err);
          }
        }
      }

      setNotifications(items);
    }, (err) => {
      console.error('Error listening to notifications:', err);
    });

    return () => unsubscribe();
  }, [profile, isAdmin]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.readBy?.includes(profile?.uid || '')).length;

  const markAsRead = async (notificationId: string, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    if (!profile?.uid) return;

    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        readBy: arrayUnion(profile.uid)
      });
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!profile?.uid) return;
    const unread = notifications.filter(n => !n.readBy?.includes(profile.uid));
    for (const item of unread) {
      markAsRead(item.id);
    }
  };

  const handleNotificationClick = (item: AppNotification) => {
    markAsRead(item.id);
    setIsOpen(false);
    if (item.requestId) {
      navigate('/requests');
    }
  };

  const requestDesktopNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Desktop notifications are not supported in this browser.');
      return;
    }
    const perm = await Notification.requestPermission();
    setDesktopPermission(perm);
    if (perm === 'granted') {
      new Notification('Notifications Enabled', {
        body: 'You will now receive desktop alerts when new CDA requests are submitted.',
      });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all flex items-center justify-center focus:outline-none"
        title="Admin Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow-md shadow-red-200 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-blue-400" />
              <h3 className="font-extrabold text-sm tracking-wide">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-blue-500/30 text-blue-300 text-[11px] px-2 py-0.5 rounded-full font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => {
                    setShowEmailModal(true);
                    setIsOpen(false);
                  }}
                  className="text-slate-300 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
                  title="Configure EmailJS Email Alerts"
                >
                  <Settings size={16} />
                </button>
              )}
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                >
                  <Check size={14} /> Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Desktop Push Banner */}
          {desktopPermission === 'default' && (
            <div className="p-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between text-xs font-semibold text-blue-900">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-blue-600 flex-shrink-0" />
                <span>Get browser pop-up alerts on new submissions</span>
              </div>
              <button
                onClick={requestDesktopNotifications}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded-lg transition-colors flex-shrink-0 text-[11px]"
              >
                Enable
              </button>
            </div>
          )}

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Bell size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold">No notifications yet</p>
              </div>
            ) : (
              notifications.map((item) => {
                const isUnread = !item.readBy?.includes(profile?.uid || '');
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-4 transition-colors cursor-pointer flex items-start gap-3 hover:bg-slate-50 ${
                      isUnread ? 'bg-blue-50/40 border-l-4 border-l-blue-600' : 'bg-white'
                    }`}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                          {isUnread && <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>}
                          {item.title}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        {item.message}
                      </p>
                      <div className="pt-1 flex items-center justify-between text-[11px] text-blue-600 font-bold">
                        <span className="flex items-center gap-1 hover:underline">
                          View details <ExternalLink size={12} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-100 text-center flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-medium">
              Real-time updates active
            </span>
            {isAdmin && (
              <button
                onClick={() => {
                  setShowEmailModal(true);
                  setIsOpen(false);
                }}
                className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                <Mail size={12} /> EmailJS Setup
              </button>
            )}
          </div>
        </div>
      )}

      {/* EmailJS Configuration Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => {
                setShowEmailModal(false);
                setTestResult(null);
              }}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-full"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                <Mail size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">EmailJS Notifications</h2>
                <p className="text-xs text-slate-500 font-medium">Receive email alerts when CDA requests are submitted</p>
              </div>
            </div>

            <div className="space-y-4 my-6 text-slate-700">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-sm font-black text-slate-900 block">Enable EmailJS Alerts</span>
                  <span className="text-xs text-slate-500">Send email automatically upon new CDA request</span>
                </div>
                <input
                  type="checkbox"
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  checked={emailConfig.enabled}
                  onChange={(e) => setEmailConfig({ ...emailConfig, enabled: e.target.checked })}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1 tracking-wider">Admin Recipient Email</label>
                <input
                  type="email"
                  placeholder="e.g. MovingTexasRealty@gmail.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={emailConfig.adminEmail}
                  onChange={(e) => setEmailConfig({ ...emailConfig, adminEmail: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-1 tracking-wider">Service ID</label>
                  <input
                    type="text"
                    placeholder="e.g. service_xxxxxx"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={emailConfig.serviceId}
                    onChange={(e) => setEmailConfig({ ...emailConfig, serviceId: e.target.value.trim() })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-1 tracking-wider">Template ID</label>
                  <input
                    type="text"
                    placeholder="e.g. template_xxxxxx"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={emailConfig.templateId}
                    onChange={(e) => setEmailConfig({ ...emailConfig, templateId: e.target.value.trim() })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1 tracking-wider">Public Key (User ID)</label>
                <input
                  type="text"
                  placeholder="e.g. user_xxxxxxxxxxxx"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={emailConfig.publicKey}
                  onChange={(e) => setEmailConfig({ ...emailConfig, publicKey: e.target.value.trim() })}
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[11px] text-blue-900 space-y-1">
                <span className="font-bold block">EmailJS Template Variables to use in your EmailJS template:</span>
                <p className="font-mono text-[10px] text-blue-800">
                  {"{{to_email}}"}, {"{{title}}"}, {"{{agent_name}}"}, {"{{property_address}}"}, {"{{message}}"}, {"{{submit_date}}"}
                </p>
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl text-xs font-bold ${testResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {testResult.msg}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={testingEmail || !emailConfig.serviceId || !emailConfig.templateId || !emailConfig.publicKey}
                onClick={async () => {
                  setTestingEmail(true);
                  setTestResult(null);
                  try {
                    // Save latest config attempt to Firestore first (or log if error)
                    try {
                      await saveEmailSettings(emailConfig);
                    } catch (sErr) {
                      console.warn('Could not save email settings to Firestore, testing directly:', sErr);
                    }

                    const res = await sendAdminNotificationEmail(
                      {
                        title: 'Test Email Notification',
                        agentName: profile?.name || 'Admin Tester',
                        propertyAddress: '123 Main St, Austin, TX (Test)',
                        message: 'This is a test notification from your CDA Request Manager via EmailJS.'
                      },
                      emailConfig,
                      true // isTest mode: ignores enabled checkbox check
                    );

                    if (res.success) {
                      setTestResult({ success: true, msg: 'Test email sent successfully! Check your inbox.' });
                    } else {
                      setTestResult({ success: false, msg: res.error || 'Failed to send test email. Verify Service ID, Template ID, and Public Key.' });
                    }
                  } catch (err: any) {
                    console.error('Test email button error:', err);
                    setTestResult({ success: false, msg: err?.message || 'Unexpected error sending test email.' });
                  } finally {
                    setTestingEmail(false);
                  }
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send size={14} /> {testingEmail ? 'Sending Test...' : 'Send Test Email'}
              </button>

              <button
                type="button"
                disabled={savingEmail}
                onClick={async () => {
                  setSavingEmail(true);
                  try {
                    await saveEmailSettings(emailConfig);
                    setShowEmailModal(false);
                    alert('EmailJS settings saved!');
                  } catch (err) {
                    console.error(err);
                    alert('Error saving EmailJS settings');
                  } finally {
                    setSavingEmail(false);
                  }
                }}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs transition-all shadow-md shadow-blue-200"
              >
                {savingEmail ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
