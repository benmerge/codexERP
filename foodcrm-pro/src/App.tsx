/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Navigate, Routes, Route } from 'react-router-dom';
import { AppProvider } from './data/AppContext';
import { Layout } from './components/layout/Layout';
import { PlatformHome } from './pages/PlatformHome';
import { ManageTools } from './pages/ManageTools';
import { DataCoopHome } from './pages/DataCoopHome';
import { EcoStackHome } from './pages/EcoStackHome';
import { Dashboard } from './pages/Dashboard';
import { CrmCore } from './pages/CrmCore';
import { Customers } from './pages/Customers';
import { Prospects } from './pages/Prospects';
import { KanbanBoard } from './pages/KanbanBoard';
import { Sales } from './pages/Sales';
import { Products } from './pages/Products';
import { Suppliers } from './pages/Suppliers';

export default function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route path="/" element={<PlatformHome />} />
          <Route path="/tools/manage" element={<ManageTools />} />
          <Route path="/data-coop" element={<DataCoopHome />} />
          <Route path="/eco-stack" element={<EcoStackHome />} />
          <Route path="crm" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="core" element={<CrmCore />} />
            <Route path="customers" element={<Customers />} />
            <Route path="prospects" element={<Prospects />} />
            <Route path="kanban" element={<KanbanBoard />} />
            <Route path="sales" element={<Sales />} />
            <Route path="products" element={<Products />} />
            <Route path="suppliers" element={<Suppliers />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AppProvider>
  );
}
