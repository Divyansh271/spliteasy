import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthGate } from './components/AuthGate';
import { Account } from './pages/Account';
import { GroupDetail } from './pages/GroupDetail';
import { Groups } from './pages/Groups';

export default function App() {
  return (
    <HashRouter>
      <AuthGate>
        <Routes>
          <Route path="/" element={<Groups />} />
          <Route path="/group/:id" element={<GroupDetail />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
    </HashRouter>
  );
}
