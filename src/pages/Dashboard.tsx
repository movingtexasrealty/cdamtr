/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  DollarSign, 
  TrendingUp, 
  FileCheck, 
  Clock,
  ArrowRight,
  Plus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend
} from 'recharts';

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const [stats, setStats] = useState({
    ytdVolume: 0,
    ytdCommission: 0,
    currentMonthCommission: 0,
    activeRequests: 0,
    completedRequests: 0,
    splitContribution: 0,
  });
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;

    // Fetch requests
    const requestsRef = collection(db, 'cdaRequests');
    const q = isAdmin 
      ? query(requestsRef) 
      : query(requestsRef, where('agentId', '==', profile.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentRequests(requests.slice(0, 5));
      
      const active = requests.filter((r: any) => r.status === 'pending').length;
      const completed = requests.filter((r: any) => r.status === 'approved').length;
      
      let sumCommission = 0;
      let sumSplit = 0;
      let sumVolume = 0;
      let monthlyComm = 0;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyValues = months.map(name => ({ name, approved: 0, pending: 0 }));

      requests.forEach((r: any) => {
        const dateStr = r.closingDate || r.createdAt;
        let monthIdx = -1;
        if (dateStr) {
          let date;
          if (typeof dateStr === 'string' && dateStr.includes('-') && !dateStr.includes('T')) {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
              date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            } else {
              date = new Date(dateStr);
            }
          } else {
            date = new Date(dateStr);
          }

          if (date.getFullYear() === currentYear) {
            monthIdx = date.getMonth();
          }
        }

        if (r.status === 'approved') {
          sumCommission += r.agentGrossAmount || 0;
          sumSplit += r.companySplitAmount || r.brokerSplitAmount || 0;
          sumVolume += r.salePrice || 0;

          if (monthIdx !== -1) {
            monthlyValues[monthIdx].approved += r.agentGrossAmount || 0;

            if (monthIdx === currentMonth) {
              monthlyComm += r.agentGrossAmount || 0;
            }
          }
        } else if (r.status === 'pending') {
          if (monthIdx !== -1) {
            monthlyValues[monthIdx].pending += r.agentGrossAmount || 0;
          }
        }
      });

      setStats({
        activeRequests: active,
        completedRequests: completed,
        ytdCommission: sumCommission,
        currentMonthCommission: monthlyComm,
        splitContribution: sumSplit,
        ytdVolume: sumVolume
      });

      setMonthlyData(monthlyValues);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'cdaRequests');
    });

    return () => unsubscribe();
  }, [profile]);

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {profile?.name}</h1>
          <p className="text-slate-500">Here's a summary of your production and requests.</p>
        </div>
        <Link 
          to="/requests/new"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
        >
          <Plus size={20} />
          New CDA Request
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isAdmin ? (
          <>
            <StatCard 
              icon={TrendingUp} 
              label="Cumulative Sales Volume" 
              value={`$${stats.ytdVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              subLabel="YTD approved production"
              color="blue"
            />
            <StatCard 
              icon={DollarSign} 
              label="Cumulative Agent Earnings" 
              value={`$${stats.ytdCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              subLabel="YTD agent distributions"
              color="green"
            />
            <StatCard 
              icon={FileCheck} 
              label="Company Splits Collected" 
              value={`$${stats.splitContribution.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              subLabel="YTD brokerage splits"
              color="orange"
            />
            <StatCard 
              icon={Clock} 
              label="Total Active Requests" 
              value={stats.activeRequests.toString()} 
              subLabel="Awaiting admin approval"
              color="purple"
            />
          </>
        ) : (
          <>
            <StatCard 
              icon={TrendingUp} 
              label="YTD Volume" 
              value={`$${stats.ytdVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              subLabel="Approved sale/lease volumes"
              color="blue"
            />
            <StatCard 
              icon={DollarSign} 
              label="Monthly Earnings" 
              value={`$${stats.currentMonthCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              subLabel="Earnings this calendar month"
              color="green"
            />
            <StatCard 
              icon={FileCheck} 
              label="YTD Cap Remaining" 
              value={profile?.commissionProfile?.isInexperienced 
                ? "Exempt" 
                : `$${Math.max(0, (profile?.commissionProfile?.capAmount !== undefined ? profile.commissionProfile.capAmount : 15000) - stats.splitContribution).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              subLabel={profile?.commissionProfile?.isInexperienced 
                ? "Inexperienced status exempts capping limits"
                : `Paid YTD: $${stats.splitContribution.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of $${(profile?.commissionProfile?.capAmount !== undefined ? profile.commissionProfile.capAmount : 15000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cap`}
              color="orange"
            />
            <StatCard 
              icon={Clock} 
              label="Active Requests" 
              value={stats.activeRequests.toString()} 
              subLabel="Pending broker approval"
              color="purple"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Column */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Production Overview</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  formatter={(value: any, name: any) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name]}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: '10px' }} />
                <Area type="monotone" name="Approved Earnings" dataKey="approved" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorApproved)" />
                <Area type="monotone" name="Pending Earnings" dataKey="pending" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorPending)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Requests Column */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Recent Requests</h3>
            <Link to="/requests" className="text-blue-600 text-sm font-semibold hover:underline">View all</Link>
          </div>
          <div className="space-y-4">
            {recentRequests.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No requests yet.</p>
            ) : (
              recentRequests.map((req: any) => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      req.status === 'approved' ? 'bg-green-100 text-green-600' : 
                      req.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <FileCheck size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 truncate w-32">{req.propertyAddress}</p>
                      <p className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">${(req.agentGrossAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      req.status === 'approved' ? 'bg-green-100 text-green-700' : 
                      req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subLabel, color }: { icon: any, label: string, value: string, subLabel?: string, color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${colors[color]}`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <div className="flex items-baseline gap-2">
            <h4 className="text-2xl font-bold text-slate-900">{value}</h4>
          </div>
          {subLabel && <p className="text-xs text-slate-400 mt-1">{subLabel}</p>}
        </div>
      </div>
    </div>
  );
}
