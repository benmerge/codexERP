/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './data/AppContext';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
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
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="customers" element={<Customers />} />
            <Route path="prospects" element={<Prospects />} />
            <Route path="kanban" element={<KanbanBoard />} />
            <Route path="sales" element={<Sales />} />
            <Route path="products" element={<Products />} />
            <Route path="suppliers" element={<Suppliers />} />
          </Route>
        </Routes>
      </Router>
    </AppProvider>
  );
}
