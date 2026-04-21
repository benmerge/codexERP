import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { Resend } from 'resend';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

const orderStatusFromEmail = process.env.ORDER_STATUS_FROM_EMAIL || 'Orders <ben@mergeimpact.com>';
const orderStatusInternalEmails = (process.env.ORDER_STATUS_INTERNAL_EMAILS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- API Routes ---

// 1. Fetch Inventory from Google Sheets
app.get('/api/v1/test_env', async (req, res) => {
  res.json({
    geminiExists: !!process.env.GEMINI_API_KEY,
    geminiPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : null
  });
});

app.get('/api/v1/data', async (req, res) => {
  try {
    // Override any environment variable with the new working URL provided by the user
    const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbwUjbq7CcJnNOLaMFyordbU9tyZ2DhpSeK7P0E9FFkn5Qbe0gxW7PqM2qQdESgqIjPVGw/exec';
    
    if (appsScriptUrl) {
      // If user provided an Apps Script Web App URL
      const response = await fetch(appsScriptUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!response.ok) throw new Error(`Apps Script returned ${response.status}`);
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('The GOOGLE_APPS_SCRIPT_URL returned an HTML page instead of JSON. Please ensure it is a valid Apps Script Web App URL deployed with access set to "Anyone".');
      }
      
      const text = await response.text();
      try {
        let data = JSON.parse(text);
        // Filter to only include items with a 12-digit UPC
        data = data.filter((item: any) => /^\d{12}$/.test(String(item.id).trim()));
        return res.json({ success: true, data });
      } catch (e) {
        throw new Error(`Failed to parse Apps Script response as JSON. Response started with: ${text.substring(0, 50)}...`);
      }
    }

    // Fallback: Try CSV export if the sheet is public
    const sheetId = '1ycWVA7Wh_y6w1jNSTGIyGPtBG9terllSEoM5XAggvxQ';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    
    const response = await fetch(csvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized: The Google Sheet is not public. Please make it "Anyone with the link can view" or provide a GOOGLE_APPS_SCRIPT_URL.');
      }
      throw new Error(`Failed to fetch from Google Sheets (Status: ${response.status})`);
    }
    
    const csvText = await response.text();
    
    // Google Sheets returns an HTML login page with a 200 status if the sheet is private
    if (csvText.trim().toLowerCase().startsWith('<!doctype html>')) {
      throw new Error('The Google Sheet is not public. Please make it "Anyone with the link can view" or provide a valid GOOGLE_APPS_SCRIPT_URL.');
    }
    
    // Simple CSV parser
    const rows = csvText.split('\n').map(row => row.split(','));
    
    const inventory = rows.slice(1).filter(row => row.length > 1 && row[0]).map(row => {
      return {
        id: row[0]?.trim(),
        name: row[1]?.trim(),
        category: row[2]?.trim(),
        onHand: parseInt(row[3]?.trim() || '0', 10),
        onOrder: parseInt(row[4]?.trim() || '0', 10),
        available: parseInt(row[5]?.trim() || '0', 10),
        currentDemand: row[6]?.trim(),
        imageUrl: row[7]?.trim()
      };
    });

    res.json({ success: true, data: inventory });
  } catch (error: any) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch inventory' });
  }
});

// 2. Shopify Sync (Mocked for now, but structured for real API)
app.post('/api/shopify/sync', async (req, res) => {
  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    
    if (!domain || !token) {
      return res.status(400).json({ success: false, error: 'Shopify credentials missing' });
    }

    // In a real implementation:
    // const response = await fetch(`https://${domain}/admin/api/2024-01/orders.json?status=any`, {
    //   headers: { 'X-Shopify-Access-Token': token }
    // });
    // const data = await response.json();
    
    // For now, we simulate a successful sync
    res.json({ 
      success: true, 
      message: 'Shopify sync triggered successfully',
      syncedOrders: 2,
      syncedCustomers: 1
    });
  } catch (error) {
    console.error('Error syncing Shopify:', error);
    res.status(500).json({ success: false, error: 'Failed to sync Shopify' });
  }
});

// 3. Send Email on "Closed Won"
app.post('/api/email/won', async (req, res) => {
  try {
    const { customerName, company } = req.body;
    
    if (!resend) {
      console.log(`[Mock Email] To: ben@mergeimpact.com, Subject: New Customer Won: ${company}`);
      return res.json({ success: true, message: 'Mock email sent (No API key)' });
    }

    const data = await resend.emails.send({
      from: 'CRM Notifications <ben@mergeimpact.com>', // Using the verified domain
      to: ['Beth@40centurygrain.com'], // Sending to Beth
      subject: `New Customer Won: ${company}`,
      html: `
        <h2>Great news!</h2>
        <p>We just closed a new customer.</p>
        <ul>
          <li><strong>Company:</strong> ${company}</li>
          <li><strong>Contact:</strong> ${customerName}</li>
        </ul>
        <p>Please begin the onboarding process.</p>
      `
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

// 4. Send Email on Order Status Change
app.post('/api/email/order-status', async (req, res) => {
  try {
    const { email, salesRepEmail, customerName, orderId, status } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'No email provided' });
    }

    if (!resend) {
      console.log(`[Mock Email] To: ${[email, salesRepEmail, ...orderStatusInternalEmails].filter(Boolean).join(', ')}, Subject: Order ${orderId} Status Update: ${status}`);
      return res.json({ success: true, message: 'Mock email sent (No API key)' });
    }

    const recipients = Array.from(new Set([email, salesRepEmail, ...orderStatusInternalEmails].filter(Boolean)));
    const data = await resend.emails.send({
      from: orderStatusFromEmail,
      to: recipients,
      subject: `Order ${orderId} Status Update: ${status}`,
      html: `
        <h2>Order Update</h2>
        <p>Hi ${customerName},</p>
        <p>The status of your order <strong>${orderId}</strong> has been updated to: <strong>${status}</strong>.</p>
        <p>Thank you for your business!</p>
      `
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error sending order status email:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

// 5. Process Voice Note with Gemini
app.post('/api/gemini/process-voice-note', async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) {
      return res.status(400).json({ success: false, error: 'Transcript is required' });
    }

    const prompt = `
      You are an AI assistant for MiCRM Pro, an ecosystem management platform used for maintenance, farming, food, conservation, and scientific operations.
      A user just recorded a voice note after a field visit, meeting, or operational task.
      
      Here is the raw transcript:
      "${transcript}"
      
      Please clean up the text, fix any speech-to-text errors, and format it into a professional note.
      If there are clear action items, opportunities, or contextual clues (like inventory needs, environmental data, or task follow-ups), extract them into a bulleted list at the end.
      Keep it concise and professional.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    res.json({ success: true, text: response.text });
  } catch (error: any) {
    console.error('Error processing voice note:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process voice note' });
  }
});

// --- Scheduled Tasks ---
// Cron jobs disabled as per user request
// cron.schedule('0 8,18 * * *', () => {
//   console.log('Running scheduled Shopify sync...');
// });

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
