/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { 
  FileText, 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  LogOut, 
  Menu, 
  X,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Requests from './pages/Requests';
import CreateRequest from './pages/CreateRequest';
import AdminAgents from './pages/AdminAgents';
import Reports from './pages/Reports';
import Login from './pages/Login';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user, profile, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-slate-500 font-semibold text-sm">Loading application...</p>
      </div>
    );
  }
  
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  
  if (user && !profile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-slate-500 font-semibold text-sm">Loading agent profile...</p>
      </div>
    );
  }
  
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function SidebarLink({ to, icon: Icon, label, active, onClick }: { to: string, icon: any, label: string, active: boolean, onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        active 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </Link>
  );
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, logout } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-100 italic">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-200 not-italic">
                MTR
              </div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight not-italic leading-tight">
                MTR <br />
                <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">CDA Manager</span>
              </h1>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-3 overflow-y-auto">
            <div>
              <p className="px-4 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Main Menu
              </p>
              <div className="space-y-1">
                <SidebarLink 
                  to="/" 
                  icon={LayoutDashboard} 
                  label="Dashboard" 
                  active={location.pathname === '/'}
                  onClick={closeSidebar}
                />
                <SidebarLink 
                  to="/requests" 
                  icon={FileText} 
                  label="CDA Requests" 
                  active={location.pathname.startsWith('/requests')}
                  onClick={closeSidebar}
                />
              </div>
            </div>

            {isAdmin && (
              <div className="pt-2">
                <p className="px-4 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Broker Administration
                </p>
                <div className="space-y-1">
                  <SidebarLink 
                    to="/agents" 
                    icon={Users} 
                    label="Roster Management" 
                    active={location.pathname === '/agents'}
                    onClick={closeSidebar}
                  />
                  <SidebarLink 
                    to="/reports" 
                    icon={BarChart3} 
                    label="Reports" 
                    active={location.pathname === '/reports'}
                    onClick={closeSidebar}
                  />
                </div>
              </div>
            )}
          </nav>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-xs">
                {profile?.name.charAt(0)}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold truncate text-slate-800">{profile?.name}</p>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">{isAdmin ? 'Broker/Admin' : 'MTR Agent'}</p>
              </div>
            </div>
            <button 
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 group"
            >
              <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />
              <span className="text-sm font-medium">Log out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center px-6 sticky top-0 z-30">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 mr-4 text-slate-500 md:hidden hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-800">
              {location.pathname === '/' && 'Broker Dashboard'}
              {location.pathname === '/requests' && 'Relational CDA Requests'}
              {location.pathname === '/requests/new' && 'New File Submission'}
              {location.pathname.startsWith('/requests/edit/') && 'Resubmit CDA Request'}
              {location.pathname === '/agents' && 'Roster Management'}
              {location.pathname === '/reports' && 'Production Analytics'}
            </h2>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement && activeEl.type === 'number') {
        activeEl.blur();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout><Dashboard /></MainLayout>
            </ProtectedRoute>
          } />
          <Route path="/requests" element={
            <ProtectedRoute>
              <MainLayout><Requests /></MainLayout>
            </ProtectedRoute>
          } />
          <Route path="/requests/new" element={
            <ProtectedRoute>
              <MainLayout><CreateRequest /></MainLayout>
            </ProtectedRoute>
          } />
          <Route path="/requests/edit/:id" element={
            <ProtectedRoute>
              <MainLayout><CreateRequest /></MainLayout>
            </ProtectedRoute>
          } />
          <Route path="/agents" element={
            <ProtectedRoute adminOnly>
              <MainLayout><AdminAgents /></MainLayout>
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute adminOnly>
              <MainLayout><Reports /></MainLayout>
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
