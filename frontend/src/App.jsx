import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Conversations from './pages/Conversations.jsx';
import ConversationDetail from './pages/ConversationDetail.jsx';
import Flows from './pages/Flows.jsx';
import KnowledgeBase from './pages/KnowledgeBase.jsx';
import Links from './pages/Links.jsx';
import Analytics from './pages/Analytics.jsx';
import Settings from './pages/Settings.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner className="h-screen" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/conversations" element={<Protected><Conversations /></Protected>} />
      <Route path="/conversations/:id" element={<Protected><ConversationDetail /></Protected>} />
      <Route path="/flows" element={<Protected><Flows /></Protected>} />
      <Route path="/knowledge-base" element={<Protected><KnowledgeBase /></Protected>} />
      <Route path="/links" element={<Protected><Links /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
